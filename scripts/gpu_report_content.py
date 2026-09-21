# ---------------------------------------------------------------------------
# GPU Provider Analysis — Operator Brief. Content module (English).
# All copy lives here; gpu_report_pdf.py handles layout. Edit copy here.
# ---------------------------------------------------------------------------

TITLE = "Where Rented GPUs Run Best"
SUBJECT = ("GPU rental provider analysis for continuous mining runtime: "
           "Vast.ai vs Akash vs RunPod vs Lambda vs alternatives")

# ── Chapter 1 ────────────────────────────────────────────────────────────────
CH1_TITLE = "Verdict Up Front"
CH1_P1 = ("RunPod is the best default for running rented GPUs when runtime is the metric that "
          "matters. It is the only mainstream provider in this comparison that publishes a "
          "documented uptime SLA (99% on Secure Cloud), and it is the only one whose failures are "
          "priced into a managed platform rather than pushed onto individual marketplace hosts. "
          "For a Bittensor miner this is the whole game: a crashed miner earns zero emissions "
          "while the invoice keeps running, so the provider that keeps a pod alive through host "
          "maintenance, driver faults and noisy-neighbour churn is worth a premium per hour.")
CH1_P2 = ("Vast.ai is the price floor, not the reliability leader. Its marketplace routinely "
          "lists H100-class capacity below $1.20 per hour and its median SXM rate undercuts every "
          "managed platform, but there is no SLA and reliability depends entirely on which host "
          "you pick. Market-observed comparisons put the effective cost of unverified Vast hosts "
          "20–40% above the sticker once downtime and re-runs are priced in. Lambda Labs is the "
          "enterprise fallback — consistent uptime and real support at a modest premium — while "
          "Akash Network sits in the middle as a decentralized, bid-priced market whose quality "
          "varies by provider. TensorDock and the newer entrants (Hyperstack, Clore.ai, Fluence) "
          "are cheap on paper but have the thinnest reliability track records, with TensorDock "
          "reporting serious availability problems since late 2025.")
CH1_TABLE_CAPTION = "Table 1: Provider ranking for continuous rented-GPU mining (observed Sep 2026)"
CH1_TABLE_HEADER = ["#", "Provider / tier", "Grade", "H100 $/hr (typ.)",
                    "Uptime posture", "Platform status"]
CH1_TABLE_ROWS = [
    ["1", "RunPod — Secure Cloud", "A", "2.89", "99% documented SLA; managed infra", "Offers + real rental adapter"],
    ["2", "Lambda Labs", "A-", "2.86", "Consistent; enterprise support", "Offers only (rent via RunPod)"],
    ["3", "RunPod — Community Cloud", "B+", "1.99", "No formal SLA; multi-tenant", "Same RunPod key"],
    ["4", "Akash Network", "B", "~3.37 median", "Provider-dependent; no SLA", "Public bid offers"],
    ["5", "Vast.ai — verified hosts", "B-", "1.73–2.16", "No SLA; host ratings + benchmarks", "Offers + real rental adapter"],
    ["6", "Vast.ai — unverified / spot", "C+", "0.90–1.20", "Interruptible; +20–40% effective cost", "Same Vast.ai key"],
    ["7", "TensorDock / Hyperstack / Clore", "C+", "2.25 claimed", "Thin track records; TensorDock issues", "Not integrated"],
]
CH1_CALLOUT_STAT = "99% vs none"
CH1_CALLOUT_LABEL = ("RunPod Secure Cloud publishes a 99% uptime SLA — the only documented "
                     "runtime guarantee in this field. Everyone else asks you to trust the host.")

# ── Chapter 2 ────────────────────────────────────────────────────────────────
CH2_TITLE = "Scope, Method and Data Sources"
CH2_P1 = ("This brief answers one operator question: which provider keeps rented GPUs earning the "
          "longest, and which specific GPU models deliver the most mining value per hour across "
          "those providers. Five providers receive a full review — Vast.ai, RunPod, Akash Network, "
          "Lambda Labs, and a combined tier of alternatives (TensorDock, Hyperstack, Clore.ai, "
          "Fluence). Each is scored on five dimensions: uptime posture and SLA honesty, headline "
          "and effective price, offer depth across GPU classes, interrupt behavior on spot or "
          "interruptible inventory, and practical fit for Bittensor subnet workloads.")
CH2_P2 = ("The runtime-first weighting is deliberate. Proof-of-learning and inference subnets pay "
          "for continuous availability, not for peak throughput, so a provider with a slightly "
          "higher sticker price but a hard SLA beats a cheaper marketplace host that reboots "
          "weekly. Price observations are medians and typical advertised rates drawn from provider "
          "pricing pages, live platform catalog adapters (the platform's provider registry "
          "integrates RunPod, Vast.ai, Lambda and Akash directly) and third-party market "
          "comparisons published between June and September 2026. All figures are observed market "
          "rates, not quotes, and Section 8 lists the source set with dates so every number can "
          "be re-checked before a large lease.")

# ── Chapter 3 ────────────────────────────────────────────────────────────────
CH3_TITLE = "Provider-by-Provider Review"
CH3_INTRO = ("Each provider below is reviewed on the five scoring dimensions, with the numbers "
             "that an operator actually negotiates against: H100-class on-demand rates, SLA "
             "posture, and what the platform's own adapters can automate.")
CH3_S1_TITLE = "Vast.ai — deepest market, weakest guarantee"
CH3_S1 = ("Vast.ai is a two-sided marketplace where third-party hosts set their own terms, which "
          "produces the widest price range and the widest quality range in the industry. H100 "
          "listings start under $1.00 per hour, the SXM median sits around $2.16, and H200 "
          "capacity is the deepest of any platform at a median near $4.65. Reliability tooling is "
          "real but self-service: machine reliability ratings, verified benchmarks and a scoring "
          "system help you avoid the worst hosts, yet nothing prevents a host from taking a "
          "machine down for maintenance. Interruptible instances priced by bidding reward "
          "operators who build auto-restart into their miners. In the platform, Vast.ai offers "
          "feed both the GPU and CPU catalogs and the rental adapter provisions on-demand "
          "instances with the SSH key injected — spot inventory must be managed manually.")
CH3_S2_TITLE = "RunPod — the managed middle that keeps pods alive"
CH3_S2 = ("RunPod operates the infrastructure it sells, and that shows up in the failure model: "
          "Secure Cloud carries a documented 99% uptime SLA, publicly documented compliance, and "
          "a standardized path through Pods, Serverless and Clusters. H100 PCIe runs $1.99 per "
          "hour on Community Cloud and $2.89 on Secure Cloud; A100 PCIe is $1.19 and $1.59 "
          "respectively. Community Cloud is the value play for rerun-tolerant work, while Secure "
          "Cloud is where a miner that must not go down belongs. The platform's RunPod adapter is "
          "the most complete integration available: live pricing plus real rentals, so a bundle "
          "picked in the deploy wizard becomes a running pod with monitoring attached.")
CH3_S3_TITLE = "Akash Network — decentralized bids, mid-market pricing"
CH3_S3 = ("Akash aggregates GPU bids from a distributed provider set, and its public pricing "
          "needs no API key — H100 on-demand leases have ranged from $2 to $7 with a median near "
          "$3.37 in recent market data. The upside is censorship resistance, transparent bid "
          "aggregation and occasional underpriced capacity from providers building reputation. "
          "The downside is structural: leases inherit whatever reliability the individual "
          "provider delivers, there is no SLA to appeal to, and the platform's Akash feed is "
          "offer-only with rentals handled through other adapters. Akash is best treated as a "
          "secondary market to check before accepting a managed-platform rate, not as the home "
          "of an uptime-critical miner.")
CH3_S4_TITLE = "Lambda Labs — the enterprise fallback"
CH3_S4 = ("Lambda sells on consistency rather than price: H100 PCIe on-demand around $2.86 per "
          "hour, 1-Click Clusters for multi-GPU work, no egress fees, and the most enterprise-"
          "grade support posture in the comparison. Users report reliable access to A100 and H100 "
          "inventory for sustained training runs, and uptime is consistently described as solid "
          "across third-party comparisons. The premium over RunPod Community is small — often a "
          "few cents per GPU-hour — and buys predictable capacity instead of marketplace variance. "
          "The platform pulls Lambda's live on-demand pricing into the catalog, but the rental "
          "adapter is not live, so Lambda capacity is priced here and provisioned via RunPod.")
CH3_S5_TITLE = "The rest of the field — cheap until they are not"
CH3_S5 = ("TensorDock has advertised some of the lowest H100 SXM rates in the industry (claimed "
          "$2.25) but has had serious availability problems since late 2025, which converts a "
          "good sticker price into a bad effective one exactly when capacity is scarce. "
          "Hyperstack targets mid-tier European capacity with competitive on-demand rates and a "
          "smaller track record. Clore.ai and Fluence represent the decentralized wave behind "
          "Akash: real savings on individual hosts, marketplace-style reliability variance, and "
          "rating systems that push the diligence work onto the operator. None are integrated "
          "into the platform's adapters today, so using them means manual key management and "
          "manual monitoring outside the dashboard.")

# ── Chapter 4 ────────────────────────────────────────────────────────────────
CH4_TITLE = "Runtime and Reliability: The Decisive Metric"
CH4_P1 = ("Mining economics turn sticker price into effective price through uptime. A miner that "
          "is offline produces no emissions but still accrues rent, so the true hourly cost of a "
          "GPU is the sticker divided by the fraction of time it actually works. At 99.5% uptime "
          "the adjustment is cosmetic; at 92% — typical for unverified marketplace hosts that "
          "reboot for maintenance or lose machines to higher bidders — it silently erases most of "
          "the discount. This is why the SLA question is not administrative paperwork but the "
          "core of the price comparison.")
CH4_TABLE_CAPTION = ("Table 2: Sticker price vs downtime-adjusted effective price, "
                     "H100 class (observed Sep 2026)")
CH4_TABLE_HEADER = ["Provider / tier", "Sticker $/hr", "Assumed uptime", "Effective $/hr",
                    "What the gap buys you"]
CH4_TABLE_ROWS = [
    ["Vast.ai — unverified floor", "1.20", "92%", "1.30", "Cheapest entry; you own the restart problem"],
    ["RunPod — Community", "1.99", "97%", "2.05", "Managed multi-tenant; rerun-tolerant work"],
    ["Vast.ai — verified median", "2.16", "97%", "2.23", "Host ratings + benchmarks, still no SLA"],
    ["TensorDock", "2.25", "92%", "2.45", "Low sticker; availability track record poor"],
    ["Lambda Labs", "2.86", "99.5%", "2.87", "Enterprise consistency, real support"],
    ["RunPod — Secure Cloud", "2.89", "99.5%", "2.90", "The only documented 99% SLA"],
    ["Akash — bid median", "3.37", "97%", "3.47", "Decentralized access; provider lottery"],
]
CH4_P2 = ("Two readings fall out of the table. First, once downtime is priced in, the cheapest "
          "unverified Vast floor (~$1.30 effective) and RunPod Secure (~$2.90 effective) are only "
          "about $1.60 per GPU-hour apart — before counting the operator hours spent babysitting "
          "restarts. Second, the middle of the market compresses hard: TensorDock's low sticker "
          "lands above Lambda's effective price, and Akash's bid median is the most expensive "
          "entry once its provider-dependent uptime is assumed. Interruptible spot inventory "
          "deserves a separate note: at 30–60% discounts it is genuinely profitable for rerun-"
          "tolerant subnets, but only with automated restart and checkpointing, because "
          "interruptions are a when, not an if.")
CH4_CHART_CAPTION = ("Figure 1: H100-class sticker price vs downtime-adjusted effective price "
                     "by provider tier (observed Sep 2026)")
CH4_CALLOUT_STAT = "+20–40%"
CH4_CALLOUT_LABEL = ("Effective cost premium observed on Vast.ai unverified hosts once downtime, "
                     "re-runs and babysitting are priced against the sticker rate.")

# ── Chapter 5 ────────────────────────────────────────────────────────────────
CH5_TITLE = "Top GPU Performers and Price Benchmarks"
CH5_P1 = ("Provider choice sets the runtime; GPU choice sets the emissions yield per dollar. The "
          "current market splits into five practical tiers, and the H100 class remains the "
          "mining sweet spot: it is the minimum card that most high-emission GPU subnets treat "
          "as baseline, its rental price has settled into a $2–4 band across non-hyperscale "
          "providers, and its supply is deep on every marketplace in this comparison. The H200 "
          "adds 141 GB of memory for subnets whose workloads are memory-bound rather than "
          "compute-bound, while the RTX 4090 remains the consumer-efficiency king for light "
          "inference loops at a fraction of the hourly cost.")
CH5_TABLE_CAPTION = "Table 3: Top GPU performers for rented mining, ranked by value per GPU-hour (Sep 2026)"
CH5_TABLE_HEADER = ["Rank", "GPU", "VRAM", "Typical $/hr", "Sweet-spot provider", "Mining fit"]
CH5_TABLE_ROWS = [
    ["1", "H100 SXM", "80 GB", "1.73–2.89", "RunPod Secure; Vast verified",
     "Emissions-per-dollar workhorse; baseline on high-value GPU subnets"],
    ["2", "H200", "141 GB", "3.68–4.65", "Vast.ai (deepest supply)",
     "Memory-bound training and long-context inference subnets"],
    ["3", "RTX 4090", "24 GB", "0.40–0.55", "Vast.ai (consumer fleet)",
     "Efficiency king for lightweight inference and 4090-native subnets"],
    ["4", "A100 PCIe", "80 GB", "1.19–1.59", "RunPod Community",
     "Price/performance floor for LLM inference loops"],
    ["5", "B300", "288 GB", "~8.69–8.75", "Vast.ai; Lambda",
     "Frontier class; only where emissions clearly justify the rate"],
]
CH5_P2 = ("Ranking logic is deliberate. The H100 SXM takes the top slot not because it is the "
          "fastest card but because it clears the admission bar of the most subnets while "
          "staying inside a price band that effective-cost math can still justify. The H200 "
          "outranks the 4090 only where memory is the binding constraint; for pure "
          "tokens-per-dollar on light workloads, the 4090's sub-$0.55 rate is unmatched. The "
          "A100 survives as the budget inference floor, and B300-class silicon is a frontier "
          "specialist — rent it only when a subnet's emissions demonstrably scale with "
          "frontier compute, otherwise the $8.75 median rate pays for capacity the workload "
          "never uses.")

# ── Chapter 6 ────────────────────────────────────────────────────────────────
CH6_TITLE = "Provider Fit for Subnet Mining"
CH6_P1 = ("The right routing depends on what a subnet does to you when the GPU disappears. "
          "Continuous-scoring subnets punish downtime twice — missed validation windows plus a "
          "cold-start penalty on re-registration — so they belong on SLA-backed capacity. "
          "Rerun-tolerant batch workloads can harvest interruptible discounts safely as long as "
          "restart is automated. The table below maps the platform's current top GPU-scored "
          "opportunities onto that logic; treat the subnet assignments as examples to re-check "
          "against the live dashboard, since opportunity scores rotate weekly.")
CH6_TABLE_CAPTION = "Table 4: Routing guide — workload pattern to provider and GPU class"
CH6_TABLE_HEADER = ["Workload pattern", "Example platform targets", "Route to", "GPU class", "Why"]
CH6_TABLE_ROWS = [
    ["Continuous uptime scoring", "SN5 Hone, SN41 Almanac, SN123 MANTIS",
     "RunPod Secure", "H100 SXM", "SLA-backed runtime; restarts cost emissions"],
    ["Interruptible batch", "SN61 RedTeam, SN67 Harnyx",
     "Vast.ai spot", "RTX 4090 / H100", "30–60% cheaper; auto-restart masks interrupts"],
    ["Budget inference loops", "Light GPU / mixed catalogs",
     "Akash bids", "A100", "Bid-priced capacity; verify provider history first"],
    ["Enterprise lease, fixed term", "Any high-emission GPU subnet",
     "Lambda", "H100 PCIe", "Consistent capacity for predictable monthly cost"],
]
CH6_P2 = ("Two platform-specific notes sharpen the routing. First, the rental adapters that the "
          "dashboard can automate today are RunPod and Vast.ai (on-demand), which conveniently "
          "covers both ends of the reliability spectrum; Lambda and Akash offers are visible but "
          "their capacity must be provisioned manually. Second, the GPU catalog's spot flags and "
          "availability grades (available / limited / scarce) are exactly the fields to filter on "
          "before leasing: scarce availability plus no SLA is the combination that produces "
          "multi-day outages, and it is visible in the catalog before the wallet ever pays.")

# ── Chapter 7 ────────────────────────────────────────────────────────────────
CH7_TITLE = "Operator Action Checklist"
CH7_INTRO = ("Seven steps convert this analysis into a running configuration. Each is small; "
             "together they keep the rigs earning.")
CH7_STEPS = [
    ("Point uptime-critical miners at RunPod Secure Cloud.", "Configure the RunPod API key in "
     "the platform key vault and treat the 2.89 H100 rate as the ceiling for continuous "
     "subnets — the SLA is the product being bought."),
    ("Keep Vast.ai for interruptible bids only.", "Use verified hosts with high reliability "
     "ratings, on-demand for anything that cannot survive a restart, and bid-priced spot only "
     "with automated restart and checkpointing in the miner."),
    ("Price every lease in effective dollars, not sticker.", "Divide the hourly rate by the "
     "host's realistic uptime before comparing providers; the +20–40% unverified-host premium "
     "is invisible on the listing page."),
    ("Verify the H100 median before long leases.", "The market has moved more than 20% in "
     "twelve months; re-check current medians ($2.16 SXM on Vast, $1.99/$2.89 RunPod) weekly "
     "before committing to multi-week capacity."),
    ("Filter the catalog on availability before price.", "Scarce-availability offers with no "
     "SLA are the source of the worst outages; a limited-availability Secure Cloud pod "
     "out-earns a scarce marketplace bargain."),
    ("Use Akash and Lambda as leverage, not as home.", "Check Akash bid medians and Lambda "
     "on-demand rates before accepting a managed rate; use the spread to negotiate or to "
     "route rerun-tolerant work."),
    ("Re-run this comparison quarterly.", "Provider reliability is a moving target — TensorDock "
     "deteriorated within a year of being a price leader, and decentralized entrants improve "
     "monthly."),
]
CH7_CLOSE = ("The one-sentence answer to the original question: for rented GPUs with good "
             "runtime, RunPod — Secure Cloud for continuous miners, Community for the tolerant "
             "rest — is the best provider in the field, with Vast.ai as the disciplined "
             "operator's discount arm, Lambda as the enterprise fallback, and Akash as a "
             "secondary market worth checking before any large lease.")

# ── Chapter 8 ────────────────────────────────────────────────────────────────
CH8_TITLE = "Limitations and Sources"
CH8_P1 = ("Three limitations bound this analysis. Pricing on marketplaces moves continuously; "
          "every dollar figure here is an observed median or advertised rate from June to "
          "September 2026 and should be re-verified against live catalogs before large leases. "
          "Marketplace reliability is host-level, so provider-level grades describe the "
          "distribution, not every machine on it — a well-chosen verified Vast host can and does "
          "outperform a bad managed node. Finally, platform adapter status determines what can "
          "be automated from the dashboard: RunPod and Vast.ai support live offers plus real "
          "rentals, Lambda and Akash expose live pricing only, and the remaining providers are "
          "outside the adapter set entirely.")
CH8_P2 = ("Primary sources consulted: provider pricing and documentation pages for RunPod, "
          "Vast.ai, Lambda Labs and Akash Network (accessed September 2026); the platform's own "
          "provider registry and GPU catalog offer adapters, which pull live H100/H200/A100/4090 "
          "pricing from the integrated providers; third-party comparisons including Tech Insider's "
          "RunPod vs Lambda vs Vast.ai pricing comparison (Aug 2026), Spheron's RunPod vs Vast.ai "
          "cost analysis (Jul 2026), Clore.ai's cheapest-GPU-cloud comparison (Jan 2026), and "
          "Akash Network's H100 rental price survey (Aug 2026). Where sources disagreed, the "
          "more conservative uptime assumption was used, and ranges are shown instead of false "
          "precision.")
