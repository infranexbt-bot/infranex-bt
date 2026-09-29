#!/usr/bin/env python3
"""Probe testnet subnet seat availability via the app's testnet metagraph API."""
import json
import urllib.request

COOKIE = open("/tmp/infranex-cookies.txt").read() if False else None
# read cookie jar
sess = ""
with open("/tmp/infranex-cookies.txt") as fh:
    for line in fh:
        if "infranex-session" in line or "session" in line.lower():
            parts = line.split()
            if len(parts) >= 7:
                sess = parts[-1]
HEADERS = {"Cookie": f"infranex-session={sess}"} if sess else {}


def probe(netuid: int):
    url = f"http://localhost:3000/api/subnets/{netuid}/neurons?network=test"
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            j = json.loads(r.read())
        if "error" in j:
            return None
        return j
    except Exception:
        return None


def main():
    results = []
    for n in [417, 490, 495, 496, 497, 498, 499, 500, 501, 502, 503, 504, 505]:
        j = probe(n)
        if j is None:
            continue
        line = (
            f"a{n}: {j['registeredUids']}/{j['maxAllowedUids']} reg, "
            f"{j['summary']['earningCount']} earn, block {j['blockNumber']}"
        )
        print(line, flush=True)
        results.append((n, j))
    # also dump which had free seats
    free = [(n, j["registeredUids"], j["maxAllowedUids"]) for n, j in results
            if j["registeredUids"] < (j["maxAllowedUids"] or 9999)]
    print("FREE SEATS:", free)


if __name__ == "__main__":
    main()
