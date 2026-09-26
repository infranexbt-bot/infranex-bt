
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
