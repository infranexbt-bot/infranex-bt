
---
Task ID: gpu-2-b
Agent: general-purpose
Task: GPU requirements web research batch 2 (netuids 2, 11, 20, 25, 41, 55, 67, 76, 89, 98, 111, 119)
Work Log:
- Read worklog + research-batch-2.json (12 subnets); output target research-findings-2.json
- Repo pass without api.github.com: codeload tar.gz file listings + raw.githubusercontent fetches, grep for GPU/VRAM patterns (SN2, SN11, SN20, SN25, SN41, SN55, SN67, SN76, SN89, SN98, SN111, SN119)
- Full-tarball recursive greps for SN67/76/89/98/111/119/55 to rule out buried hardware docs (incl. min_compute.yml — none present)
- Read context around every hit: SN2 README hardware tables (CPU/RAM/net/storage only), SN11 README "No GPU, no server, no uptime", SN20 docs/validator.md "No local GPU", SN41 README validator Hardware block "No GPU is required", SN55 docs/miner_guide.md "GPU: necessary, up to your generation", SN111 README System Prerequisites GPU row
- Web searched 6 unresolved subnets (SN25/67/76/89/98/119) via z-ai web_search into scripts/gpu-audit/websearch2/sn*.json — only generic Bittensor mining pages, no subnet-specific official GPU specs; no further fetches justified
- Wrote strict-JSON findings (12 entries, batch order) and validated with python3 json.load assert len==12
Stage Summary:
- 6 verified / 6 not-documented / 0 deprecated / 0 parked / 0 repo-unreachable
- Verified CPU-only (minVramGb 0): SN2 DSperse, SN11 TrajectoryRL, SN20 Witness (validator-side; miners bring own models), SN41 Almanac (validator hardware block), SN111 Claims ("GPU not required with hosted inference providers")
- SN55 NIOME verified but model-less: miner guide says "GPU: necessary, up to your generation" with 16GB "memory" (likely RAM) — minVramGb/recommendedGpu left null
- Notable: SN119 repo is README-only; SN76/89/98/67 are CPU/agent/API workloads with zero GPU mentions anywhere; generic bittensor.ai "24GB practical minimum" page deliberately NOT used (not subnet-specific)

---
Task ID: gpu-2-a
Agent: general-purpose
Task: GPU requirements web research batch 1 (netuids 1, 8, 19, 24, 39, 52, 65, 75, 82, 97, 108, 118, 127)
Work Log:
- Read worklog + batch file (13 entries); wrote findings to scripts/gpu-audit/research-findings-1.json (validated, 13 items)
- Listed every repo via codeload tarballs (no api.github.com); SN19 main repo is a pointer README -> followed link to taostat/blockmachine-miner; SN118 org page -> found real repo ditto-assistant/ditto-subnet
- Fetched + grepped ~25 official docs files into scripts/gpu-audit/rawcache/ (READMEs, docs/miner.md, MINING.md, Node-setup.md, Technical_Guide.md, MINER.md, Validator.md, Miner.md)
- Verified CPU-only: SN8 Vanta ("2 vCPU + 8 GB memory / Run the miner using CPU"), SN52 Dojo ("Miners do not need to spin up any server or code level things to mine!"), SN82 Compelle ("Modest CPU. No GPU. Inference is offloaded to Chutes.")
- Marked SN39 deprecated immediately (repo = github.com/deprecated/deprecated)
- Web searches (scripts/gpu-audit/websearch2/sn24|65|75|118|127.json) + page fetches (docs.macrocosmos.ai SN1 miner setup, heyditto.ai/mining, community.hippius.com): no official GPU specs surfaced
- Judgment calls recorded in notes: SN65 TPN "No GPU is required" applies to validator follower mode only (not miners/leader) -> not-documented; SN108 ChipForge Technical_Guide.md CPU-only table is a stale copy from the old Tatsu Document Understanding subnet -> not-documented; SN75 Hippius documents 4-core/16GB/500GB-SSD node minimums but no GPU (and has GpuMiner node type) -> not-documented

Stage Summary:
- Counts: 3 verified (all CPU-only: SN8, SN52, SN82), 9 not-documented, 1 deprecated, 0 parked, 0 repo-unreachable
- Notable: SN118 Ditto real repo = ditto-assistant/ditto-subnet (Docker harness submission, no GPU docs); SN97 Albedo miners fine-tune Qwen3.6-35B-A3B with zero documented GPU spec; SN24 Quasar explicitly treats miner GPU details as telemetry-only (no minimum); SN1 Apex docs specify only wallet/submission fees
- All quotes are exact text from official repos (sourceUrl uses /blob/HEAD/ paths); websearch JSONs + raw doc cache retained in scripts/gpu-audit/ for verification

---
Task ID: gpu-2-c
Agent: general-purpose
Task: GPU requirements web research batch 3 (SN5, 13, 22, 27, 44, 61, 69, 77, 93, 103, 115, 121)
Work Log:
- Read worklog + batch file; pulled all 12 repos via codeload tarballs (no api.github.com) and recursively grepped .md/.yml/.toml for GPU/VRAM/model patterns
- SN5 Hone: repo-wide GPU grep = zero hits; README documents CPU-only validator sizing (16 one-CPU grading containers, 16-vCPU/16-GiB host) and an API-based demo miner -> verified CPU-only
- SN13 Data Universe: docs/miner.md explicitly states "Miners do not require a GPU" (validator: 32GB RAM, no GPU) -> verified CPU-only
- SN22 Desearch: found min_compute.yml v1.0.4 missed by prior audit (README is GPU-silent); miner compute_spec = 2 cores/8GB RAM, no gpu key -> verified CPU-only
- SN27 Orion: README says Quasar-Preview "runs locally on the miner GPU" (--devices 0) but no GPU model/VRAM anywhere; checked linked HuggingFace silx-ai/Quasar-Preview card too -> not-documented
- SN44 Score: MINER.md says only "Have GPU/cloud capacity for inference", but example_miner/chute_config.yml documents NodeSelector gpu_count 1 / min_vram_gb_per_gpu 16 (excludes 5090/b200/h200/h20/mi300x) -> verified 16GB x1
- SN61 RedTeam: docs/getting-started/miner.md System Requirements callout: CPU 2+ cores, RAM 8GB+, Storage 50GB+, Linux -> verified CPU-only (validator: 8 cores/32GB/512GB)
- SN69 Herald: docs/validator.md "No GPU / no ML — it is network-I/O bound" + GPU:none hardware table; root min_compute.yml miner = 2 CPU/4GB RAM -> verified CPU-only
- SN77 Liquidity: TS tooling for hosted weights server, zero hardware docs -> not-documented
- SN93 Bitcast: miners serve YouTube OAuth tokens; README/AGENTS.md have no hardware specs (bitcast-x README also GPU-silent) -> not-documented
- SN103 Capcomp: resolved org page -> Capcomp-AI/capability-composition-subnet; official min_compute.yml v2.0.0: miner GPU optional ("useful work with nothing but a CPU"), local eval needs GPU fitting Qwen3-8B bf16, min_vram 32 / rec 48, compute cap 8.0; validator 4x32GB (rec 8x48GB) -> verified 32GB x1
- SN115 MoirAI: repo is README+images only, no setup/hardware docs -> not-documented
- SN121 sundae_bar: miners submit SKILL.md via Lab, eval on hosted harness; repo README + sundaebar.ai page have no hardware docs -> not-documented
- 6 web searches run (sn5/22/61/77/93/115/121 sets, saved to scripts/gpu-audit/websearch2/); no third-party source quoted — all verified values come from subnet repos
- Wrote scripts/gpu-audit/research-findings-3.json (12 entries, batch order); JSON + schema + order validated
Stage Summary:
- 7 verified / 5 not-documented / 0 deprecated / 0 parked / 0 unreachable
- Verified values: SN5 CPU-only, SN13 CPU-only, SN22 CPU-only, SN44 16GB x1 GPU, SN61 CPU-only, SN69 CPU-only, SN103 32GB x1 GPU (optional, for local eval)
- Notable: SN103 has the richest spec (miner GPU optional 32GB; validator min 4x32GB rec 8x48GB); SN27 explicitly needs a miner GPU but publishes no spec; SN22/SN69 own min_compute.yml files were missed by the README-only audit

---
Task ID: gpu-2-d
Agent: general-purpose
Task: GPU requirements web research batch 4 (netuids 6, 15, 23, 36, 46, 62, 71, 78, 95, 105, 117, 126)
Work Log:
- Read worklog + research-batch-4.json (12 entries); created scripts/gpu-audit/websearch2/
- Downloaded/extracted repo tarballs (codeload, no api.github.com) for SN6 numinous, SN15 oro, SN23 trishool-phase2, SN36 epago, SN46 sn46-validator, SN62 ridges, SN71 leadpoet, SN78 umi, SN105 Beam-Network/beam; grepped all *.md/yml for GPU patterns
- Special cases verified via HTTP status: actual-computer/actual-subnet-95, everyframe-studios/everyframe-miner, attelierai/attelierai_subnet all 404 (orgs exist; actual-computer holds only a llama.cpp fork); Beam real repo found via org page scrape = Beam-Network/beam (beam-core-public/beam-sdk-public also checked, no GPU)
- SN15: fetched official docs.oroagents.com/docs/validators/overview -> hardware table "GPU Not required" (16GB/32GB RAM, 8 cores)
- bittensor.ai is Cloudflare-blocked (curl "Just a moment...", agent-browser challenge never cleared, archive.org/jina unreachable) -> used web_search snippets of official bittensor.ai/subnets pages: SN78 "GPU Not required", SN117 "Miner GPU Not required RAM 8 GB", SN126 "GPU optional depending on model implementation. Reference model runs on CPU"
- ~20 web searches saved to scripts/gpu-audit/websearch2/sn*.json; SN95/SN105 directory pages never surfaced hardware sections (SN95: only NVIDIA-Inception/Blackwell news; SN105: bandwidth-subnet news mentions 2/4-GPU proving, not an official requirement)
- Wrote + validated scripts/gpu-audit/research-findings-4.json (12 entries, schema OK)
Stage Summary:
- 7 verified / 4 not-documented / 1 repo-unreachable / 0 deprecated / 0 parked
- CPU-only documented (minVramGb 0): SN6 Numinous (validator 16GB RAM, repo), SN15 ORO (official docs "GPU Not required"), SN46 Instant ("No GPU required" README), SN78 Umi (bittensor.ai), SN117 everyframe (bittensor.ai; repo deleted), SN126 Attelier (bittensor.ai "GPU optional... Reference model runs on CPU"; repo deleted)
- SN36 Epago verified GPU: "a single consumer GPU is enough to fine-tune and duel it" (gpuCount 1, model/VRAM unspecified; validator GPU box deliberately spec-free)
- Not-documented: SN23 Trishool (Docker/Node/API-keys only), SN62 Ridges, SN71 Leadpoet (hardware-silent repos), SN105 Beam (repo requires Go/Python/network only)
- SN95 Actual: repo 404 and no documented GPU requirement anywhere official -> repo-unreachable

---
Task ID: gpu-2
Agent: main (Super Z) + 4 research subagents (gpu-2-a/b/c/d)
Task: Research the 78 estimate subnets' GPU requirements and upgrade verified values

Work Log:
- Extracted 78 ESTIMATE targets from verify-results.json; 77 had zero README
  GPU evidence
- Phase 1 — deep repo sweep: scripts/gpu-audit/deep-scrape.py downloaded all
  78 repo tarballs via codeload (rate-limit-free; GitHub API was 0/60) and
  grep'd every text file for GPU-model/VRAM/requirement patterns -> 29 repos
  with evidence (deep-scrape-results.json)
- Phase 2 — 4 parallel research agents (research-batch-1..4.json -> research-
  findings-1..4.json): raw-file probing + z-ai web_search with strict
  no-guess policy, verbatim quote + sourceUrl required; agents flagged that
  SN22/SN69 min_compute.yml audit misses were transient fetch failures
  (files exist at repo root, fetch OK now)
- Judgment calls: excluded SN20 (validator-CPU-only, miners serve models),
  SN37/SN128 (code comments/recognition maps, not requirements), SN10 (ops
  round hardware, not miner req); SN20 deliberately kept estimate
- Phase 3 — CURATED_GPU_SPECS (43 entries: 17 CPU-only, 24 GPU specs, 2
  GPU-required-unspecified-VRAM) added to github-scraper.ts with sourceFile +
  verbatim quote each; applied in scrapeGithubMetadata ONLY when min_compute
  and prose parsers find nothing (CDL always wins — SN103's gpu.required:
  false honored, display "None (CPU-only; GPU optional >=32 GB for local
  evaluation)"); ScrapedMetadata.curatedGpuNote -> profile notes
- Phase 4 — apply-curated.ts wrote 43 SubnetOverride rows (ledger display)
  + invalidated SubnetRequirements cache; SN103 override githubUrl patched
  org page -> Capcomp-AI/capability-composition-subnet
- audit-verify.ts extended: curated specs count as GT layer
- E2E: scraper-layer test (e2e-curated.ts) verified SN2 CPU-only + note,
  SN4 8x profiles, SN26 12GB, SN103 CDL-wins; full pullSubnetRequirements
  path hangs on live chain fetch in this env (pre-existing, noted in sn96)
- tsc clean in src/ (only .next/dev generated-type noise); eslint 0 errors
- Committed 473ad34, pushed origin/main

Stage Summary:
- Verdicts: 78 ESTIMATE -> 35 ESTIMATE; OK 29 -> 72; 0 MISMATCH
- 17 subnets now officially display CPU-only, 24 display concrete GPU specs
  (SN3 8x H200/B200, SN4 8x TEE profiles, SN26 12GB, SN44 16GB, SN100 B200,
  SN125 B200, SN120 2x H100/PRO6000, ...), 2 display GPU-required-unspecified
- Remaining 35 estimates are genuinely undocumented everywhere official
  (verified per-subnet) — display stays honestly labeled, never assumed

---
Task ID: req-dialog-fullview
Agent: main (Super Z)
Task: Subnets page Requirements dialog displayed too small/short — make it open as a complete full view

Work Log:
- Reproduced in browser (agent-browser, admin session): dialog was max-w-3xl
  (768px) single column with heavy vertical scroll — "very short" complaint
- Rewrote src/components/subnets/subnet-requirements-dialog.tsx:
  * DialogContent -> w-[min(96vw,1500px)] h-[94vh] flex-col panel, p-0,
    overflow-hidden; sticky header (title + provenance strip via new
    ProvenanceStrip component) + internally scrolling body
  * LiveProfileView split -> ProfileGridLayout: 2-col grid on xl+
    (LEFT: GPU requirements, service infra, network config; RIGHT: runtime
    deps, repo & entrypoint, miner command + env vars); single col below xl
  * Seat availability / hosting compat / what-miners-do remain full-width
  * Loading skeleton mirrors 2-col grid; sections unchanged content-wise
- Verified in browser on SN1 Apex + SN4 Targon: whole detail picture now
  fits ~1 screen at 1440x900 (was 3-4 screens of scrolling)
- tsc clean, eslint clean; committed b5c4c27, pushed origin/main
- Note: dev server restarted after crash (was down on reconnect); running on :3000

Stage Summary:
- Requirements dialog opens near-fullscreen with all details visible at a glance

---
Task ID: judge-audit-1
Agent: main (Super Z)
Task: Audit Validator Lab data pipeline — how it pulls data, verify correctness for all 129 subnets

Work Log:
- Traced judge/ pipeline: extract.ts (raw probe of 8 validator paths -> git-trees
  fallback /validat/i), service.ts (chain-identity repo URL -> curated fallback,
  6h cache + JudgeProfile upsert), cohort.ts (brutality from live incentive
  vectors), simulate.ts (deterministic scoring curves)
- Found JudgeProfile table EMPTY (0 rows) — Lab builds lazily on first use
- scripts/judge-audit/fetch-tarballs.py: downloaded 103 unique repos via
  codeload (99 ok, 4 deleted, 25 netuids without repo URL)
- scripts/judge-audit/judge-audit.ts: mirrors app's exact probe order + runs
  the app's own extractJudgeProfile on tarball inputs; grounding check +
  deadline provenance + seed cross-check
- RESULTS: 0 ungrounded evidence (100% verbatim in repo files); 0 deadlines
  from README; 83 validator-code / 16 readme-only / 30 no-repo; judgeKinds:
  22 quality, 11 uptime, 11 market, 9 latency, 1 resource, 75 unknown
- Unknowns decomposed: 35 have validator file but vocabulary outside the
  6-dimension keyword catalog; 10 have no *validat*.py anywhere (mostly
  TS/Rust repos — verified via list-py-files.py; only ~2 have scoring code
  under other names)
- 15 seed contradictions spot-adjudicated: Lab usually more grounded (real
  code evidence), occasionally keyword noise flips class (SN34 BitMind);
  evidence quotes always shown so users can judge
- NO fabrication, NO wrong-repo, NO stale cache found. No code changes made —
  behavior matches design and discloses uncertainty honestly.

Stage Summary:
- Validator Lab data pipeline verified correct for all 129 subnets
- Audit artifacts: scripts/judge-audit/{fetch-tarballs.py, judge-audit.ts,
  judge-audit-results.json, tarball-inputs.json, tarballs/}

---
Task ID: miners-tab-1
Agent: main (Super Z)
Task: Implement Active Miners tab in subnet Requirements dialog (live per-UID metagraph)

Work Log:
- New API route src/app/api/subnets/[netuid]/neurons/route.ts: getUidState()
  vectors (60s cache) + batch Keys scan (one .multi() for all uids) via
  encodeAddress; rows {uid, hotkey, active, tier(earning/active/stale/idle),
  incentive, consensus, validatorTrust, emissionRel, blocksSinceUpdate};
  summary {activeCount, earningCount, medianRewardedIncentive}; DB session gate
- New component src/components/subnets/subnet-miners-panel.tsx: summary chips,
  search filter, sort (incentive/uid/freshest), shadcn table with incentive/
  emission mini-bars, staleness humanized (12s/block), honest error/empty
  states, tier color coding (primary/success/warning/muted)
- Dialog integration: Requirements | Active Miners segmented toggle in header
  (miner count badge), panel lazy-fetches per netuid, tab resets on reopen
- OPS-FLAG: INFRANEX_WORKERS=off in startWorkers() — 4GB sandbox OOM-killed
  the server 3x at boot (chain sweep + GitHub scrape storm; dmesg confirmed
  next-server killed at 2.5GB RSS). start-dev.sh sets it; /api/network stays
  live via stale-while-revalidate. NODE_OPTIONS heap cap 2048 added too.
- Debugged chain: server died before miners fetch 3x (pre-existing), Turbopack
  disk cache corrupted by OOM (rm -rf .next fixed), zombie npm wrapper held
  port 3000 (pkill before relaunch)

Verification:
- tsc clean, eslint clean
- API live: SN1 (256/256 reg, 8 active, 4 earning), SN18 (257 reg, 12 active,
  18 earning), SN4 — all with real hotkeys resolved
- Browser (agent-browser): login -> Subnets -> Targon a4 dialog -> Active
  Miners tab renders 256 rows w/ correct tiers/bars/staleness; filter "156"
  -> 1 row; sort UID -> 0,1,2; Refresh re-fetches; tab switch back OK;
  zero console errors

Stage Summary:
- Active Miners tab shipped: per-subnet live miner list from chain metagraph
- Ops flag INFRANEX_WORKERS=off stabilizes low-memory boots (documented in
  start-dev.sh + workers.ts)

---
Task ID: git-push-2
Agent: main (Super Z)
Task: Save and push infranex-bt to GitHub (user-provided PAT)

Work Log:
- Verified previous session state: Miners tab commit (b882019) + judge-audit
  gitignore (19b0ffb) were already committed AND already on origin/main
- Diagnosed git diff hang (single-line 113KB JSON piped to head); worked
  around by redirecting diff to file
- Committed remaining dirty file .alpha-price-history.json (runtime alpha
  price snapshot refresh) as d36b84b
- Set remote origin URL with user-provided PAT (same token, idempotent)
- Pushed 19b0ffb..d36b84b main -> main, exit 0

Stage Summary:
- Repo fully synced: local main == origin/main == d36b84b, working tree clean
- REMINDER: PAT ghp_iXdtv... exposed in chat again — user should rotate it

---
Task ID: sn56-gpu-fix
Agent: main (Super Z)
Task: Fix SN56 Gradients "Recommended GPU: NVIDIA A100 (Basilica)" — validator-side
hardware mislabeled as miner requirement

Work Log:
- Researched SN56 via official gradients-ai/G.O.D repo (README + docs/miner.md +
  docs/developer.md): miners are CPU-only endpoints on port 7999 returning
  {github_repo, commit_hash}; validators train on their own GPUs (image: 1xH100,
  env eval: Basilica A100 80GB 900s). Participation fees 0.4-0.7 TAO/tournament.
- Root cause: CURATED_GPU_SPECS[56] in github-scraper.ts held minVramGb:80 +
  "NVIDIA A100 (Basilica)" sourced from a validator-side quote in docs/miner.md
- Fix 1: CURATED_GPU_SPECS[56] -> minVramGb:0, "None (CPU-only)" with verbatim
  miner-guide quote ("You do not need to provide tournament compute...")
- Fix 2: surgical DB update SubnetOverride[56] (scripts/fix-sn56-gpu.ts)
- Fix 3: subnet-card.tsx + subnet-requirements-dialog.tsx render minVramGb=0 as
  "None" / "None - CPU-only" instead of "0 GB"
- OPS-FLAG: sandbox reaps background servers between tool calls; dev-mode page
  compiles OOM at ~2.5GB RSS in 4GB sandbox (dmesg). Browser screenshot skipped;
  verified via authenticated API instead
- FLAG (unverified, not changed): CURATED_GPU_SPECS[94] sources a *validator*
  quickstart doc ("validator quickstart" A10G 24GB) — needs miner-doc check

Verification:
- tsc clean, eslint clean
- API /api/subnets/56/metadata (admin session): override.minVramGb=0,
  override.recommendedGpu="None (CPU-only)", curated matches

Stage Summary:
- SN56 now correctly shown as CPU-only miner (no GPU rental needed)
- Correct tournament intel documented: fees 0.4/0.6/0.7 TAO (image/env/text),
  Mon 09/11/13 UTC starts, Friday 14:00 UTC completion, Fiber registration >=1h

---
Task ID: laptop-cpu-testnet
Agent: main (Super Z)
Task: Step-by-step procedure for testing with a test hotkey + CPU miner on laptop (zero TAO burn)

Work Log:
- Completed pending CPU-subnet research: 32 CPU-only SubnetOverride rows in db/custom.db (SN2,5,6,7,8,11,13,15,18,21,22,41,43,46,48-QPU,50,54,56,61,63,69,78,79,83,88,101,103,104,107,111,122,124)
- Web-verified burn mechanics: mainnet registration = floating recycle fee on EVERY subnet (~0.05 TAO per SN89 repo README); no mainnet subnet is zero-cost; SN56 has extra tournament staking/fees
- Verified testnet path: btcli wallet faucet --network test (free TAO) + free registration; SN89 InfiniteQuant repo documents testnet netuid 496 + "Same code, free TAO"
- Picked SN89 as primary laptop-test subnet: CPU-only, submission-based (no public IP/axon/ports), no data subscription, official testnet docs, ~0.05 TAO mainnet graduation
- Alternatives verified: SN8 Vanta (2vCPU/8GB), SN61 RedTeam (2+ cores/8GB/Docker), SN22 Desearch (2c/8GB/API key), SN82 Compelle, SN13 Data Universe
- Wrote deliverables: download/laptop-cpu-miner/{QUICKSTART.md, setup-testnet.ps1 (Windows), setup-testnet.sh (macOS/Linux)}

Stage Summary:
- Delivered 7-step laptop testnet runbook: prep -> test hotkey -> faucet -> free register (netuid 496) -> SN89 CPU miner -> verify -> optional mainnet graduation (~0.1 TAO buffer)
- Key fact for user: zero-TAO is only possible on testnet; mainnet always burns floating recycle (~0.05 TAO)
