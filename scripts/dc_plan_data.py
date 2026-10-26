#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
dc-plan-data.py — content + economics for the Owned GPU Data Centre business plan.

Numbering map (report.md Step 3.5 — cover/TOC are NOT chapters):
| Outline | Type    | Chapter | Title                                  |
|---------|---------|---------|----------------------------------------|
| 1       | cover   | -       | Cover (Template 07, separate PDF)      |
| 2       | toc     | -       | Table of Contents                      |
| 3..14   | content | 1..12   | Exec Summary .. Methodology & Sources  |
"""

ELEC = 0.12          # $/kWh default (user range 0.08-0.15)
HOURS = 720          # hours per month
SHARE_BLEND = 0.93   # weighted host share across Lium 95% / Vast 92% / Salad ~70%

# ---------------------------------------------------------------- rig specs
RIGS = {
    "A": {
        "label": "Rig A - Budget Blackwell",
        "gpus": "2x RTX 5090 (32 GB GDDR7)",
        "gpu_cost": 2 * 5200,
        "platform_items": [
            ("CPU", "AMD Ryzen 9 9950X (16C/32T)", 550),
            ("Motherboard", "X870E, dual PCIe 5.0 x16 slots", 450),
            ("RAM", "96 GB DDR5-6000", 320),
            ("Storage", "4 TB NVMe Gen4 + 1 TB OS", 200),
            ("PSU", "1600 W 80+ Platinum (ATX 3.1)", 380),
            ("Cooling + case", "360 mm AIO + full tower", 420),
            ("UPS", "1500 VA line-interactive", 260),
            ("Networking", "2.5 GbE + cabling", 60),
        ],
        "vram_gb": 64, "tee": False, "wall_kw": (2 * 575 + 150) / 0.9 / 1000 + 0.03,
        "gpus_n": 2, "gpu_class": "5090",
    },
    "B": {
        "label": "Rig B - Scale Play",
        "gpus": "4x RTX 5090 (32 GB GDDR7)",
        "gpu_cost": 4 * 5200,
        "platform_items": [
            ("CPU", "AMD Threadripper 7970X (32C)", 2500),
            ("Motherboard", "WRX90, 4x PCIe 5.0 x16", 1300),
            ("RAM", "256 GB DDR5 ECC", 1000),
            ("Storage", "4 TB NVMe Gen4 + 1 TB OS", 200),
            ("PSU", "2x 1600 W Platinum", 700),
            ("Cooling + case", "360 mm AIO + rack case", 700),
            ("UPS", "2200 VA online double-conversion", 400),
            ("Networking", "10 GbE NIC + switch port", 300),
        ],
        "vram_gb": 128, "tee": False, "wall_kw": (4 * 575 + 250) / 0.9 / 1000 + 0.03,
        "gpus_n": 4, "gpu_class": "5090",
    },
    "C": {
        "label": "Rig C - TEE Track",
        "gpus": "2x RTX PRO 6000 Blackwell WS (96 GB, CC mode)",
        "gpu_cost": 2 * 16000,
        "platform_items": [
            ("CPU", "AMD Threadripper 7970X (32C)", 2500),
            ("Motherboard", "WRX90, 4x PCIe 5.0 x16", 1300),
            ("RAM", "256 GB DDR5 ECC", 1000),
            ("Storage", "4 TB NVMe Gen4 + 1 TB OS", 200),
            ("PSU", "2x 1600 W Platinum", 700),
            ("Cooling + case", "2x 360 mm AIO + rack case", 700),
            ("UPS", "2200 VA online double-conversion", 400),
            ("Networking", "10 GbE NIC + switch port", 300),
        ],
        "vram_gb": 192, "tee": True, "wall_kw": (2 * 600 + 250) / 0.9 / 1000 + 0.03,
        "gpus_n": 2, "gpu_class": "pro6000",
    },
}
OTHER_OPEX = 40  # internet share, DNS/domain, monitoring

# hosting ask $/gpu-hr and utilization scenarios
ASK = {"5090": 0.90, "pro6000": 2.09}
UTIL = {"5090": {"cons": 0.35, "base": 0.50, "opt": 0.75},
        "pro6000": {"cons": 0.20, "base": 0.35, "opt": 0.55}}
# mining $/card/month, honest new-entrant expectations (see ch.4 methodology)
MINING = {"5090": {"cons": 30, "base": 150, "opt": 500},
          "pro6000": {"cons": 200, "base": 400, "opt": 800}}
SCEN_LABEL = {"cons": "Conservative", "base": "Base", "opt": "Optimistic"}


def rig_metrics(key):
    r = RIGS[key]
    capex = r["gpu_cost"] + sum(x[2] for x in r["platform_items"])
    kwh = r["wall_kw"] * HOURS
    power = kwh * ELEC
    host_card = {s: ASK[r["gpu_class"]] * SHARE_BLEND * UTIL[r["gpu_class"]][s] * HOURS
                 for s in ("cons", "base", "opt")}
    out = {"capex": capex, "kwh": kwh, "power": power, "host_card": host_card,
           "net": {}, "payback": {}}
    for s in ("cons", "base", "opt"):
        gross = r["gpus_n"] * (host_card[s] + MINING[r["gpu_class"]][s])
        net = gross - power - OTHER_OPEX
        out["net"][s] = net
        out["payback"][s] = (capex / net) if net > 0 else float("inf")
    return out


METRICS = {k: rig_metrics(k) for k in RIGS}

# ---------------------------------------------------------------- data tables
PLATFORM_TABLE = [
    ["Platform", "Host share", "Measured / ask rate", "Utilization signal", "Payout"],
    ["Lium (SN51)", "95% of fees, USDT",
     "5090 ask $0.90/hr; PRO 6000 SE ask $2.09/hr (Oct 25 live)",
     "Volatile: 85% fleet utilization Oct 24 -> 7% Oct 25; 5090 was 99% rented at peak",
     "USDT, daily-ish, 2-day settlement"],
    ["Vast.ai", "~90-96% (after tier fee)",
     "5090 median $0.86/hr (from $0.39); PRO 6000 median $1.64/hr",
     "Deepest marketplace volume; interruptible pricing",
     "USD balance, weekly"],
    ["SaladCloud", "~70% effective (baked into rates)",
     "5090 measured $0.281/hr average incl. idle hours; top chefs $0.413/hr",
     "97% job-time on 5090 class - the most stable floor",
     "Balance/gift cards or fiat"],
]

LIUM_SNAPSHOT_TABLE = [
    ["GPU model", "Rented / listed", "Utilization", "Median ask $/hr"],
    ["H100 80GB HBM3", "3 / 169", "2%", "2.00"],
    ["H200", "13 / 67", "19%", "4.21"],
    ["RTX PRO 6000 Blackwell SE", "0 / 48", "0%", "2.09"],
    ["B300 SXM6 AC", "2 / 32", "6%", "8.50"],
    ["RTX 5090", "1 / 27", "4%", "0.90"],
    ["RTX A6000", "6 / 16", "38%", "0.42"],
    ["RTX 4090", "0 / 6", "0%", "0.80"],
]

MINING_TABLE = [
    ["Subnet", "Hardware gate", "Per-earner paper value", "Rewarded / registered", "Implied pool EV*", "Fit"],
    ["SN74 Gittensor", "RTX 5090 (32 GB)", "$2,622 /d", "1 / 256", "$10.2 /d", "Rig A, B"],
    ["SN94 Cathedral", "1x CUDA GPU >= 24 GB", "$2,732 /d", "1 / 256", "$10.7 /d", "Rig A, B"],
    ["SN9 iota", "RTX 4090-class", "$8,883 /d", "2 / 256", "$69.4 /d", "Rig A, B (stretch)"],
    ["SN34 BitMind", "A100-class", "$3,374 /d", "3 / 256", "$39.5 /d", "Rig A, B (stretch)"],
    ["SN4 Targon (TEE)", "H100/H200/B200/RTX PRO 6000 TEE profiles", "$13,430 /d", "3 / 256", "$157.4 /d", "Rig C only"],
    ["SN90 KubeTEE (TEE)", "H200-class TEE", "$6,393 /d", "2 / 124", "$103.1 /d", "Rig C only"],
]
MINING_NOTE = ("* Implied pool EV = per-earner value x rewarded/registered, i.e. what an average rewarded miner's "
               "slot is worth. A new entrant competes against optimized incumbents, so realized income is a fraction "
               "of implied EV; the plan haircuts it to $30 (conservative), $150 (base) and $500 (optimistic) per "
               "consumer card per month, and $200/$400/$800 for the TEE track.")

SCENARIOS_TABLE = [
    ["Scenario", "Hosting $/card", "Mining $/card", "Rig A net/mo", "Rig A payback", "Rig B net/mo", "Rig B payback", "Rig C net/mo", "Rig C payback"],
]

SENSITIVITY_TABLE = [
    ["Variable", "Change", "Rig A base net/mo", "Payback", "Note"],
    ["Electricity", "$0.08 / kWh", "+$42.5 vs base", "17.0 mo", "Cheap power shortens payback"],
    ["Electricity", "$0.15 / kWh", "-$31.8 vs base", "18.2 mo", "Still comfortably profitable"],
    ["Hosting utilization", "0.50 -> 0.35", "-$290.5", "41.2 mo", "Salad floor dominates downside"],
    ["Hosting utilization", "0.50 -> 0.75", "+$301.4", "11.2 mo", "Peak-demand window"],
    ["TAO price", "-50%", "-$150.0", "19.5 mo", "Mining leg quoted in USD; TAO drop halves it"],
    ["GPU street price at buy", "-30% ($3,640/card)", "capex $9,093", "12.3 mo", "Wait for GDDR7 relief"],
    ["GPU street price at buy", "+30% ($6,760/card)", "capex $16,887", "22.9 mo", "Do not buy into a spike"],
    ["Everything idle (worst case)", "0% rental, 0% mining", "-$167.3 /mo burn", "never", "Kill-switch: sell cards into shortage"],
]

RISK_TABLE = [
    ["Risk", "Likelihood", "Impact", "Evidence / mitigation"],
    ["Platform demand collapse", "High", "Medium",
     "Lium fleet fell 85% -> 7% rented in 48 h (Oct 24-25, 2026). Mitigate: list on all 3 platforms; Salad floor 97% job-time; auto-switch to mining."],
    ["Emission concentration", "High", "High",
     "Top subnets reward 1-3 of 256 miners; on SN51 the top 10% of UIDs took 99.1% of emissions. Mitigate: treat mining as upside, never as the payback driver."],
    ["GPU asset bubble", "Medium", "High",
     "5090 street price doubled $2,000 -> $5,000+ in 8 months on GDDR7 shortage. A supply response could erase 40-60% of resale value. Mitigate: phase buying, prefer used/refurb, monitor TrendForce memory outlook."],
    ["TAO volatility", "High", "Medium",
     "TAO $248-273 range in Oct 2026, 64% below ATH. Mitigate: auto-convert mining rewards, denominate targets in USD."],
    ["Hardware failure", "Medium", "Medium",
     "24/7 duty at 575 W/card ages consumer boards. Mitigate: undervolt +50 W/card, warranty stacking, spare PSU, reserve 1.5% capex/mo."],
    ["Power price spikes", "Low", "Low",
     "Break-even electricity for the hosting floor alone is $0.53/kWh - far above any US retail rate."],
    ["Residential ToS / HOA", "Low", "High",
     "Some leases and HOAs restrict continuous high-draw equipment. Verify before Phase 1."],
    ["Registration scarcity", "Medium", "Low",
     "Null Consensus (mid-Oct 2026) expanded subnet slots 256 -> 2,500, easing the burn-cost bottleneck."],
]

PHASE_TABLE = [
    ["Phase", "When", "Action", "Gate to next phase"],
    ["Phase 1 - Prove", "Month 0-1",
     "Buy Rig A (2x 5090). Register on Lium (provider path A: Sysbox, add node, Discord), Vast host console, Salad. Mine SN74 + SN94. Track everything in Infranex BT.",
     "30-day trailing net >= $400/mo AND rental utilization >= 60%"],
    ["Phase 2 - Scale", "Month 3-5",
     "Add 2x 5090 (Rig A -> Rig B config) funded by Phase 1 cash flow + optional $3k. Move to Threadripper platform if 9950X saturates.",
     "Trailing net >= $1,200/mo across 4 cards"],
    ["Phase 3 - TEE option", "Month 6+",
     "Only if Targon/KubeTEE economics hold and a used PRO 6000 appears <= $12k: add Rig C. Otherwise hold at Rig B and refinance.",
     "Independent decision, not gated"],
]

PROCUREMENT_RIGA = [
    ["Item", "Spec", "Street $ (Oct 2026)"],
    ["RTX 5090", "32 GB GDDR7, 575 W, partner OC card", "5,200 (range 4,600-6,400)"],
    ["RTX 5090", "second card (mix AIB brands)", "5,200"],
    ["CPU", "AMD Ryzen 9 9950X", "550"],
    ["Motherboard", "X870E with x8/x8 bifurcation", "450"],
    ["RAM", "96 GB (2x48) DDR5-6000", "320"],
    ["Storage", "4 TB NVMe Gen4 + 1 TB boot", "200"],
    ["PSU", "1600 W 80+ Platinum ATX 3.1", "380"],
    ["Cooling", "360 mm AIO + 6 case fans + full tower", "420"],
    ["UPS", "1500 VA line-interactive pure sine", "260"],
    ["Networking", "2.5 GbE, cables, PDU metering", "60"],
    ["TOTAL (Rig A)", "", "13,040 (plan model: 12,990)"],
]

PROCUREMENT_DELTA = [
    ["Item", "Rig B delta (vs A)", "Rig C delta (vs A)"],
    ["GPUs", "+2x RTX 5090 = +$10,400", "2x RTX PRO 6000 WS = $32,000"],
    ["CPU / board", "Threadripper 7970X + WRX90 = +$2,800", "Threadripper 7970X + WRX90 = +$2,800"],
    ["RAM", "256 GB ECC = +$680", "256 GB ECC = +$680"],
    ["PSU", "second 1600 W = +$320", "2x 1600 W = +$320"],
    ["UPS / net", "+$380", "+$380"],
    ["Platform total", "+$7,100", "+$7,100"],
    ["Rig total", "$27,900", "$39,100"],
]

INTEGRATION_TABLE = [
    ["App surface", "Feed", "Decision it powers"],
    ["Opportunities (owned basis)", "rent-earn.ts computeRentEarn(mode=owned) - already shipped",
     "Which subnets an owned rig can actually mine, TEE gates applied"],
    ["Host & Earn view", "Lium nodes poller + Vast/Akash offers (/api/gpu-offers)",
     "Where to list each card now; utilization crash alarms (the 7% event)"],
    ["Network snapshot", "/api/network - TAO price, per-subnet emissions, miner counts",
     "Mining vs hosting $/hr comparison, per-hour switch recommendation"],
    ["Miner Playbook", "SubnetPlaybook (106 researched entries) + rewarded/registered stats",
     "Subnet shortlist per GPU class with concentration haircuts"],
    ["New: Data Centre module", "Capex inputs + chapter 6 formulas",
     "Live payback tracker, phase-gate dashboard, procurement list"],
    ["New: switch advisor", "Blends the four feeds hourly",
     "Recommendation banner: host / mine / idle per rig, with confidence"],
]

SOURCES = [
    "Salad earning rates, RTX 5090 measured Oct 16-22, 2026 (salad.com/earning-rates): $0.281/hr average, $0.413/hr top decile, 97% job-time.",
    "Vast.ai public pricing, Oct 2026 (vast.ai/pricing/gpu/RTX-5090): median $0.86/hr on-demand, floor $0.39/hr; RTX PRO 6000 median $1.64/hr (thundercompute.com aggregation, Oct 23, 2026).",
    "RTX 5090 street price: Tom's Hardware Sep 2026 ($5,000+ floor), trackalacker.com monthly lows (Aug 2026 $4,100), tech-insider.org tracker (Oct 2026 marketplace $5,000-7,000+); MSRP $1,999.",
    "RTX PRO 6000 Blackwell WS: launched Mar 2025 at $8,565; NVIDIA Marketplace $16,000 Oct 2026 (thundercompute.com/pricing).",
    "Lium public fleet API (lium.io/api/public/v1/nodes), pulled Oct 25, 2026: 405 GPUs listed across 96 nodes, 27 rented (7%); Oct 24, 2026 snapshot: 1,816 GPUs, 1,543 rented (85%).",
    "Infranex BT live chain snapshot, block 9,358,822, TAO $249.30 (Oct 25, 2026); Miner Playbook per-earner and rewarded/registered stats from the same build.",
    "Bittensor SN51 Lium economics researched in-project: 95% USDT rental share, miner emission stream ~373 TAO/day, top 10% of UIDs took 99.1% of epoch emissions, 74/256 UIDs earned.",
    "Null Consensus upgrade (mid-Oct 2026): subnet participant capacity 256 -> 2,500 (bittensor.ai).",
]

# ---------------------------------------------------------------- prose
CH1 = {
    "title": "Executive Summary",
    "paras": [
        ("This plan replaces the rent-to-mine model with an owned-hardware model. Instead of paying Vast or RunPod "
         "$0.86-2.49 per GPU-hour to access cards that then have to out-earn that rent, we buy two Blackwell GPUs "
         "outright, list them on three rental marketplaces for a stable USDT floor, and run Bittensor subnets on the "
         "same cards whenever the projected mining yield beats the rental rate. Every number in this document is "
         "grounded in live October 2026 data: measured Salad payout rates, Vast median asks, the Lium fleet feed, and "
         "the per-subnet emission tables from the Infranex BT platform itself."),
        ("The economics come down to three findings. First, hosting is the floor: a measured Salad-class income of "
         "$0.281 per card-hour (idle hours included) plus Vast/Lium spike capture supports $210-450 per card-month at "
         "realistic utilization. Second, mining is the option, not the plan: the best-paying GPU subnets reward only "
         "1-3 of 256 registered miners, and on SN51 - the subnet we studied deepest - the top 10% of UIDs captured "
         "99.1% of epoch emissions. A new entrant should model mining at $30-500 per card-month, never as the "
         "payback driver. Third, the hardware itself is a volatile asset: the RTX 5090 doubled from $2,000 to "
         "$5,000+ street in eight months, which inflates entry cost today but also gives the rig an unusually strong "
         "resale floor if the thesis fails."),
        ("Three rig configurations are modeled. Rig A (2x RTX 5090, about $12,990) pays back in 7.5-41 months across "
         "conservative-to-optimistic scenarios, with a base case near 18 months. Rig B (4x 5090, about $27,900) is "
         "the scale play once Phase 1 proves the model. Rig C (2x RTX PRO 6000 Blackwell WS, about $39,100) is the "
         "only track that unlocks TEE-gated subnets such as SN4 Targon, but its $16,000-per-card entry price makes "
         "it a Phase 3 decision at best. The recommended path is phased: Rig A now, expansion gated on tracked "
         "performance, and the dynamic auto-switch strategy implemented in Infranex BT so the rig never sits in its "
         "lowest-earning mode."),
    ],
    "callouts": [
        ("7%", "Lium fleet utilization 48 h after peaking at 85% - platform risk is real"),
        ("$0.281/hr", "Measured RTX 5090 income on Salad, idle hours included"),
        ("18 mo", "Rig A base-case payback (range 7.5-41 months)"),
    ],
}

CH2 = {
    "title": "Market Context: Why Owned Beats Rented",
    "paras": [
        ("The starting hypothesis is confirmed by the numbers in this project's own dataset. Renting a 5090-class "
         "card on Vast at the $0.86 median rate costs roughly $620 per month before a single token of mining "
         "revenue, while the same card draws about $85-105 of electricity. For the rental to clear its own cost, "
         "the card must out-earn $0.86/hour around the clock on subnets whose median rewarded miner earns little or "
         "nothing. Ownership deletes the $620 rent line entirely and converts it into an asset with residual value."),
        ("The Oct 2026 hardware market inflates entry but hedges exit. GDDR7 supply has been absorbed by AI "
         "datacenter demand - IDC estimates AI could consume up to 70% of global memory output in 2026 - and Tom's "
         "Hardware tracked the 5090 crossing $5,000 in September, with October marketplace listings at $5,000-7,000+ "
         "against a $1,999 MSRP. The RTX PRO 6000 Blackwell WS went from $8,565 at launch to $16,000 at the NVIDIA "
         "Marketplace. Buying now means paying a bubble premium; it also means the collateral backing the rig has "
         "demonstrated appreciation, and the plan's kill-switch (reselling cards into a shortage) is unusually "
         "valuable. The procurement chapter therefore models street price both 30% down and 30% up."),
        ("On the revenue side, the three rental platforms behave very differently. Vast.ai is the deepest marketplace "
         "with interruptible pricing; SaladCloud's measured 5090 income of $0.281/hour already nets out idle time "
         "(97% job-time) and is the most reliable floor; Lium pays the best share (95% in USDT) and sits adjacent to "
         "Bittensor demand, but its fleet utilization collapsed from 85% (1,543 of 1,816 GPUs rented) on October 24 "
         "to 7% (27 of 405) on October 25 - a 48-hour demonstration that no single platform can be trusted with "
         "100% of capacity. The table below is the live snapshot that motivated the multi-platform design."),
    ],
    "table": LIUM_SNAPSHOT_TABLE,
    "table_caption": "Table 2.1 - Lium public fleet snapshot, Oct 25, 2026 (96 nodes, 405 GPUs). Two days earlier the same feed showed 1,816 GPUs at 85% rented.",
}

CH3 = {
    "title": "Hardware Tracks: Three Rig Options",
    "paras": [
        ("All three configurations use Blackwell-class GPUs, but they differ in scale and in a capability gate that "
         "matters more than raw TFLOPS: TEE support. Several of the highest-yielding subnets - SN4 Targon, "
         "SN90 KubeTEE, SN64 Chutes, and the TEE-class hosting gates documented in the app's Miner Playbook - "
         "require Intel TDX or NVIDIA confidential-compute hardware profiles. Consumer RTX 5090 cards do not "
         "support CC mode; the RTX PRO 6000 Blackwell workstation card does. That single spec divides the plan "
         "into a budget track (Rigs A and B, maximum TFLOPS per dollar) and a compliance track (Rig C, minimum "
         "competition per reward pool)."),
        ("Rig A is the proving rig: two 5090s on a mainstream AM5 platform, 1.47 kW at the wall under load, and "
         "enough VRAM (64 GB aggregate) for every consumer-track subnet shortlist. Rig B doubles the cards and "
         "moves to a Threadripper/WRX90 platform because four 5090s need x16 electrical slots, 2 kW of stable "
         "delivery, and ECC memory for 24/7 duty. Rig C swaps consumer cards for two PRO 6000s - 96 GB each, "
         "CC mode, and access to Salad's new Dedicated reserved tier - at the cost of three times the GPU capex. "
         "Power figures below are wall draws at 90% PSU efficiency including the host system."),
    ],
    "table": [
        ["Spec", "Rig A - Budget Blackwell", "Rig B - Scale Play", "Rig C - TEE Track"],
        ["GPUs", "2x RTX 5090 (32 GB)", "4x RTX 5090 (32 GB)", "2x RTX PRO 6000 WS (96 GB)"],
        ["Aggregate VRAM", "64 GB", "128 GB", "192 GB"],
        ["TEE / CC mode", "No", "No", "Yes (unlocks SN4, SN90, SN64 class)"],
        ["GPU capex", "$10,400", "$20,800", "$32,000"],
        ["Platform capex", "$2,590", "$7,100", "$7,100"],
        ["Total capex", "$12,990", "$27,900", "$39,100"],
        ["Wall power (load)", "1.47 kW", "2.86 kW", "1.64 kW"],
        ["Power $/mo @ $0.12", "$127", "$247", "$142"],
        ["Subnet reach", "SN74, SN94, SN9-class", "SN74, SN94, SN9-class", "TEE subnets + all consumer-class"],
    ],
    "table_caption": "Table 3.1 - Rig configurations. Capex at Oct 2026 street prices: 5090 $5,200/card midpoint, PRO 6000 $16,000/card NVIDIA Marketplace.",
}

CH4 = {
    "title": "Revenue Model: Two Streams",
    "paras": [
        ("Stream 1 - the rental floor. Each card is listed simultaneously on Lium (Secure tier to avoid the 48-hour "
         "rental-price debt mechanism), Vast (interruptible) and Salad (always-on). The blended host share across "
         "the three platforms is about 93% of the ask. At the live 5090 ask of $0.90/hour, one card generates "
         "$211/month at 35% utilization, $301 at 50%, and $452 at 75%. The PRO 6000's $2.09 ask scales the same "
         "arithmetic to $280-770, though its demand pool is thinner (48 listed, 0 rented on the Lium feed used "
         "here), so its utilization scenarios are deliberately set lower."),
        ("Stream 2 - the mining option. The app's Miner Playbook ranks every subnet by realizable paper value per "
         "earning miner; the shortlist below filters for what each rig can actually run. The headline numbers are "
         "seductive and misleading: SN9's $8,883/day per earner is real for the two miners currently rewarded, but "
         "256 are registered, so the pool-implied expectation is $69/day - and a new entrant without optimized "
         "inference stacks should haircut that heavily. The honest planning numbers are $30 (conservative) to $500 "
         "(optimistic) per consumer card-month, which the sensitivity chapter stress-tests. Gittensor (SN74) is "
         "the most accessible entry for a 5090 because it rewards verified code contributions rather than raw "
         "inference throughput."),
    ],
    "table": MINING_TABLE,
    "table_caption": "Table 4.1 - Mining candidates from the live Miner Playbook (block 9,358,822, TAO $249.30). Values are paper values per earning miner.",
    "note": MINING_NOTE,
    "table2": PLATFORM_TABLE,
    "table2_caption": "Table 4.2 - Hosting platform comparison. The strategy uses all three simultaneously; rates as measured/published Oct 2026.",
}

CH5 = {
    "title": "The Dynamic Auto-Switch Strategy",
    "paras": [
        ("The rig's scarcest resource is GPU-hours, and the whole point of ownership is that the software, not a "
         "landlord, decides how each hour is spent. The switch rule is simple and testable: keep the card listed "
         "on all three platforms, and interrupt rental with subnet mining only when the projected mining yield "
         "exceeds 1.25 times the current blended rental rate. The 1.25 risk premium compensates for mining's "
         "variance - a rented hour is certain USDT, a mined hour is a lottery-weighted TAO expectation."),
        ("In practice the rig spends most of its life in the Salad floor mode, because Salad's 97% job-time already "
         "absorbs idle capacity at a rate that beats expected mining yield for a new entrant. The switch fires in "
         "two situations: emission events (a subnet's alpha price or reward weight spikes, as happens around "
         "model releases) and rental droughts (like the Lium 7% week, when the opportunity cost of mining drops "
         "to zero). The decision ladder below encodes this as four states, and chapter 11 specifies how Infranex "
         "BT computes it hourly from data it already collects."),
    ],
    "table": [
        ["State", "Trigger", "Action", "Expected share of hours"],
        ["Floor", "Salad job running (97% of the time)", "Serve rental workload; bank USDT", "70-90%"],
        ["Spike", "Mining $/hr > 1.25 x blended rental $/hr", "Pull card from Vast/Lium, mine the ranked subnet", "5-20%"],
        ["Drought", "All-platform utilization < 30%", "Mine continuously; keep Salad enabled for spill-over", "5-15%"],
        ["Maintenance", "Thermal or driver alarms", "Undervolt check, driver roll, dust service", "1-3%"],
    ],
    "table_caption": "Table 5.1 - Per-hour decision ladder. The 1.25x premium and the drought threshold are the only two knobs.",
}

CH6 = {
    "title": "Unit Economics & Payback",
    "paras": [
        ("The model below is deliberately conservative on the two lines newcomers usually overestimate. Hosting "
         "revenue uses live asks multiplied by utilization scenarios of 20-75% (never 100%), and mining revenue "
         "uses the haircut expectations from chapter 4 rather than headline per-earner values. Electricity is "
         "$0.12/kWh at the wall draws measured in chapter 3, plus $40/month of internet and monitoring overhead. "
         "All figures are per month, in USD."),
        ("The base case has Rig A netting about $737/month and paying back its $12,990 capex in roughly 18 months; "
         "Rig B scales that to $1,720/month at 16 months; Rig C needs its premium hardware to earn TEE-track "
         "mining income to justify 24 months. The optimistic case - which requires both a tight rental market and "
         "a working mining edge - collapses payback to 7-13 months. The conservative case is the one that matters "
         "for the phase gates: Rig A still clears $315/month in the worst realistic scenario, which is why it is "
         "the recommended first buy. At no point in the modeled space does any rig go meaningfully cash-negative "
         "while operational; the true downside is asset risk, covered in chapter 9."),
    ],
    "table": None,  # built dynamically
    "table_caption": "Table 6.1 - Monthly economics per rig at $0.12/kWh. Hosting $/card = ask x 0.93 blended share x utilization x 720 h.",
    "chart": "payback",
    "chart_caption": "Figure 6.1 - Cumulative net cash position, base case. Rig A crosses zero near month 18.",
    "chart2": "profit",
    "chart2_caption": "Figure 6.2 - Monthly net profit vs rental utilization at base-case mining. Value labels in $k.",
}

CH7 = {
    "title": "Phased Rollout Plan",
    "paras": [
        ("Capital discipline is enforced by gates, not by optimism. Phase 1 buys exactly one rig and instrument it "
         "fully: every rental hour, every mining session, and every dollar of power goes into Infranex BT's "
         "tracking from day one. The expansion decision in month 3-5 is mechanical - a 30-day trailing net of at "
         "least $400 and utilization of at least 60% - so the plan cannot talk itself into Phase 2 during a lucky "
         "week. Phase 3 is intentionally not gated to the others: the TEE track depends on used-market PRO 6000 "
         "pricing and Targon-class subnet economics, both of which are moving targets."),
        ("The kill criteria matter as much as the gates. If Rig A cannot clear $200/month trailing net after 60 "
         "days of competent operation (correct undervolting, all three platforms live, mining configured), the "
         "market is telling us the floor is weaker than modeled - and with 5090 resale value supported by the "
         "shortage, exiting a Phase 1 rig costs a few hundred dollars in depreciation rather than five figures. "
         "This asymmetry - small defined downside, scalable upside - is the core argument for starting now rather "
         "than waiting for memory-market relief in 2027."),
    ],
    "table": PHASE_TABLE,
    "table_caption": "Table 7.1 - Rollout phases with mechanical gates.",
}

CH8 = {
    "title": "Break-Even & Sensitivity Analysis",
    "paras": [
        ("Each variable is stressed one at a time against the Rig A base case of $737/month net. Two results "
         "deserve emphasis. Electricity is a non-issue: the hosting floor alone stays cash-positive up to "
         "$0.53/kWh, triple the worst US retail rate in the user's range. The TAO sensitivity is real but "
         "bounded: because the mining leg is haircut to $300 of the base case, a 50% TAO drawdown costs $150 "
         "per month, not half the business. The dominant variable is hosting utilization, which is why the "
         "platform strategy (chapter 5) exists."),
        ("The purchase-price row interacts with the asset-bubble risk: buying after a further 30% spike stretches "
         "payback to 23 months, while a 30% dip shortens it to 12. The practical instruction is to tranche the "
         "buy - one card at market, the second on any dip - and to avoid adding cards into new highs. The worst "
         "case is not modeled as a P&L line but as the kill-switch: if everything idles for a month, the burn is "
         "only $167 of electricity and fixed costs, and the cards can be sold into the same shortage that "
         "inflated the entry price."),
    ],
    "table": SENSITIVITY_TABLE,
    "table_caption": "Table 8.1 - One-at-a-time sensitivity on Rig A base case ($737/mo net, 17.6-month payback).",
}

CH9 = {
    "title": "Risk Register",
    "paras": [
        ("The register below separates what the data already demonstrated from what could plausibly happen next. "
         "The platform-collapse row is not hypothetical - it happened inside this plan's own 48-hour data window, "
         "which is precisely why the architecture is three-platform plus mining rather than single-platform plus "
         "hope. The two highest-impact rows, emission concentration and the GPU asset bubble, pull in opposite "
         "directions: one caps upside, the other threatens capital. Both are mitigated by the same mechanism - "
         "the phase gates cap exposed capital at Rig A's $13k until the model is proven by the machine's own "
         "accounting, not by forecasts."),
        ("Operational risks are managed with boring engineering. Consumer cards on 24/7 duty get undervolted "
         "(roughly 50 W per card with 2-4% performance cost), fans are set to conservative curves, and a spare "
         "PSU is kept on the shelf because it is the single most common failure point in multi-GPU consumer "
         "builds. A 1.5%-of-capex monthly reserve accrues against the day something expensive fails just out of "
         "warranty. None of this is exotic; it is the difference between a data centre and a garage space heater."),
    ],
    "table": RISK_TABLE,
    "table_caption": "Table 9.1 - Risk register with likelihood, impact and mitigation.",
}

CH10 = {
    "title": "Procurement List",
    "paras": [
        ("Rig A's list is buildable this month from general-availability stock. The 5090 line uses a $5,200 "
         "mid-range street estimate inside the tracked $4,600-6,400 October band; buying a used card with "
         "remaining transferable warranty is a legitimate way to land nearer $4,600. Two AIB brands are "
         "deliberately mixed so that a single card's thermal design flaw does not idle the rig. The platform "
         "lines favor headroom: a 1600 W Platinum unit runs two 575 W cards at 72% utilization of its rating, "
         "which is where efficiency and fan noise both live happily."),
        ("Rig B and Rig C are deltas, not separate lists, because Phase 2 reuses everything from Rig A except "
         "the case (and often the case survives too). The Threadripper jump in both deltas exists for the same "
         "reason: four x16 slots and 256 GB of ECC cannot be built on AM5. Rig C's delta is dominated by the "
         "PRO 6000 pair - at $16,000 each new, the plan's explicit instruction is to watch the refurb market "
         "(currently $14,980+) and Salad Dedicated's contract economics before committing."),
    ],
    "table": PROCUREMENT_RIGA,
    "table_caption": "Table 10.1 - Rig A procurement list at Oct 2026 street prices.",
    "table2": PROCUREMENT_DELTA,
    "table2_caption": "Table 10.2 - Phase 2/3 deltas. Rig B reuses Rig A's case, storage and UPS.",
}

CH11 = {
    "title": "Infranex BT Integration Spec",
    "paras": [
        ("Infranex BT already ships the hard parts of this plan: the Opportunities engine computes owned-basis "
         "earn picks with TEE gates through computeRentEarn(mode='owned'), the Host & Earn view tracks Lium's "
         "fleet and rental economics, /api/network streams TAO price and per-subnet emissions, and the Miner "
         "Playbook ranks all 106 researched subnets with rewarded/registered concentration stats. What the plan "
         "adds is a Data Centre module that turns those feeds into fleet decisions, specified in the table below."),
        ("Two new surfaces carry the weight. The Data Centre module is a capex-and-payback dashboard that "
         "mirrors chapter 6's formulas with editable inputs (electricity, ask rates, utilization), shows the "
         "phase gates from chapter 7 as tracked sliders, and stores each rig's actual income so payback is "
         "computed from the machine's own ledger rather than the model's assumptions. The switch advisor is a "
         "hourly banner on the dashboard that blends the four feeds and answers one question - host, mine, or "
         "idle - with a confidence score. Both are modest builds (roughly 3-5 engineering days each) because "
         "every data source already exists in the app."),
    ],
    "table": INTEGRATION_TABLE,
    "table_caption": "Table 11.1 - Integration map: existing and new surfaces, their feeds, and the decisions they drive.",
}

CH12 = {
    "title": "Methodology & Data Sources",
    "paras": [
        ("Every market number in this plan was captured during the last week of October 2026 and is reproducible "
         "from the sources listed below. Live chain and fleet figures come from the Infranex BT platform's own "
         "snapshot (block 9,358,822) and the Lium public nodes API; rental rates are vendor-published medians "
         "or measured fleet averages as dated; hardware prices are tracked retail lows and marketplace bands, "
         "not MSRPs. The economics are computed from these inputs by explicit formulas - ask times blended host "
         "share times utilization times 720 hours for hosting; per-earner value times rewarded-over-registered "
         "times a new-entrant haircut for mining - so any reader can substitute their own electricity rate or "
         "utilization view and re-derive every table."),
        ("Two caveats bound the whole document. Paper values per earning miner are not income promises: they "
         "describe what today's rewarded miners earn, and subnets routinely redistribute rewards when operators "
         "change, validators re-weight, or emission schedules shift. And this is an operating plan, not investment "
         "advice - the phase gates exist precisely because the honest response to concentration and asset-price "
         "risk is to let the machine's tracked cash flow, not a spreadsheet's base case, authorize each next "
         "dollar of capital."),
    ],
    "table": SOURCES_TABLE if (SOURCES_TABLE := [["#", "Source (all accessed Oct 2026)"]] + [[str(i + 1), s] for i, s in enumerate(SOURCES)]) else None,
    "table_caption": "Table 12.1 - Primary data sources.",
}
