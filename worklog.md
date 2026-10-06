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

---
Task ID: oom-fix-2.9gb
Agent: main (Super Z)
Task: User asked "did you remove 2.9 GB memory" — implement actual memory guards for the OOM spike

Work Log:
- Root cause chain confirmed: startWorkers() fires ALL 8 workers concurrently at boot (chain sweep 128 subnets + ~100 repo scrapes + devops + benchmarks). Any boot without INFRANEX_WORKERS=off re-arms the 2.9GB storm that the kernel OOM-killed at 15:23 (dmesg evidence).
- Fix 1 (workers.ts MEMORY-GUARD-2): on hosts with os.totalmem() < 6GB, workers now DEFAULT OFF unless INFRANEX_WORKERS=on explicitly. Verified bun os.totalmem() = 3.9GB (cgroup-aware) on this sandbox, so guard triggers. Big hosts keep old default-on behavior.
- Fix 2 (service-health.ts): probeAxon body read capped at 1MB (stream read + cancel) — was unbounded res.arrayBuffer().
- Fix 3 (github-scraper.ts): new boundedText() helper caps both res.text() calls (orgs page + fetchRaw) at 5MB via content-length + string backstop.
- Fix 4 (run-prod-keepalive.sh): bun --smol (low-memory GC mode); RSS watchdog polls every 15s, kills server tree if RSS > 1.8GB for clean self-restart (kernel OOM preempted); 2GB swap attempt (swapon denied in sandbox as expected, .swapfile auto-cleaned).
- Rebuilt (bun run build pass), restarted, verified: login 200, all routes 307/200, memory deltas ~0MB.

Stage Summary:
- 2.9GB storm now impossible to re-arm: RAM-based default-off + env opt-out + bounded fetches + watchdog backstop
- 4 defense layers: (1) RAM guard in startWorkers, (2) INFRANEX_WORKERS=off in keepalive, (3) bounded body reads, (4) 1.8GB RSS watchdog clean-restart
- Note for Oracle VPS deploy: >=6GB RAM host gets workers auto-enabled (os.totalmem() based); set INFRANEX_WORKERS=off there if undesired

---
Task ID: sync-regression-check
Agent: main (Super Z)
Task: User approved ("ok") the post-memory-guard sync-all regression check

Work Log:
- Wrote scripts/verify-sync-regression.ts — direct scrapeGithubMetadata calls on the two corrected repos
- Wrote scripts/mint-session-token.ts — mints a valid admin HMAC session token (APP_SESSION_SECRET from .env) for operator-side API testing
- Scraper regression PASS: SN32 = 24GB/RTX 4090 (source=github, 575ms), SN21 = 0/CPU-only (1217ms) — boundedText fetch path intact
- sync-all API (minted token): HTTP 200 in 0.04s, total=103 skipped=103 scraped=0 errors=0, memory delta +9MB
- DB integrity: SubnetOverride rows intact — SN21(0, CPU-only), SN32(24, RTX 4090), SN54(8, GPU >=8GB required to earn)
- Server again died between tool calls (sandbox behavior) — revived each time; final ritual login 200

Stage Summary:
- No regressions from MEMORY-GUARD-1..4: scraper fetch+parse correct, sync-all route/auth/DB correct, memory flat under both direct and API load
- scripts/mint-session-token.ts is reusable for future authenticated API testing

---
Task ID: clear-unwanted-gb
Agent: main (Super Z)
Task: User asked "did you clear unwanted GB" — measure and clean RAM + disk

Work Log:
- RAM: server dead 3467MB avail vs alive 3336MB = ~131MB warm footprint (vs 2.9GB at OOM). Guards verified holding.
- Disk audit: .next/cache 404K (tiny), server.log 4KB, dev.log ~0 — app itself clean. Found waste: ~/.bun/install/cache 1.1G, ~/.cache/ms-playwright 1.3G, ~/.cache/puppeteer 653M, ~/.npm 298M, pip 68M, node-gyp 67M — none referenced by package.json or src/.
- Cleared all listed caches + tmp test files; kept ~/.cache/prisma (36M, used by project) and ~/.cache/virtualenv.
- df moved 2.5G→2.3G used (overlayfs: image-layer blocks whiteout instead of free) but all cache files confirmed deleted; 7.1G avail now.
- Sandbox killed server between tool calls repeatedly (established pattern); revival ritual each time, final login 200.

Stage Summary:
- RAM answer: yes — server now idles at ~131MB; the 2.9GB storm path is guarded (4 layers from oom-fix-2.9gb).
- Disk answer: yes — ~3.4G of unused caches (playwright/puppeteer/bun/npm/pip/node-gyp) deleted; 7.1G disk free.
- Note: overlayfs means image-layer deletions don't fully return blocks to df; a platform cold start would reclaim everything.

---
Task ID: unwanted-files-cleanup
Agent: main (Super Z)
Task: User asked "so unwanted GB removed? also check if unwanted files and remove it"

Work Log:
- Confirmed prior cache cleanup held (playwright/puppeteer/bun/npm gone, prisma kept).
- Full junk sweep: /tmp — tectonic binary (57MB, stale task leftover), tmp cert.pem + tmp dir (300K), ic.txt..ic5.txt debug chunks, chunks.txt, sn32-mining.md/sn32-readme.md/sn-verify (regenerable research evidence), tarball-extracted LICENSE/README.md, node-gyp temp dirs. Project — dev.log (0B), bt-miner/venv-faucet (200MB, faucet task completed).
- git gc --prune=now: .git 124M → 76M (48M reclaimed).
- Kept: faucet.log (SN89 record), bt-miner/venv + venv312 (active miner work, 431MB combined — venv312 purpose uncertain, flagged to user), upload/ pasted images (user chat content), server.log (active), .chain-metadata.json + .alpha-price-history.json (app data).
- Git mystery: empty status explained — platform auto-committer commits working tree (14 commits ahead of origin, push deferred with PAT rotation).
- Server killed between tool calls again; revival ritual executed, final login 200.

Stage Summary:
- Freed this turn: ~305MB (venv-faucet 200M + tectonic 57M + git gc 48M) + small tmp files
- Session total cleared: ~3.4G caches + ~305MB files + RAM guard stack (2.9GB spike impossible)
- Candidate for future cleanup: bt-miner/venv312 (206MB, purpose unclear — ask user before removing)

---
Task ID: merge-complete-guide
Agent: main (Super Z)
Task: Merge all InfraneX BT PDFs into one complete operator guide (pdf skill, process brief)

Work Log:
- Loaded pdf skill + briefs/process.md; inventoried 16 PDFs, excluded 7 build intermediates (scripts/gpu-research etc.)
- Deduped: devops guide identical x3 (md5 6ef1770aab) -> kept docs/ copy; two CPU guides are DISTINCT docs (23p handbook vs 13p SN6 laptop v2)
- Corpus: 7 docs / 153 content pages; reading order: MVP Arch (50p) -> ArchDoc v2 (15p) -> CPU (23p) -> GPU (27p) -> SN6 v2 (13p) -> Hosting (12p) -> DevOps (13p)
- Built cover + TOC as HTML (scripts/guide-cover.html, guide-toc.html), poster_validate PASS, rendered via html2poster.js (vector)
- Merged with pypdf: bookmarks per part (outline_item), metadata set; QA found page-size inconsistency (sources mix 595.3pt A4 and 595.9pt px-rendered) -> normalized ALL pages to exact A4 (0.1% scale, imperceptible)
- Made TOC clickable: pymupdf text-anchored link annotations, 7/7 rows -> part start pages
- Final QA: WARN only (29 warnings all inherited from source docs: margins, dashes, table centering, 4 sources lack page numbers)
- qpdf linearized; delivered: download/InfraneX-BT-Complete-Guide.pdf (155pp), download/guide-src/*.html, public/guides/ copy (served 200)

Stage Summary:
- ENVIRONMENT EVENT: platform restored sandbox from a snapshot during sleep — lost bt-miner/ (venvs+clone) and download/ contents; dev.log resurrected; core assets (.env, db, .next, worklog, scripts, all source PDFs) survived. Flag to user.
- Deliverable: /home/z/my-project/download/InfraneX-BT-Complete-Guide.pdf + https://.../guides/InfraneX-BT-Complete-Guide.pdf in-app
- Reusable scripts: merge-guides.py (asserts part start pages), make-toc-clickable.py, inspect-guide-pdfs*.py

---
Task ID: merge-guide-restore
Agent: main (Super Z)
Task: User said "load the web app" — revive app; restore + verify the merged guide after snapshot wipe

Work Log:
- Revival ritual: login 200 on first try.
- Found download/ was wiped by the platform snapshot restore (as recorded in merge-complete-guide), but public/guides/InfraneX-BT-Complete-Guide.pdf (7,089,906 B) survived.
- Restored download/InfraneX-BT-Complete-Guide.pdf + download/guide-src/{guide-cover,guide-toc}.html from surviving copies (scripts/*.html).
- Wrote scripts/verify-merged-guide.py (reusable integrity checker). pypdf text-extract hit KeyError:'bbox' font quirk -> switched text check to pymupdf.
- Verification PASS: 155 pages, 7 bookmarks (Part1 p.3 / Part2 p.53 / Part3 p.68 / Part4 p.91 / Part5 p.118 / Part6 p.131 / Part7 p.143), 7 clickable TOC links, uniform exact-A4 pages, metadata intact, no empty pages.
- App serves guide at /guides/InfraneX-BT-Complete-Guide.pdf -> 200.

Stage Summary:
- Deliverable fully restored: download/InfraneX-BT-Complete-Guide.pdf (155pp) + HTML sources.
- Verify script persisted at scripts/verify-merged-guide.py for future restores.

---
Task ID: prod-build-restore
Agent: main (Super Z)
Task: "load the web app" — found snapshot restore wiped .next prod build; rebuilt

Work Log:
- Symptom: app answered 200 but keepalive log showed "Module not found .next/standalone/server.js" — zombie process serving from memory, prod build gone (snapshot restored older FS state during freeze).
- .next/ only contained dev/; BUILD_ID missing.
- Rebuilt: bun run build -> exit 0 (build.log clean, standalone + static + public copied).
- Killed zombie next-server/dev + stale keepalive; fresh keepalive boot: Ready in 323ms; login 200, guide 200.
- download/ checked; re-restored from public/guides/ if wiped.

Stage Summary:
- Fresh prod build deployed; zombie risk eliminated; app + merged guide both serving.

---
Task ID: cpu-earnings-research
Agent: main (Super Z)
Task: User asked to research/analyze if CPU mining can earn good TAO (49 CPU subnets claim)

Work Log:
- Found DB subnet tables empty post snapshot-restore (chain sweep data was in-memory) -> pulled LIVE chain snapshot via /api/network with minted session cookie (block 9193840, TAO=$310.30, 129 subnets).
- Built scripts/cpu-earnings-analysis.py: parses SUBNET_JOBS_SEED (129 curated entries) -> hardware classification (69 GPU / 27 non-GPU-service / 17 CPU+cpu-maybe / 16 n-a) -> joins live metrics (minerEmissionTaoPerDay, rewardedMiners, burn, alpha price).
- Fixed two math misreads: incentiveMedianShare is median/mean RATIO (capped 1.2) not a share; top10IncentiveShare is top-10% of UIDs. Rows saved to scripts/cpu-earnings-rows.json.
- Flagged data caveats: rewarded=1 whale-concentration rows (median=whale take), alpha->TAO pool-price overstating realized value, alphaPriceChange24h showing impossible -290%/+800% (field quirk).
- Web search cross-checks: TAO ~$301-310 confirmed; post Dec-2025 halving 3,600 TAO/d base; mid-pack GPU miner nets -$50..+$500/mo (misar.blog); competition winners ~5 TAO/d (reddit).

Stage Summary:
- Verdict delivered: CPU viable as zero-capex learning/earning path, realistic $0.1-5/d new-miner, top-skill niches higher; GPU pools 10-50x larger.
- Reusable: scripts/cpu-earnings-analysis.py + cpu-earnings-rows.json (rerun after any fresh /api/network pull).

---
Task ID: cpu-earnings-research
Agent: main
Task: Research + analyse TAO earning potential of CPU mining across the 49 CPU-only subnets

Work Log:
- Revived prod server (login 200)
- Confirmed exactly 49 cpu-only subnets in src/lib/infranex/compat-seed.ts
- Web search: TAO ~$305; halving Dec 2025 -> ~3,600 TAO/day network emission; TaoFlow (Nov 2025) zeroes negative-inflow subnets
- Scraped taostats.io/subnets embedded react-query payload -> live alpha prices + emission_enabled for all 128 subnets (timestamp 2026-10-02T08:23Z)
- Built scripts/cpu-scan.ts (bun + app's @polkadot/api): live chain scan of 49 subnets at block ~9,193,950 — registered UIDs, incentive vectors, subnetTaoInEmission
- Cross-validated SN107 subnetTaoInEmission (0.01253 TAO/blk) == taostats emission (exact match)
- Read recycleOrBurn/burn for entry costs (scripts/cpu-recycle.json)
- Merged analysis scripts/cpu-earnings-analysis.py -> scripts/cpu-earnings-merged.json + download/cpu-subnets-earnings-snapshot.csv
- Fixed units bug (rao vs TAO) in per-miner percentile math; re-ran scan

Stage Summary:
- All 49 CPU subnets currently emission-enabled; combined pool 265 TAO/day (~$81k) = 7% of network
- Best CPU pick: SN107 Minos (#3 subnet on entire network, open slots 100/256, median earner ~$112/day)
- Flat/fair subnets: SN5 Hone, SN83 CliqueAI, SN61 RedTeam, SN41 Almanac ($5-12/day median)
- Traps: 1-5 earner subnets and ~10 near-zero pool subnets; SN13 Data Universe pool collapsed to ~$12/day
- Verdict delivered in simple English: CPU mining = low-cost learning + modest side income, not GPU-level money; SN107 first target

---
Task ID: revival-1004b
Agent: main
Task: Load the web app (routine revival)

Work Log:
- Ran keepalive ritual: login 200, guide 200, home 307 (redirect to login, normal)
- Snapshot had wiped download/ again (ls failed)
- Restored: InfraneX-BT-Complete-Guide.pdf from public/guides/, cover/toc HTML from scripts/, rebuilt cpu-subnets-earnings-snapshot.csv from scripts/cpu-earnings-merged.json

Stage Summary:
- App healthy: login 200, guide 200
- download/ fully restored (PDF 7,089,906 B + CSV + guide-src HTML)

---
Task ID: revival-1005a
Agent: main
Task: Run the web app (routine revival)

Work Log:
- Keepalive ritual: login 200, guide 200
- download/ wiped by snapshot again; restored PDF from public/guides/, HTML from scripts/, CSV rebuilt from scripts/cpu-earnings-merged.json

Stage Summary:
- App healthy (login 200, guide 200); download/ restored (PDF + CSV + guide-src)

---
Task ID: sn105-beam-research
Agent: main
Task: Explain SN105 Beam (dashboard tile), real-world users, GPU miner guidance

Work Log:
- Revived server (login 200)
- Live chain read block 9,215,024: SN105 full 256/256, 239 earning UIDs, taoIn 0.001343 TAO/blk -> subnet pool 9.67 TAO/day, miner pool 3.96 TAO-equiv/day, median earner 0.0047 TAO (~$1.44/day), p90 ~$20/day, top ~$23/day, burn 0.00058 TAO
- Fetched Beam-Network/beam README + docs/worker.md + docs/orchestrator.md (raw.githubusercontent): Go 1.24+ orchestrator+worker, BeamCore (beamcore.b1m.ai) registration, capabilities = transfer.multipart / room.transfer E2EE / storage probe — BANDWIDTH network, NO GPU requirement anywhere
- App seed (subnet-jobs-seed.ts 105): "Bandwidth/node provisioning", no hardware reqs documented -> dashboard "RTX 4090 24GB" label is a miner-score GPU-class misclassification
- "PRIME" = mine-pick conviction band >=65 (40% rent-earn + 35% diligence + 25% confidence) based on cached emission numbers (64.33 TAO/day extract) that today's live chain no longer shows (3.96 TAO/day miner pool) — TaoFlow swing flagged

Stage Summary:
- Beam = encrypted data-transfer/bandwidth network for AI agents (courier model), team-run BeamCore, demand side unproven publicly, emissions fund rewards
- Verdict: do NOT rent a 4090 for Beam; run as cheap VPS side-experiment at most ($1.44/day median vs $20-30/mo VPS); GPU money better spent on GPU-work subnets (offer live GPU scan next)

---
Task ID: sn105-4090-label-fix
Agent: main
Task: Explain why Dashboard showed "SN105 Beam — Typical GPU RTX 4090 24GB" and fix the mislabel

Work Log:
- Traced display string: subnet-chooser.tsx renders `recommendedGpu · minVramGb+`; dashboard label "Typical GPU" = hardwareClassified && !requirementsSource (honest-guess label)
- Root cause found: miner-score.ts CATEGORY_RULES keyword classifier — SN105 on-chain identity description "Decentralized bandwidth. A global network. Powering the open internet." matches /\bbandwidth\b/ in the generic "Compute sharing" rule -> GPU_TIERS.consumer24 = "RTX 4090 24GB", minVram 24, $260/mo rent
- Proof: ran real classifySubnetHardware on the chain text (scripts/sn105-classifier-test.ts) -> RTX 4090; control text without "bandwidth" -> CPU VPS
- Chain-audited blast radius (scripts/sn105-bandwidth-diff.mjs, all 129 identities): ONLY SN105 matches bandwidth/depin/network-sharing without a GPU word; 10 other compute-share subnets unaffected
- Fix: inserted "Bandwidth / DePIN node" rule (-> GPU_TIERS.cpu, $50/mo) before Compute sharing, with negative lookahead guard for gpu/inference/training/video/image/render/llm texts
- UI labels: dashboard-view.tsx + opportunity-detail.tsx — minVramGb===0 now renders "Typical hardware" / "Hardware (repo)" instead of "Typical GPU" / "GPU required"; VRAM sub-line hides on 0
- Rebuilt (bun run build), killed zombies, restarted keepalive (login 200)
- End-to-end verify (scripts/sn105-verify-api.ts: admin login from 0600 mirror -> /api/network -> mergeOpportunities): SN105 = "Bandwidth / DePIN node", "CPU VPS", minVram 0, gpu cost $50/mo; SN64 Chutes control unchanged (RTX 4090 24GB)

Stage Summary:
- Answer: the 4090 was NEVER Beam's requirement — one keyword ("bandwidth") in a work-type classifier bucketed Beam with GPU compute-sharing subnets; the old "Typical GPU" tooltip already flagged it as a guess, now the guess is removed
- Beam tile now reads: Typical hardware — CPU VPS (matches Beam docs: Go orchestrator+worker, bandwidth work, no GPU)
- Scripts kept: sn105-classifier-test.ts, sn105-bandwidth-diff.mjs, sn105-verify-api.ts, sn105-chain-debug.mjs, sn105-db-check.py

---
Task ID: beam-discussion
Agent: main
Task: Deep-dive discussion on SN105 Beam (user asked "discuss more about Beam")

Work Log:
- Fresh chain read block 9,215,919-921 (scripts/sn105-live-now.mjs): 256/256 seats FULL, 247 UIDs earning (96%), burn 0.0005 TAO, taoIn 1.349M rao/blk = 9.71 TAO/day TAO-side, active-flag vector mostly false (10 true — flag semantics unclear, do not trust)
- App /api/network (block 9215921): movingPrice 0.0268 TAO/alpha ($8.17), rewardedMiners 239, minerEmissionTaoPerDay 79.23 TAO-equiv, subnetTao pool 5,040 TAO
- UNIT WARNING (unresolved): raw emission(N) sum 295k rao vs app 79 TAO/day inconsistent under all unit assumptions tried (rao/blk, rao/epoch); /api/network likely serves ChainSnapshot-cached value. App emission math (chain.ts 626-694: epoch totals /tempo ×price) does NOT reproduce 79.23 from live vec. Paper-USD for Beam swings 100x+ by read path -> treat all $ estimates as unreliable until a dedicated units audit; SOLID facts = seats, earn-spread, burn, pool size
- Web research: found starfrich/beam GitHub (fuller README) + starfrich.me Beam Worker guide (3rd-party = real operators), subnetradar listing, gridinsoft b1m.ai trust 72/100 ("legitimate, few caution points"). NAME CONFUSION: Beam BEAMX L1 + Beam payments (Modern Treasury) are UNRELATED
- Architecture confirmed from README: Client->BeamCore (team-run coordinator, beamcore.b1m.ai) -> stake-weighted assignment to Orchestrators (miners) -> Workers move chunked data (S3/GCS/Azure/R2/IPFS/HTTP) -> Proof-of-Bandwidth -> validators read proofs, set weights. MCP integration for AI agents. Testnet = SN304 beamcore-dev.b1m.ai

Stage Summary:
- Beam = marketplace for BANDWIDTH (compute and storage have markets, bandwidth doesn't — their thesis); miners = orchestrator+worker Go binaries; income driven by stake-weight + transfer performance, NOT GPU
- Demand side still team-run (BeamCore) with no public paying customers; rewards funded by emissions
- Practical path: test free on testnet 304 first; mainnet entry burn only 0.0005 TAO but seats full
- OPEN TODO: emission-units audit for SN105 (app cache vs live vec vs taoIn)

---
Task ID: cpu-miner-explain
Agent: main
Task: Explain what InfraneX BT does for a CPU miner + what to do after starting one

Work Log:
- Checked DB state: DaemonState, WorkerStatus, LocalHost, MinerLog ALL 0 rows -> no machine enrolled, no miner actually running yet
- Mapped CPU flow from code: CPU Catalog two branches — (1) rent Hetzner/DO box via /api/cpu-provision (live offer resolve, CPU floor check, GPU-subnet refusal, cloud-init docker/python/bittensor, GpuHost registration, staged install plan), (2) local machine $0 path (enroll token -> curl agent in WSL2/Ubuntu -> agent dials home -> "Start CPU miner" jumps to Deploy stepper with SN67 Harnyx + machine preselected)
- Deploy stepper STEPS: 1 Subnet -> 2 Compute -> 3 Deploy -> 4 Go live; install plan approval-gated in DevOps Engine (wallet files + miner launch steps need explicit approve; nothing registers on-chain without it)
- Post-launch machinery: DaemonState telemetry + MinerLog streaming, UidSnapshot chain tracking, Monitoring alerts/autopilot, Analytics EarningsDaily vs SpendLedger

Stage Summary:
- User has NOT started a miner yet despite UI familiarity — answer = feature map + concrete next-steps checklist (enroll machine -> stepper -> approve wallet+launch in DevOps -> watch logs/UID/earnings)
- Best CPU pick baked into UI: SN67 Harnyx (117 rewarded miners, ~$11.62 burn, py3.11)

---
Task ID: beam-practical-earnings
Agent: main
Task: Practical (realizable) earnings for SN105 Beam, vs paper dashboard numbers

Work Log:
- Definitive live read block 9,216,045 (scripts/sn105-practical-earnings.mjs): tempo 360, taoIn 0.001467 TAO/blk = 10.56 TAO/day subnet injection; burn 0.0005; pool TAO side 5,040.8, alpha side 829,175; 248/256 earning
- REAL alpha price from pool ratio = 5040.8/829175 = 0.006079 TAO ($1.85) — direct subnetMovingPrice storage returned 0; app's earlier $8.17 movingPrice is stale/pumped EMA cache (units-audit TODO stands: app minerEmissionTaoPerDay 79.23 vs taoIn-anchored 4.33 TAO/day miner cohort)
- Distribution: incentiveMedianShare 0.285 (median earner = 28.5% of mean), emissionTop10Share 0.677 (top 10% of UIDs take 68% of emission — whale-lean, matches BeamCore stake-weighted assignment)
- PRACTICAL math (method cross-validated on SN107 in CPU scan): miner cohort 41% x 10.56 = 4.33 TAO/day = $1,317/day across 248 earners -> mean $5.31/day, median $1.51/day, new entrant (stake-weighted, 0.3-0.7x median) $0.45-1.06/day
- Paper check: alpha emission per-epoch semantics = 5,904 alpha/day (0.71% of pool/day, plausible) -> 35.9 TAO/day paper at current price, still 3.4x daily buy inflow -> per-epoch semantics likely correct for vec; per-block (2.1M alpha/day) impossible
- Net after VPS $0.17-0.50/day: ~$0-1/day practical for a low-stake new seat

Stage Summary:
- Beam practical earnings: ~$0.5-1.5/day gross median-new seat, ~break-even net. Dashboard ~$100/day mean is paper (stale price + unrealizable into 5,040 TAO pool)
- Root cause of gap: whale-lean distribution + small pie (10.56 TAO/day whole subnet) + stake-weighted queue
- Comparison anchors: SN107 Minos ~$112/day median (CPU), SN67 Harnyx app pick; Beam = testnet learning, not income

---
Task ID: beam-honest-dollars
Agent: main
Task: Fix the dashboard's stale price/units so Beam (SN105) shows honest dollars

Work Log:
- Ran on-chain units audit (scripts/sn105-units-audit.mjs): Emission vec sum = 295.2e9 rao = 295.2 alpha/epoch (NOT 295k rao — earlier reading was a script bug); taoInEmission = 0.0014797 TAO/blk matches measured subnetTAO flow to 5 digits = 10.65 TAO/day sustainable inflow
- Cloned subtensor source (sparse) and read coinbase/run_coinbase.rs + swap/pallet/impls.rs + staking/stake_utils.rs: pools are weighted balancers (balancer.calculate_price), DynamicInfo.emission is hardcoded 0 (dead field), SubnetMovingPrice EMA sits 4.28-4.36x ABOVE the swap engine's tradeable price for EVERY subnet (stale-EMA artifact, scripts/sn105-true-price.mjs + sn105-price-calibrate.mjs)
- Root cause of inflated Beam dollars: app priced miner alpha rewards (2952 alpha/day) at the stale EMA (0.0268) instead of the swap-engine price (0.00617) -> 79.23 TAO/day minerEmissionTaoPerDay, ~$3,000/mo gross per earning miner shown (4.34x + median-share inflated)
- Also found the app's getAllDynamicInfo parse silently failed (raw codec property access) -> taoIn pool overrides never applied; SN105 pool showed 5,040 instead of 5,078 TAO
- Fixed src/lib/infranex/chain.ts: (1) new swapRuntimeApi.currentAlphaPriceAll() map = honest alpha price, used for emission math + display; EMA kept as emaMovingPrice reference field; (2) getAllDynamicInfo moved before batch loop, parsed via toHuman() with comma/bits handling; feeds taoIn pool override + new taoInflowTaoPerDay field (taoInEmission x 7200 = sustainable TAO inflow); (3) price-history file bumped to v2 wrapper - old EMA-scale samples discarded so 24h trend never mixes scales
- Rebuilt, restarted, verified via scripts/honest-units-verify.ts (login -> /api/network -> mergeOpportunities): SN105 alpha price $1.88 (was $8.17), taoInflow 10.67 TAO/day, per-earning mean 0.0762 TAO/day, gross $185/mo, net $55/mo; SN64 sanity $21.76/alpha; SN1 pool 23,154 TAO (DynamicInfo parse now works)

Stage Summary:
- Honest pricing basis: alpha rewards valued at swap-engine tradeable price; SubnetMovingPrice EMA quarantined as reference-only (4.3x stale network-wide)
- SN105 dashboard now shows: $1.88/alpha, $185/mo gross, $55/mo net (CPU VPS path), 10.67 TAO/day subnet TAO inflow (dilution context)
- New live fields available: emaMovingPrice, taoInflowTaoPerDay
- Open follow-up (out of scope): src/lib/devops/subnet-requirements.ts ~line 546 multiplies a TAO/day figure by 730 (hours-month) for a USD fallback - units wart, affects devops tier hints only

---
Task ID: honest-dollars-all-subnets
Agent: main (Super Z)
Task: "i want you to check this for all subnets and fix the issue" — extend the Beam honest-dollars fix (stale price/units) to every subnet

Work Log:
- Wrote scripts/all-subnets-units-audit.mjs: independent chain recompute for ALL 129 subnets (swap prices, DynamicInfo, emission/incentive/dividends vecs, tempo, EMA) diffed against /api/network
- Audit findings: (1) swap-engine price covers 129/129 subnets — zero stale-EMA (4.3x) fallbacks left; (2) app pipeline matched recompute exactly; (3) NEW issue found: α rewards valued at infinitesimal spot price overstate what thin-pool subnets can realize — 59/129 subnets >3x dilution (paper miner value vs real TAO inflow), worst SN101 139,000x, SN2 13,000x; deep pools (SN64 3.1x, ~0.2%/day drain) unaffected
- Read cloned subtensor swap balancer source: sell formula Δy = y·(x/(x+Δx))^r, weights never far from 0.5 → avg realizable price = y/(x+q)
- Fixed chain.ts: new live fields realizablePriceTao / rewardRealizability (poolTao/(poolAlpha+5904 α/day) ÷ spot, only on honest swap price) + dilutionRatio (emissionTaoPerDay ÷ taoInflowTaoPerDay); DynamicInfo alphaIn map added
- Fixed miner-score.ts: ledger revenue (perRegistered, perEarning, expected, grossMonthlyUsd) now valued at realizable price; diag + realizableAlphaPriceUsd; dailyAlpha kept physical α for slippage
- Fixed live-merge.ts + types.ts passthroughs (realizableAlphaPriceUsd, rewardRealizability, dilutionRatio)
- Fixed subnet-requirements.ts ×730 wart → ×30 days × live TAO/USD
- Fixed monitoring.ts fake $256 price fallback → null USD when no price (honest "—")
- Fixed miner-mindset.ts arbitrage yield + cpu-guide-view.tsx Miner emission Stat to realizable basis
- UI: opportunity-detail.tsx shows "realizable $X · N% of spot" (<90%) + "TAO inflow backs N% of paper value" (amber >50x, muted 2-50x); opportunity-table.tsx tooltip append
- Rebuilt ×2 (first restart was a no-op — keepalive loop held port; pkill + fresh restart), verified: tsc clean, audit "no material diffs", honest-dollars-all-verify.ts green

Stage Summary:
- All 129 subnets now show realizable dollars: SN105 $1.88→$1.87/α (99.3%), SN64 $21.87→$21.82 (99.8%), biggest haircut SN116 91.6%
- Deep-pool control: all >50k TAO liquidity ≥99.65% realizability (haircut provably harmless to healthy subnets)
- 4/128 rows null realizability (dust pools) → treated as 1
- New scripts: all-subnets-units-audit.mjs, honest-dollars-all-verify.ts
- Beam practical earnings unchanged: newcomer ~0.020 TAO/d ≈ $185/mo gross, $55/mo net (CPU VPS path)

---
Task ID: demand-reality-column
Agent: main (Super Z)
Task: Build the "Demand Reality" score+column (user said "yes" to the plan after the all-subnets honest-dollars fix was confirmed live)

Work Log:
- Confirmed honest-dollars-all-subnets fix still live via honest-dollars-all-verify.ts (network 200 live block 9217747, 128 opps, SN105 $1.78→$1.77 99.3%, deep pools ≥99.6%, 4 null dust pools)
- types.ts: DemandPart + DemandBand interfaces, Opportunity.demandScore/demandBand/demandParts
- miner-score.ts: computeDemandReality() — 4 on-chain signals, published weights: 40% staking inflow vs payout (dilutionRatio, 100-75*log10 scale), 25% α 24h trend (50+2.5Δ), 20% pool depth vs reward flow (slippage, 95-250·s), 15% seat productivity (rewardedRatio + full-slot bonus). Missing input → weight renormalized, never fabricated 50. Bands: ≥65 real-demand / ≥40 mixed / <40 emission-funded. Wired into scoreMinersLedger diag
- live-merge.ts: passthrough of the 3 demand fields
- opportunity-table.tsx: sortable "Demand" column (score + colored dot, band tooltips) between Net Monthly and Alpha 24h; colSpan 13→14
- opportunity-detail.tsx: "Demand reality" section before Score breakdown — band badge, score/100, 4 progress bars with weights + raw detail strings, honest disclaimer that off-chain product usage is invisible on-chain
- Rebuilt, pkill+fresh restart (keepalive holds port otherwise), verified scripts/demand-reality-verify.ts: 0 sanity violations, 128/128 scored; distribution 4 green / 86 amber / 38 red
- Visual verified via agent-browser: table column + Beam detail dialog (66, badge, bars) render correctly

Stage Summary:
- Live results: KubeTEE 68.8 / Beam 66.4 / CliqueAI 66.3 / LongShort 65.8 = only green subnets; SN35 29.1 / Enigma 33.1 worst reds; Chutes 51.8 amber (6.1x dilution + 27% slots earning)
- KEY CAVEAT (matches user's quoted finding): on-chain signals alone cannot see off-chain product customers — Beam scores green on-chain (tiny payout → perfect realizability + full seats) while Chutes (real product) scores amber (huge emission vs inflow + whale-lean seats). Column is a filter, detail parts are the evidence, product-site check is the follow-up
- Beam practical earnings unchanged: newcomer ~0.021 TAO/d, $189/mo gross, $58/mo net (CPU VPS)
- New scripts: demand-reality-verify.ts; screenshots verify-demand-*.png

---
Task ID: sn116-nogo-explain
Agent: main (Super Z)
Task: User asked why SN116 Carbon shows NO-GO despite $10,528/mo net profit PASSED

Work Log:
- Traced NO-GO to mine-pick.ts (Dashboard "Choose your subnet" picker): hard gates = !rent.rentable OR diligence DO-NOT-PROVISION OR meetsMinimum false, else conviction bands (PRIME≥65/READY≥50/MARGINAL≥35/NO-GO)
- Wrote scripts/sn116-nogo-diagnose.ts — ran rent-earn + 14-stage diligence + mine-pick on live merged row
- Root cause: 2 diligence hard fails. Stage 7 Competition: rewardedRatio 2.2%, top10 take 100% (knife fight — ~5 UIDs take all rewards). Stage 10 Liquidity: pool 1,529 TAO, exit slippage 7.0% > 5% threshold. Verdict DO NOT PROVISION → conviction capped 30 → NO-GO
- Reconciled the two numbers: $10,546/mo is the MEAN over the 2.2% of UIDs that earned (whales); new-entrant EV = net × rewardedRatio × medianShare = $232/mo ceiling; month-1 earn chance 1%; ramp ~11.9wk. Rent-earn: knifeFight+whaleMean, band NO score 23
- Also: GPU H200 141GB is a revenue-based estimate (requirementsSource null, workload unclassified); demand 62.7 mixed; alpha +11.4% 24h

Stage Summary:
- NO-GO ≠ unprofitable — profit math and reachability are separate engines; the $10.5k belongs to incumbent whales, a newcomer's EV is ~$232/mo
- Flip conditions: top10 take <75%, rewardedRatio ≥~10%, pool depth/slippage green (liq >500 TAO, slip <5%)
- Script kept: scripts/sn116-nogo-diagnose.ts (works for any netuid with a small edit)

---
Task ID: sn61-redteam-analysis
Agent: main (Super Z)
Task: User asked to analyse SN61 RedTeam: what it does, profitability, expected earnings, CPU miner feasibility.

Work Log:
- Revival ritual first: login: 200
- scripts/sn61-analysis.ts: pulled SN61 full row from /api/network (block 9,217,977, TAO $298.54)
- App data: rank #1 (score 70.3, risk low), gross $1,197/mo, net $1,058/mo, verdict PROFITABLE, break-even 61 d
- Scenarios: bear $220/mo net (8-wk ramp + alpha -40%), base $1,058, bull $2,118 (mean of today's earners)
- Subnet FULL 256/256, rewardedRatio 50.4%, earnChance medium 35%, demand 56.9 mixed (6.0x dilution), realizability 99.5%
- Web cross-checks: bittensor.ai/61 (Innerworks bot-detection marketplace feature list), subnetradar.com/mining/61 (129/243 active, GEMINI_API_KEY needed, always-on, port 10001, 13 validators, 0% burn), weex news (bot detection accuracy 74.3% -> 99.5%)
- Verified requiredStake meaning in live-merge.ts: subnetTao/minersCount = 54.4 TAO subnet-average stake (not an entry fee)
- Cross-check passed: 129 earners x 0.252 TAO/day mean = 32.5 TAO/day = 1.10% emission x ~41% miner share

Stage Summary:
- SN61 = Innerworks decentralized bot-detection / security-challenge marketplace; real off-chain product + enterprise challenge sponsorship
- CPU-mineable (minVramGb 0, CPU VPS, container class); entry needs: hotkey reg (~0.087 TAO burn), CPU VPS port 10001, GEMINI_API_KEY, 8-wk validator ramp
- Key risk: subnet full -> must displace incumbent; 50% of slots earn; skill-bound (coding challenge quality), not hardware-bound
- Answer delivered with scenario table + start checklist; no code changes

---
Task ID: sn61-challenge-examples
Agent: main (Super Z)
Task: User asked for concrete examples of SN61 RedTeam challenges and how a miner builds a solution.

Work Log:
- Fetched all 3 docs challenge pages (AB Sniffer v5, Humanize Behaviour v5, ADA detection)
- Found live ground truth: src/redteam_core/challenge_pool/active_challenges.yaml on main (v4.10.9, updated today) = bex_tracer_v1 (weight 0.4) + ada_detection_v3 (weight 0.6); miner container limit 4 CPU / 12 GB
- Docs paths in repo 404 (repo restructured); challenges now in submodule repos (ada-detection-challenge, bex-tracer-challenge)
- Pulled real example code from RedTeamSubnet/ada-detection-challenge examples/miner_commit: app.py (FastAPI /health + /solve), data_types.py (MinerInput/MinerOutput, 500-line cap), commit/headless.js (real detection logic), README build pipeline
- Saved: scripts/ada-app.py, ada-datatypes.py, ada-headless.js, ada-readme.md
- Delivered plain-English explanation with live code walkthrough

Stage Summary:
- ADA = commit JS detectors per anti-detect browser (ads_power/gologin/multilogin/dolphin_anty/octo/headless), boolean answers, human collisions -> 0
- Humanize = opposite: write a bot that fills a form human-like (9 behavioral criteria, bezier detection)
- AB Sniffer = name the automation framework among 8 targets across 27 sessions
- User got concrete build pipeline: eslint -> uvicorn 10002 -> docker build/push -> active_commit.yaml
- No code changes to app; worklog only

---
Task ID: gpu-options-scan
Agent: main (Super Z)
Task: Non-technical user asked which subnets suit him and whether buying RTX 4090 / A100 for GPU mining works.

Work Log:
- Revival ritual login: 200
- scripts/gpu-options.ts: scanned all 128 subnets via /api/network (block 9,218,120, TAO $297.5)
- 107 need GPU; only 16 fit 24GB; 91 need >24GB (mostly 80GB or 141GB multi-GPU)
- Top 24GB fits: SN64 Chutes net $6,056/mo (3% earn chance), SN4 Targon $2,022 (1%), SN17 404-GEN $523 (0%), SN25 UR $514 (0%), SN51 lium.io $131 (11%)
- 80GB-class (A100): SN95 Actual $1,609 (0%), SN53 engy $1,203 (2%), SN110 Green Compute $72 (0%)
- 141GB-class dominates top nets (Carbon $10.4k, KubeTEE $5.5k) but earn chances 1-2%
- Server check: sandbox 2 vCPU / 3GB RAM - cannot host SN61 miner locally
- Delivered: 4090-yes/A100-no verdict, rent-first plan (Vast.ai), India electricity note, entry-odds honesty

Stage Summary:
- GPU does not remove skill barrier; earn-chance 0-3% on top GPU subnets = full of pro operators
- Recommendation: rent 4090 first, test Chutes/Targon 2-4 weeks, buy only after validated earnings
- A100 rejected for beginner: expensive, fits fewer subnets with 0-2% earn chance, no resale market

---
Task ID: miner-fit-wizard
Agent: main (Super Z)
Task: User approved "build it" - build the Miner Fit wizard (personal advisor) into InfraneX.

Work Log:
- Loaded fullstack-dev skill; studied app architecture (ViewKey single-page views, useNetwork hook, mergeOpportunities client-side)
- Created src/lib/infranex/miner-fit.ts: fit engine (4-input profile: techLevel/hardware/budget/hoursPerWeek) with hard gates (VRAM, skill-class via workType keywords, monthly cost vs budget cap, passive+red-demand decay, profit verdict, entry<3% crowded) + fitScore re-rank (55% app score, entry odds, demand band, risk, net) + verdicts fit/stretch/excluded + "what it takes" card + staking baseline note
- Created src/components/views/fit-view.tsx: 4-question wizard (progress dots, option cards), results view (top fits, stretch, honest exclusions, bar-to-beat card), localStorage profile restore with deferred setState
- Wired: types.ts ViewKey + "fit"; sidebar Intelligence nav "Miner Fit 01b" (UserCheck icon); page.tsx VIEW_META + FitView render with onSelectOpportunity/onStartMining
- Fixed during verification: (1) crowded blocker computed after verdict -> moved before; (2) capital line used alphaPriceUsd instead of TAO price -> added taoPriceUsd param (SN61 stake now honestly $16,270 not $180); (3) lint react-hooks/set-state-in-effect -> deferred restore pattern
- Verified via scripts/miner-fit-verify.ts: NON-TECH profile = 0 fits (honest, staking note shown); BASIC+4090 = Almanac/Chutes fit, Targon stretch (1% entry); CODER+CPU = SN61 #1 (fit 71), matches manual analysis; 0 sanity violations
- Browser-verified end-to-end (agent-browser): wizard flow, honest empty state, coder results with SN61 #1, profile restore, what-it-takes expansion, mobile 390px layout; 0 console/page errors; lint+build clean
- Restarted prod: pkill next-server/server.js -> keepalive -> login: 200

Stage Summary:
- InfraneX now has a personal advisor: Market scan (Opportunities) + Personal fit (Miner Fit)
- Screenshots: scripts/fit-q1.png, fit-nontech-result.png, fit-coder-result.png, fit-whatittakes.png, fit-mobile.png, fit-final.png
- Engine honest by design: non-technical profile yields zero mining fits and points to staking baseline

---
Task ID: miner-fit-wizard
Agent: main (Super Z)
Task: Answer user's question ("app has devops engine so I can run all subnets right?") + finish & verify the Miner Fit wizard

Work Log:
- Clarified: web app = dashboard/map, NOT a miner; devops engine keeps the site alive only; nobody runs all 128 subnets
- Verified Miner Fit wizard already wired: sidebar "Miner Fit 01b" + FitView on page.tsx + miner-fit.ts engine (4 questions: tech / hardware / budget / hours)
- Browser-tested full flow end-to-end (login → wizard → results) for 2 scenarios
- Scenario A (true profile: not technical / no hardware / <$100 / passive): 0 fits, 126 excluded, staking baseline shown — honest empty state works
- Scenario B (4090 dream: not technical / 4090 / $500 / 2-4h): found 2 honesty bugs and fixed them
- FIX 1 (REDTEAM-FIT-FIX): SN61 "RedTeam" escaped the skill-class regex (no "security"/"challenge" match) → appeared as a "fit" for non-coders with $997/mo promise. Added redteam|red team|red-team|bounty|pentest|hack|exploit|detection to workClass skill regex; improved blocker text to mention hire-a-coder cost (~halves profit)
- FIX 2: crowded-door threshold was entry<3, letting SN64's exactly-3% pass as a fit. Tightened to <=3; SN64 now correctly in "Close — one fixable blocker" (stretch) with "Crowded — only 3% entry chance, subnet full of pros"
- Rebuilt (bun run build), restarted via run-prod-keepalive.sh (pkill first), login: 200
- Screenshot: download/miner-fit-4090-scenario.png

Stage Summary:
- Miner Fit wizard live at Miner Fit 01b in sidebar, honest for non-technical users
- Final state for 4090 scenario: NO top fits (honest), stretch = SN64 ($6,195/mo, 3% entry) + SN4 Targon ($2,041, 1%) + SN102 ($629, 1%), SN61 excluded with "Needs a coder" reason, 123/126 excluded
- Key message delivered: app ≠ miner; even with a 4090 a non-technical user has no clean fits today — crowded or skill-bound; staking baseline $500 ≈ $5/mo is the bar

---
Task ID: devops-fault-drill
Agent: main (Super Z)
Task: Build a free, honest way for the non-technical owner to watch the DevOps Engine catch a problem (user: "yes do it")

Work Log:
- Discovered MOCK-PURGE-1: live deploy API blocks mock mode by design; all evaluators (spend accrual, GPU health, probes, benchmarks, service health, mindset) already skip mode "mock" — perfect sandbox lane
- Built /api/devops/demo (GET/POST/DELETE, admin-gated): creates sandbox Deployment (minerName DEMO-fault-drill, mode "mock", provider "Sandbox", gpuModel "Demo RTX 4090 (virtual)", $0 costs, status started) + injects ONE scripted GPU_HEALTH thermal fault (91C, acknowledge path — safest branch, no SSH/restart ladder) via commitFinding, dedupeKey demo-drill:thermal
- DELETE terminates sandbox + autoResolves the finding; POST re-arms (recycles terminated row)
- UI (devops-view.tsx): "Run fault drill (free)" / "End fault drill" buttons in engine bar AND empty-state; note strip explains $0.00 spent
- miner-ops-card.tsx: amber DEMO badge whenever mode === "mock" (never mistakable for real rental)
- Type fix: LiveSubnetMetrics has no status — used emissionEnabled for sandbox subnet pick
- Verified FULL loop in browser: arm → recommendation card (GPU HEALTH, runbook, evidence, DEMO ONLY) → Approve → Execute → change feed "acted"; end drill → "$0.00 was ever spent"; re-armed fresh drill for user
- Screenshots: download/fault-drill-armed.png, download/fault-drill-recommendation.png

Stage Summary:
- Fault Drill shipped: DevOps Engine → "Run fault drill (free)". Zero spend, zero chain calls, clearly badged, one-click cleanup
- Drill currently ARMED and waiting for the user to click Approve → Execute
- Ops card shows honest dashes (TEMP/UTIL —) because sandbox synthesizes nothing; card carries "Mock deployment — no real GPU running" strip

---
Task ID: devops-mock-demo-verified
Agent: main (Super Z)
Task: Re-verify the DevOps fault drill end-to-end after DB reset ("run the web app")

Work Log:
- Resurrected app (login: 200); found DB empty — previous drill rows wiped by rebuild
- Re-armed drill via POST /api/devops/demo (sandbox DEMO-fault-drill on α61, $0 cost)
- Browser-verified FULL loop fresh: card "Fault drill — sandbox GPU is running hot (91 °C)" → Approve → status "approved" → Execute → API shows status "acted" with "ACTION: Acknowledged" → change feed "acted · just now"
- Screenshots: download/fault-drill-armed.png, download/fault-drill-completed.png
- Re-armed a FRESH drill for the user to click Approve → Execute themselves

Stage Summary:
- Fault drill loop verified live twice across sessions; drill currently ARMED and waiting for user's Approve click; "End fault drill" cleans up free

---
Task ID: tech-level-scenarios
Agent: main (Super Z)
Task: Answer "how technical should we be / best technical role" using the Miner Fit engine live

Work Log:
- Ran the wizard 3x live with 4090/$500/2-4h held constant, varying only techLevel
- none → 0 fits, 127 excluded, staking baseline (consistent with prior session)
- basic ("I can follow recipes") → 1 top fit: SN41 Almanac 69 fit, ≈$453/mo net modeled, CPU-only on ≈$90/mo VPS, 35% entry; stretch SN61 (needs coder) + SN64 (3% crowded); 115 excluded
- coder → 3 top fits: SN61 RedTeam ≈$884/mo (25% entry), SN41 ≈$453/mo, SN62 Ridges ≈$371/mo (5% entry); SN64 still stretch; 115 excluded
- Key insight delivered: biggest jump is none→basic (0→1 fit); SN41/SN61 are CPU-only so the 4090 is NOT needed for best fits; 4090 only matters for SN64 lottery (3%)
- Screenshots: download/fit-level-basic.png, download/fit-level-coder.png
- Restored user's TRUE profile (none/none/lt100/0) after tests — wizard stays honest

Stage Summary:
- Answer: aim for "copy-paste" level (weeks of learning, not months); role = Fleet Operator (approve + watch, engines do heavy lifting); coder path doubles modeled income but 5-15h/week and bottom half earn $0

---
Task ID: hire-devops-advice
Agent: main (Super Z)
Task: Advise "should I hire a DevOps engineer?" for non-technical owner

Work Log:
- Pure advisory turn, no code changes; grounded in live engine numbers from tech-level-scenarios run
- Core math: best modeled fit SN41 ≈$453/mo net vs hire costs ($10k+/mo full-time, $1k-3k/mo freelance, $500-1.5k/mo offshore) → all negative at 1-miner scale
- Positioning: the app's DevOps Engine IS the $0 substitute (detect → recommend → human approves → act, proven in fault-drill demo); owner = approver, not engineer
- Give break-even rule: hire only when fleet ≥10 miners / net ≥$4k/mo, then part-time contractor ≤25-30% of net
- Middle option offered: per-incident freelancer ($50-100 one-off) instead of retainer

Stage Summary:
- Advice delivered: do NOT hire yet; learn copy-paste level; reconsider at 10+ miners; app engines fill the seat free until then

---
Task ID: sn68-rent-earn-explained
Agent: main (Super Z)
Task: Explain SN68 NOVA "Rent earn: NO" to non-technical owner

Work Log:
- Read rent-earn.ts engine: Rent earn column = "will a RENTED GPU actually earn here?" (0-100 score, GREAT/OK/POOR/NO bands)
- Pulled live chain facts for SN68: maxUids 64, minersCount 64 (full), rewardedMiners 1, top10IncentiveShare 1.0, burn 0.202 tao
- Verdict computed: knife fight (1.6% slots earned, top10 100%), whale-mean headline $4,144 is ONE winner's income; new-entrant EV $66/mo; score 21 → NO band
- GPU gate: NOVA needs RTX A6000 48GB (user's 4090 = 24GB, insufficient)
- Verified rendered row in Opportunities view: "NO 21 · 1.6% earn · top10 100% · EV $66/mo"; screenshot download/sn68-nova-rent-earn-no.png
- Contrast explained: SN90 NO = hardware can't rent (TEE/bare-metal); SN68 NO = rentable hardware but 1-winner knife fight; SN4 NO = EV $12/mo

Stage Summary:
- Delivered: "Rent earn NO" = engine's trap filter — headline $/mo is whale-mean, newcomer EV is a fraction of rent cost; SN68 is a 1-of-64 lottery with 48GB hardware requirement

---
Task ID: knife-icon-explained
Agent: main (Super Z)
Task: Explain the crossed-swords icon beside "Rent earn: NO"

Work Log:
- Traced icon to opportunity-table.tsx:416-424 — Lucide "Swords" glyph shown when rent.knifeFight (rewardedRatio<10% AND top10>=85%)
- Sibling icons: AlertTriangle = whale-mean only (rew<15%); Ban = not rentable (bare-metal/TEE)
- NO work needed — pure UI explanation turn

Stage Summary:
- Swords = "knife-fight seat" warning: winner-take-all reward distribution; NOVA 1-of-64 earners triggers it

---
Task ID: build-vs-rent-advice
Agent: main (Super Z)
Task: Answer "should I build my own GPU infra? 4090 vs A100 vs H100?" with engine data

Work Log:
- Ran Miner Fit wizard 2 more live scenarios (coder + $2000/mo + 10h held constant):
  - A100 80GB: top fits UNCHANGED — SN61 $869, SN41 $452, SN62 $371, SN124 $701, ALL "CPU-only, no GPU needed"; exclusions 115→111 (A100 unlocked ~nothing)
  - H100 farm 141GB+: still SN61+SN41 on top (CPU-only); new SN35 $9,366/mo at 49 fit BUT red demand (decaying) + whale-mean + 11% entry; 107 excluded
- Pulled live GPU catalog rents (Akash): 3090 $110/mo, 4090 $226/mo, A100 $971/mo, H100 $1,861/mo, PRO6000 96GB $1,051/mo
- Economics: A100 ~$15k buy / H100 farm ~$50k+; buy-vs-rent breakeven 9-27 months; SN64 needs Intel TDX bare metal (home 4090 can't); SN35 whale-mean EV collapse risk (NOVA precedent $4,144→$66)
- Staking bar: $20k staked ≈ $170-230/mo zero-work baseline
- Screenshot download/fit-level-h100-farm.png; wizard restored to TRUE profile (none/none/lt100/0)

Stage Summary:
- Verdict delivered: do NOT build GPU infra; hardware is not the bottleneck (seats + skill are); plan = copy-paste skills → $90/mo VPS on SN41 ($453/mo modeled, 35% entry) → rent GPU later only if needed; rent-first-buy-later rule
