---
Task ID: oom-diagnosis
Agent: main (Super Z)
Task: Diagnose "Application error: a client-side exception has occurred" on preview-chat URL; user asked to "load the web app"

Work Log:
- Ran revival ritual; login 200 but server died between tool calls repeatedly
- dmesg revealed ROOT CAUSE: kernel OOM-kill of next-server (total-vm 65.4GB, anon-rss 2.9GB) — not just the sandbox reaper
- Container limit: 4GB cgroup memory.max, NO swap; fallocate works (swapon untested)
- Server runs in different PID namespace per tool session (ps/pgrep blind; curl works; measured via /proc/meminfo MemAvailable)
- Live-route memory trace: /, /login, /subnets, /subnets/21, /subnets/32, /mining, /wallet, /settings, /validator — all 307/200, memory delta ~0MB, NO OOM during normal traffic
- Login page HTML references current build chunk 8de995cfe1255b63 ✓; DB intact (68 SubnetOverride rows with recommendedGpu)
- server.log pattern: 9 starts / 8 exits "(code 0)" — deaths correlate with session boundaries + historical OOM spike
- Conclusion: user's client-side exception = browser hit a dead server and/or stale pre-rebuild chunks in cache. App build itself is healthy.

Stage Summary:
- App is healthy; no code fix needed for the reported error
- User fix: hard refresh (Ctrl+Shift+R) to drop stale chunks; server revived (login 200)
- OOM risk remains: earlier 2.9GB RSS spike (likely scraper tarball sync) can OOM the 4GB box; candidate mitigation: swap file, cap scraper memory, or heap flag — NOT yet implemented
- Standing: revival ritual at end of every reply; platform cold restart is the only durable fix for sandbox kills
