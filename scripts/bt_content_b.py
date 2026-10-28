# -*- coding: utf-8 -*-
"""Bittensor Complete Guide — content part B (chapters 6-9)."""

SECTIONS_B = [

# =================================================================
("h1", "Validators and Miners: Who Runs the Network"),

("body", "Miners are the network's producers. A miner registers a hotkey into a subnet, runs "
 "the subnet's current miner software on its hardware, and serves whatever the subnet demands "
 "through its Axon endpoint. Competition is continuous and anonymous: validators do not care "
 "who operates a machine, only how its outputs rank against the subnet's reward model on "
 "quality, latency, and reliability. Income follows consensus rank — top-ranked miners on a "
 "healthy subnet can out-earn the median by an order of magnitude, while bottom-decile miners "
 "may earn close to nothing. Entry barriers are modest (a small, variable registration burn "
 "plus hardware and skill), which is exactly why performance discipline separates earners "
 "from spectators."),

("body", "Validators are the network's judges — and its capital layer. A validator locks TAO "
 "as stake and, once it holds a validator permit (on the order of 1,000 TAO, historically), "
 "runs evaluation software that probes every miner in a subnet and submits weight vectors each "
 "tempo. Honest, accurate scoring is enforced economically: Yuma Consensus rewards validators "
 "whose weights align with consensus and penalizes those who deviate, so a lazy or colluding "
 "validator bleeds income. Validators and their stakers share roughly 41 percent of the "
 "subnet's emission, distributed by bond weight. Passive TAO holders participate through "
 "delegation: they nominate stake to a validator, and returns flow back proportionally — this "
 "is also the mechanism through which dTAO lets stakers direct emission toward the subnets "
 "they believe in."),

("body", "The third role, often overlooked, is the subnet owner: the team that designs the "
 "incentive mechanism, maintains the code, and earns about 18 percent of the subnet's emission "
 "as the cost of building the market. Together the three roles form a system of checks: miners "
 "cannot self-declare quality, validators cannot cheaply collude against consensus, and owners "
 "cannot move the goalposts arbitrarily without losing the stakers who fund their subnet. The "
 "chain itself is the referee — every score, weight, and payout is public in the metagraph, "
 "which is what makes the entire economy auditable by tools like Infranex BT."),

("table", {
    "ratios": [0.14, 0.22, 0.26, 0.20, 0.18],
    "header": ["Role", "Entry cost", "What they do", "Income source", "Main risk"],
    "rows": [
        ["Miner", "Small registration burn + hardware",
         "Serve the subnet's task on an Axon endpoint",
         "\u224841% of subnet emission by rank",
         "Rank collapse; deregistration"],
        ["Validator", "Permit (\u22481,000 TAO) + stake",
         "Probe and score miners; set weights",
         "\u224841% share, bond-weighted",
         "Penalties for off-consensus scoring"],
        ["Subnet owner", "Development + slot registration",
         "Design and maintain the incentive market",
         "\u224818% of emission",
         "Losing stakers; subnet recycled"],
        ["Staker / delegator", "TAO stake only",
         "Back validators and subnets via dTAO",
         "Proportional emission share",
         "Alpha/TAO price swings"],
    ],
    "caption": "Table 4 — The four participation roles: costs, jobs, income, and risks.",
}),

# =================================================================
("h1", "Why Bittensor Is a Powerful Business Model for Infranex BT"),

("body", "Four structural properties make Bittensor unusually business-friendly for a platform "
 "like Infranex BT. First, direct GPU monetization: idle or rented compute can be pointed at a "
 "subnet and begin earning within minutes, converting capital expenditure into token revenue "
 "without sales cycles. Second, revenue arrives in a hard-capped asset: every payout is TAO or "
 "subnet alpha, both governed by Bitcoin-style scarcity, so earnings potentially compound if "
 "the asset appreciates. Third, permissionless global scale: there are no contracts, no KYC "
 "gates, and no regional restrictions — a machine joins by registering a key. Fourth, and most "
 "unusual, the network pays its suppliers first-class: roughly 41 percent of all emission is "
 "reserved for miners by protocol design, not by negotiation."),

("body", "The deeper edge, however, is informational. Bittensor's 128 subnets each have "
 "different hardware requirements, reward curves, validator politics, code-update rhythms, and "
 "competitive intensities — and public dashboards only scratch that surface. The alpha is in "
 "deciding which subnet a given GPU should serve, when to switch, and when to walk away. That "
 "is precisely the problem Infranex BT is built around: the Opportunity Engine scores all 128 "
 "live subnets on a weighted seven-factor model (net TAO potential, miner competitiveness, "
 "reward sustainability, validator acceptance, GPU cost efficiency, operational reliability, "
 "and protocol-economic risk), gates every verdict behind hard evidence, and publishes "
 "RUN / WATCH / AVOID decisions with reasons attached."),

("stats", [
    ("128", "Subnet markets, one decision per GPU"),
    ("7 factors", "Weighted score behind every verdict"),
    ("Daily", "Snapshots feeding the trust loop"),
]),

("body", "Measured reality from the platform shows why selection dominates participation. In "
 "the October 2026 live snapshot, the engine classified only a handful of the 128 subnets as "
 "SCALE-grade opportunities; the strongest evidence-backed picks were SN82 Noah (video "
 "generation, projected around 12,700 dollars per month on suitable hardware at the time), "
 "SN5 Hone, and SN83 CliqueAI, with a second tier of TEST-grade markets including SN68 NOVA, "
 "SN9, and SN107 Minos. The rest of the field was WATCHLIST or explicitly AVOID — negative "
 "net earnings, unverified payouts, or hardware-incompatible. A miner that deploys without "
 "this filter is rolling dice; a miner that deploys with it is allocating capital."),

("body", "Beyond mining, the same data opens second-order businesses. dTAO made TAO itself "
 "productive, so a treasury strategy — staking into well-chosen subnets and alpha markets — "
 "is now a first-class revenue line alongside compute. Subnet ownership offers the 18 percent "
 "emission share to teams that can build and defend a market slot. And the platform's daily "
 "snapshots and trust loop, which compare projected versus actual earnings for every "
 "deployment, compound into a proprietary dataset that competitors cannot buy — the classic "
 "data moat, but denominated in on-chain truth."),

("body", "Honesty requires naming the risks. TAO's price is volatile in both directions; "
 "per-subnet emission decays as alpha halvings progress; the 128-slot cap means a weak subnet "
 "can be deregistered, stranding miners who depend on it; validator stake remains concentrated "
 "enough that reputation matters; and each halving tightens the emission tap, raising the bar "
 "for efficiency. None of these are disqualifying — they are the reasons disciplined "
 "intelligence, rather than raw participation, is the business."),

("table", {
    "ratios": [0.24, 0.40, 0.36],
    "header": ["Infranex BT module", "Business function", "Value produced"],
    "rows": [
        ["Miner Fit", "Match hardware profiles to subnet requirements",
         "No wasted capital on incompatible deployments"],
        ["Opportunity Engine", "Seven-factor scoring, verdicts, and difficulty grading",
         "Capital goes only where evidence supports it"],
        ["Deployments", "One-click provisioning with spend caps and projections",
         "Speed to market with enforced risk limits"],
        ["Earnings and Wealth", "Per-hotkey revenue tracking in TAO and USD",
         "Closed feedback loop between forecast and actual"],
        ["DevOps engine", "Uptime, Axon reachability, self-healing services",
         "The earn-zero failure mode is engineered out"],
        ["Daily snapshots", "Economics history per subnet, trust calibration",
         "A compounding proprietary data moat"],
    ],
    "caption": "Table 5 — How each Infranex BT module converts network data into business advantage.",
}),

# =================================================================
("h1", "The Miner's Playbook: From GPU to TAO"),

("body", "Everything above reduces to a practical sequence. Getting a GPU to earn in Bittensor "
 "is not mysterious — it is a checklist, and every failed miner can trace zero earnings to "
 "skipping one of its steps. The playbook below is the same one the Infranex BT platform "
 "automates; running it by hand first is the best way to understand what the automation is "
 "worth."),

("numbered", [
    "Match hardware to a subnet before doing anything else. Check VRAM, GPU generation, "
    "bandwidth, and whether the subnet demands GPUs at all — the Miner Fit view grades all 128 "
    "markets against your exact profile and flags hard incompatibilities before you spend money.",
    "Register a hotkey in the chosen subnet. Registration burns a small, variable fee that "
    "rises with demand for that subnet; confirm the current fee before committing, and register "
    "directly rather than through intermediaries so you hold the keys.",
    "Make the Axon endpoint publicly reachable. Open the port, set the firewall, and verify "
    "from outside your network. Unreachable Axons are the single most common cause of mining "
    "for zero — the chain cannot score what it cannot contact.",
    "Run the subnet's current miner code — and keep it current. Subnet teams ship protocol "
    "updates that can change models, schemas, or scoring overnight; miners who miss an update "
    "fall off the ranking within hours. Pin the release channel and watch for announcements.",
    "Track per-hotkey earnings daily and verify payouts on chain, not in a dashboard's "
 "promise. Compare realized emission against the projection you deployed on; a gap is the "
    "earliest signal that competition or mechanics have shifted.",
    "Iterate or switch. If tuned performance stays in the bottom decile after a fair run, move "
    "the GPU. The registration burn is small compared to weeks of sub-median emission — the "
    "expensive mistake is staying in the wrong market, not moving.",
]),

("body", "Six factors decide whether a miner climbs the ranking. Reachability and latency come "
 "first because they gate everything else; output quality is what the reward model actually "
 "scores; uptime compounds trust with validators; version discipline protects accumulated "
 "position; and subnet selection — the meta-factor — determines whether excellence is worth "
 "anything at all in that market. Infranex BT automates the monitoring of all six, and the "
 "roadmap extends this: a registration desk for one-click onboarding, continuous Axon probes "
 "that alert before validators notice, per-hotkey earnings reconciliation, deregistration-risk "
 "alarms, and subnet code-update alerts."),

("table", {
    "ratios": [0.20, 0.42, 0.38],
    "header": ["Success factor", "Why it matters", "How Infranex BT helps"],
    "rows": [
        ["Axon reachability", "Unreachable miners earn zero regardless of quality",
         "Deployment checks plus planned continuous probes"],
        ["Output quality", "The reward model pays exactly what it scores",
         "Subnet verdicts flag competitive intensity first"],
        ["Latency", "Validators time out slow responses under load",
         "Hardware fit scoring prevents overloaded setups"],
        ["Uptime", "Missed tempo windows permanently cost rank",
         "DevOps self-healing and performance-lag alerts"],
        ["Version updates", "Stale miners drop off after protocol changes",
         "Planned subnet update alarms"],
        ["Subnet selection", "Excellence in a bad market still pays nothing",
         "Seven-factor engine with evidence-gated verdicts"],
    ],
    "caption": "Table 6 — What separates earning miners from zero-balance miners.",
}),

("body", "Costs and risks deserve the same clarity as the upside. Direct costs include the "
 "registration burn, GPU capital or rental (A100-class machines rent in the range of a dollar "
 "or two per hour on most markets), electricity, and the engineering time to stay current. "
 "Structural risks include subnet deregistration, mid-flight protocol changes, emission decay "
 "as alpha halvings progress, and TAO price volatility on the revenue line. The playbook's "
 "answer to all of these is the same: measure continuously, verify on chain, and pre-commit "
 "to switching rules so that exit decisions are made by evidence rather than by hope."),

# =================================================================
("h1", "Quick Reference and Glossary"),

("body", "The numbers below snapshot the network as of late October 2026, compiled from public "
 "network dashboards and live platform telemetry. They are approximate by nature and will "
 "drift with the market; the structural facts — the 21 million cap, the 41/41/18 split, the "
 "halving schedule — are fixed by protocol and can be relied on. Before any financial "
 "decision, verify current values on the official interfaces listed at the end of this "
 "guide."),

("table", {
    "ratios": [0.44, 0.56],
    "header": ["Key number (late Oct 2026)", "Value"],
    "rows": [
        ["TAO price / market cap", "\u2248 $255 / \u2248 $2.9B"],
        ["Circulating supply", "\u2248 11.3M of 21,000,000 hard cap"],
        ["Staked share of circulating TAO", "\u2248 70%"],
        ["Daily TAO emission (post-halving)", "3,600 TAO"],
        ["First / second halving", "Dec 2025 (10.5M) / \u2248 2030 (15.75M)"],
        ["Subnet slots", "128 active; expansion to 256 planned"],
        ["Alpha token market cap (Mar 2026)", "\u2248 $1.12B"],
        ["Subnet economic activity (Q1 2026)", "\u2248 $43M"],
        ["Miner share of subnet emission", "\u2248 41%"],
    ],
    "caption": "Table 7 — Network key numbers at a glance.",
}),

("table", {
    "ratios": [0.26, 0.74],
    "header": ["Term", "Meaning"],
    "rows": [
        ["TAO", "Bittensor's native token; 21M hard cap, Bitcoin-style halvings"],
        ["dTAO", "Dynamic TAO — the Feb 2025 upgrade giving subnets token economies"],
        ["Alpha token", "A subnet's own 21M-cap token, priced against TAO in its pool"],
        ["Subnet", "A self-contained market with its own task, rewards, and economy"],
        ["Netuid", "A subnet's numeric ID on the chain (SN82 = netuid 82)"],
        ["Neuron", "Any registered participant (miner or validator) in a subnet"],
        ["Axon", "A miner's public API endpoint that validators query"],
        ["Dendrite", "The validator-side client used to probe miners"],
        ["Metagraph", "On-chain directory of a subnet's neurons, stakes, and weights"],
        ["Tempo", "The epoch heartbeat (\u2248360 blocks, \u224812 minutes) when weights settle"],
        ["Yuma Consensus", "The collusion-resistant mechanism aggregating validator weights"],
        ["Hotkey / coldkey", "Operational key for mining; offline key holding the stake"],
        ["Stake", "TAO bonded to a validator or subnet; the lever dTAO votes with"],
        ["Registration", "Committing a hotkey to a subnet for a small burn fee"],
        ["Emission", "Newly issued TAO/alpha paid to participants each epoch"],
        ["Deregistration", "Removal of a subnet or neuron when slots are contested"],
    ],
    "caption": "Table 8 — Working glossary of Bittensor terms.",
}),

("body", "For deeper study, three sources cover almost everything: the official documentation "
 "at bittensor.com for protocol mechanics and dTAO details, the network interface at "
 "bittensor.ai for live subnet dashboards and token data, and taostats.io for chain analytics. "
 "Inside the Infranex BT platform, the Miner Fit and Opportunities views translate this guide's "
 "concepts into live, scored decisions on all 128 subnets — which is the point of having "
 "built it: the guide explains the machine, and the machine works the market."),

("h2", "Where to go next"),

("bullets", [
    "bittensor.com/docs — protocol documentation: emissions, dTAO, Yuma Consensus, and the "
    "official subnet developer guides; start here for mechanism-level detail.",
    "bittensor.ai — the network's front page: live TAO price, per-subnet dashboards, alpha "
    "pools, and registration status for all 128 slots.",
    "taostats.io — chain analytics: supply history, emission flows, validator distributions, "
    "and historical metagraph data for any subnet.",
    "Infranex BT — the Miner Fit view for hardware matching, the Opportunities view for "
    "scored verdicts across all subnets, and Deployments for execution with enforced spend "
    "caps; the platform operationalizes every step of the playbook in chapter 8.",
]),

("body", "A final orientation for the reader: Bittensor rewards people who verify rather than "
 "trust, and who treat every twelve-minute epoch as fresh evidence. Use this guide to build "
 "the mental model, use the official documentation to verify every mechanism it summarizes, "
 "and use the platform to keep the model synchronized with a market that reprices intelligence "
 "twice an hour. The network is young, the emission is front-loaded, and the tools are now in "
 "place — the remaining variable is disciplined participation."),

]
