/**
 * LOCALHOST-1 — the Python agent source served to local machines (laptop).
 * Plain stdlib (urllib/hmac/json/subprocess) so it runs on any Ubuntu/WSL2
 * box with zero installs. Served verbatim by GET /api/agent/agent.py —
 * never contains secrets (the enrollment token is passed via argv).
 */
export const AGENT_VERSION = "1.0.0";

export const AGENT_PY = String.raw`#!/usr/bin/env python3
"""Infranex local agent — connects YOUR laptop/PC to the Infranex platform.

Runs on Linux / WSL2 (Ubuntu). Python 3 stdlib only — nothing to install.

  python3 agent.py enroll --server https://YOUR-APP-URL --token TOKEN
  python3 agent.py run

The agent dials the platform OUTBOUND only (no inbound ports are opened),
HMAC-signs every call and pulls its own command queue. Stop with Ctrl-C;
run it inside 'tmux' or 'screen' (or as a systemd user service) to keep it
alive after closing the terminal.
"""
import argparse
import hashlib
import hmac
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

STATE_DIR = os.path.expanduser("~/.infranex-agent")
STATE_FILE = os.path.join(STATE_DIR, "agent.json")
POLL_SECONDS = 15
COMMAND_TIMEOUT = 1800        # 30 min per command (builds/evals can be slow)
OUTPUT_CAP = 65536            # 64 KB per command output
VERSION = "1.0.0"
TLS_INSECURE = os.environ.get("INFRANEX_AGENT_TLS_INSECURE") == "1"

if TLS_INSECURE:
    import ssl
    _CTX = ssl.create_default_context()
    _CTX.check_hostname = False
    _CTX.verify_mode = ssl.CERT_NONE
else:
    _CTX = None


def http_json(server, path, payload, host_id=None, secret=None, timeout=20):
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(server.rstrip("/") + path, data=body, method="POST")
    req.add_header("Content-Type", "application/json")
    if host_id is not None and secret is not None:
        ts = str(int(time.time() * 1000))
        mac = hmac.new(
            secret.encode("utf-8"),
            (ts + "." + path + ".").encode("utf-8") + body,
            hashlib.sha256,
        ).hexdigest()
        req.add_header("x-infranex-timestamp", ts)
        req.add_header("x-infranex-signature", mac)
        req.add_header("x-infranex-host", host_id)
    with urllib.request.urlopen(req, timeout=timeout, context=_CTX) as resp:
        return json.loads(resp.read().decode("utf-8"))


def collect_specs():
    specs = {
        "hostname": platform.node() or "unknown",
        "os": (platform.system() + " " + platform.release()).strip(),
        "python": platform.python_version(),
        "cores": os.cpu_count(),
        "threads": os.cpu_count(),
    }
    try:
        count = 0
        model = ""
        with open("/proc/cpuinfo", "r", encoding="utf-8", errors="replace") as f:
            for line in f:
                m = re.match(r"model name\s*:\s*(.+)", line)
                if m and not model:
                    model = m.group(1).strip()
                if line.startswith("processor"):
                    count += 1
        if model:
            specs["cpuModel"] = model
        if count:
            specs["threads"] = count
    except OSError:
        pass
    try:
        with open("/proc/meminfo", "r", encoding="utf-8") as f:
            for line in f:
                if line.startswith("MemTotal"):
                    specs["ramGb"] = round(int(line.split()[1]) / (1024 * 1024), 1)
                    break
    except (OSError, ValueError, IndexError):
        pass
    try:
        du = shutil.disk_usage(os.path.expanduser("~"))
        specs["diskFreeGb"] = round(du.free / (1024 ** 3), 1)
    except OSError:
        pass
    return specs


def collect_telemetry():
    t = {}
    try:
        la = os.getloadavg()
        t["load1"] = round(la[0], 2)
    except (OSError, AttributeError):
        pass
    try:
        with open("/proc/meminfo", "r", encoding="utf-8") as f:
            info = {}
            for line in f:
                parts = line.split(":")
                if len(parts) == 2:
                    info[parts[0]] = int(parts[1].strip().split()[0])
            total = info.get("MemTotal")
            avail = info.get("MemAvailable")
            if total:
                t["memTotalMb"] = round(total / 1024)
            if total and avail is not None:
                t["memUsedMb"] = round((total - avail) / 1024)
    except (OSError, ValueError, IndexError):
        pass
    temp = None
    for tz in ("/sys/class/thermal/thermal_zone0/temp",):
        try:
            with open(tz, "r", encoding="utf-8") as f:
                temp = int(f.read().strip()) / 1000.0
        except (OSError, ValueError):
            pass
    t["tempC"] = round(temp, 1) if temp is not None else None
    try:
        with open("/proc/uptime", "r", encoding="utf-8") as f:
            t["uptimeS"] = int(float(f.read().split()[0]))
    except (OSError, ValueError, IndexError):
        pass
    return t


def run_command(cmd):
    started = time.time()
    try:
        proc = subprocess.run(
            cmd, shell=True, capture_output=True, text=True, timeout=COMMAND_TIMEOUT
        )
        out = ((proc.stdout or "") + (proc.stderr or "")).strip()
        return {
            "exitCode": proc.returncode,
            "output": out[:OUTPUT_CAP],
            "durationMs": int((time.time() - started) * 1000),
        }, None
    except subprocess.TimeoutExpired:
        return {
            "exitCode": None,
            "output": "TIMEOUT after " + str(COMMAND_TIMEOUT) + "s",
            "durationMs": int((time.time() - started) * 1000),
        }, "timeout"
    except Exception as exc:  # noqa: BLE001 — report any failure to the platform
        return {"exitCode": None, "output": str(exc)[:OUTPUT_CAP], "durationMs": 0}, "failed"


def load_state():
    try:
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def save_state(state):
    os.makedirs(STATE_DIR, mode=0o700, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=STATE_DIR)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(state, f)
    os.chmod(tmp, 0o600)
    os.replace(tmp, STATE_FILE)


def cmd_enroll(args):
    specs = collect_specs()
    payload = {"token": args.token, "specs": specs, "version": VERSION}
    try:
        resp = http_json(args.server, "/api/agent/enroll", payload)
    except urllib.error.HTTPError as exc:
        try:
            detail = json.loads(exc.read().decode("utf-8")).get("error", "")
        except Exception:  # noqa: BLE001
            detail = str(exc)
        print("Enroll FAILED: " + detail, file=sys.stderr)
        sys.exit(1)
    save_state(
        {
            "server": args.server,
            "hostId": resp["hostId"],
            "secret": resp["secret"],
            "name": resp.get("name", args.name or "laptop"),
        }
    )
    os.chmod(STATE_FILE, 0o600)
    print("Enrolled as '" + resp.get("name", "laptop") + "' (host " + resp["hostId"] + ").")
    print("Credentials stored in " + STATE_FILE)
    print("Now run: python3 " + sys.argv[0] + " run")


def cmd_run(_args):
    state = load_state()
    if not state or not state.get("hostId") or not state.get("secret"):
        print("Not enrolled. Run: python3 " + sys.argv[0] + " enroll --server URL --token TOKEN", file=sys.stderr)
        sys.exit(1)
    print("Agent running — polling every " + str(POLL_SECONDS) + "s. Ctrl-C to stop.")
    while True:
        try:
            resp = http_json(
                state["server"],
                "/api/agent/heartbeat",
                {"specs": collect_specs(), "telemetry": collect_telemetry(), "version": VERSION},
                host_id=state["hostId"],
                secret=state["secret"],
            )
            for c in resp.get("commands", []):
                cid = c.get("id")
                cmd = c.get("command", "")
                if not cid or not cmd:
                    continue
                print("[cmd] " + cmd[:120])
                res, err = run_command(cmd)
                try:
                    http_json(
                        state["server"],
                        "/api/agent/results",
                        {"commandId": cid, "status": err or ("done" if res["exitCode"] == 0 else "failed"), **res},
                        host_id=state["hostId"],
                        secret=state["secret"],
                    )
                    print("[cmd] done rc=" + str(res["exitCode"]) + " in " + str(res["durationMs"]) + "ms")
                except (urllib.error.URLError, OSError) as exc:
                    print("[cmd] result upload failed: " + str(exc), file=sys.stderr)
        except urllib.error.HTTPError as exc:
            if exc.code == 401:
                print("Rejected by platform (401) — host may have been revoked.", file=sys.stderr)
                sys.exit(1)
        except (urllib.error.URLError, OSError) as exc:
            print("heartbeat failed: " + str(exc), file=sys.stderr)
        time.sleep(POLL_SECONDS)


def main():
    p = argparse.ArgumentParser(description="Infranex local machine agent")
    sub = p.add_subparsers(dest="cmd", required=True)
    pe = sub.add_parser("enroll", help="exchange a one-time token for agent credentials")
    pe.add_argument("--server", required=True, help="platform base URL, e.g. https://your-app.example")
    pe.add_argument("--token", required=True, help="one-time enrollment token from the app")
    pe.add_argument("--name", default=None, help="optional display name")
    sub.add_parser("run", help="heartbeat + pull + execute commands (long-running)")
    args = p.parse_args()
    if args.cmd == "enroll":
        cmd_enroll(args)
    else:
        cmd_run(args)


if __name__ == "__main__":
    main()
`;
