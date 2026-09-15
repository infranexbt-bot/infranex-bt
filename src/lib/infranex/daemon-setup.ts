// DAEMON-SETUP — the one-shot installer command that wraps the generated
// Node Daemon script. Pure string assembly (no React, no DOM) so it can be
// unit-tested outside the browser: bash -n, sandbox runs, etc.
//
// What the installer does on the GPU pod (paste as root):
//   1. writes /root/infranex_daemon.py (heredoc, quoted marker — no expansion)
//   2. systemd present  → installs infranex-daemon.service (Restart=always,
//      WantedBy=multi-user.target → auto-starts on pod reboot), reloads,
//      enables, restarts. Idempotent: re-pasting updates the daemon in place.
//   3. no systemd (RunPod/Vast containers) → replaces any old daemon/watchdog
//      process and relaunches under a bash watchdog loop (auto-restart every
//      15s if the daemon dies). Also survives as long as the container lives.
//   4. prints which launcher it chose: "launcher=systemd" or "launcher=watchdog".

export const HEREDOC_MARK = "INFRANEX_DAEMON_EOF";
const UNIT_MARK = "INFRANEX_UNIT_EOF";

export function buildDaemonSetupCommand(script: string): string {
  return [
    `cat > /root/infranex_daemon.py << '${HEREDOC_MARK}'`,
    script,
    HEREDOC_MARK,
    ``,
    `# --- auto-start service (systemd → watchdog fallback) ---`,
    `if [ -d /run/systemd/system ] && command -v systemctl >/dev/null 2>&1; then`,
    `  cat > /etc/systemd/system/infranex-daemon.service << '${UNIT_MARK}'`,
    `[Unit]`,
    `Description=Infranex Node Daemon (telemetry + approved commands)`,
    `After=network-online.target`,
    `Wants=network-online.target`,
    ``,
    `[Service]`,
    `Type=simple`,
    `ExecStart=/usr/bin/env python3 /root/infranex_daemon.py`,
    `Restart=always`,
    `RestartSec=15`,
    `Environment=PYTHONUNBUFFERED=1`,
    ``,
    `[Install]`,
    `WantedBy=multi-user.target`,
    UNIT_MARK,
    `  systemctl daemon-reload`,
    `  systemctl enable infranex-daemon >/dev/null 2>&1`,
    `  systemctl restart infranex-daemon`,
    `  echo "launcher=systemd — infranex-daemon enabled (auto-starts on boot)"`,
    `else`,
    `  pkill -f infranex_daemon.py >/dev/null 2>&1 || true`,
    `  sleep 1`,
    `  nohup bash -c 'while true; do python3 /root/infranex_daemon.py; echo "[watchdog] daemon exited rc=$? — restarting in 15s" >&2; sleep 15; done' >> /var/log/infranex-daemon.log 2>&1 &`,
    `  echo "launcher=watchdog — no systemd here (container); daemon supervised by a bash watchdog"`,
    `fi`,
  ].join("\n");
}

/** What an operator runs to remove the daemon + its service entirely. */
export const DAEMON_UNINSTALL_COMMAND = [
  `systemctl disable --now infranex-daemon 2>/dev/null; pkill -f infranex_daemon.py 2>/dev/null`,
  `rm -f /etc/systemd/system/infranex-daemon.service /root/infranex_daemon.py /root/.infranex_miner_override`,
  `echo "infranex daemon removed"`,
].join("\n");
