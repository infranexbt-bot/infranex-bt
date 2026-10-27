# PDF-CONTENT-A — chapters 1-5 of the Infranex BT investor brief.
# Block kinds: lead/body/h2/h3/bullets/callout/stats/table/chart/quote.
# Table block: ("table", headers, rows, ratios, caption, [center_col_idx]).

CH1 = [
    ("lead",
     "Bittensor pays real money — roughly 3,600 TAO every day, about $915,000 at the "
     "current price — to the people who run the machines behind its AI services. This "
     "brief explains that market, the GPU business built on top of it, and Infranex BT: "
     "the decision engine that tells a hardware owner where that money can actually be "
     "won, and where it is mathematically out of reach."),
    ("body",
     "The opportunity is genuine but brutally selective. Bittensor runs 128 independent "
     "AI markets called subnets, each with its own token, its own competition and its own "
     "rules for splitting the daily emission. A miner who registers into the wrong subnet "
     "does not earn less — the registration fee is burned, the GPU hours are consumed, "
     "and the reward share is zero. Our live scan of all 128 subnets on 26 October 2026 "
     "graded 104 of them <b>Don't enter</b>: the top ten wallets take essentially the "
     "entire payout and a new seat earns approximately nothing. Only one subnet is "
     "genuinely open, eighteen are fightable, and three seats on the whole network earn "
     "a RUN verdict for our reference rig."),
    ("stats", [
        ("128", "subnets scanned live, every one graded"),
        ("3,600 TAO", "minted per day, post first halving"),
        ("$915k/day", "emission value at TAO $254.21"),
        ("81%", "of subnets graded Don't enter"),
    ]),
    ("h2", "What Infranex BT is"),
    ("body",
     "Infranex BT is a web application that turns Bittensor's raw chain data into a "
     "single honest answer per subnet: can a new seat on this market earn, and what "
     "would <b>your specific rig</b> make per month if it did. It merges live chain "
     "scans with a profitability model on an owned-hardware cost basis, scores every "
     "subnet through a conviction engine (55% earning reality, 25% diligence, 20% model "
     "confidence), and publishes the result as RUN / WATCH / AVOID verdicts plus a "
     "five-tier competition grading from Open field to Don't enter. Dollar projections, "
     "month-one win odds and tier-flip alerts are attached to every row."),
    ("body",
     "The product's largest financial line is not a winning pick — it is the avoided "
     "loss. A serious GPU entry into the wrong subnet costs roughly $38,000 in hardware "
     "plus a non-refundable registration burn plus months of power, against a reward "
     "stream that our measurements put at effectively zero for 104 of 128 subnets. The "
     "app exists to stop that purchase before it happens, and to route the same capital "
     "to the small set of seats where the odds are real. Today that short list pays the "
     "reference rig about $881 per month on CPU work (SN05 Numinous) and about $330 per "
     "month on each of two GPU seats (SN83 Cathedral, SN92 Beam), with the single best "
     "seat on the network — $13,557 per month at 96% month-one odds — reserved by its "
     "hardware gate for an H200-class rig."),
    ("h2", "What this brief covers"),
    ("bullets", [
        "Chapters 2-3: what Bittensor and subnets are, and exactly how TAO emission is minted, halved and distributed.",
        "Chapter 4: the GPU mining business model — costs, revenue mechanics and worked dollar examples on our rig.",
        "Chapter 5: the competition reality — why most GPU subnets are winner-take-all, with chain-measured evidence.",
        "Chapters 6-8: what the app does, its full feature set, and the decision workflow with today's live numbers.",
        "Chapter 9: how the business works end to end, its revenue logic, growth levers and an honest risk register.",
    ]),
    ("callout", "3 RUN · 125 AVOID",
     "today's verdicts for the reference rig across all 128 subnets — the app's value is the 125"),
]

CH2 = [
    ("lead",
     "Bittensor is a proof-of-stake layer-1 blockchain whose entire purpose is to host "
     "competitive markets for machine intelligence. It is not a cloud platform and not "
     "a token bolted onto a datacenter; the markets themselves are the product, and the "
     "chain exists to pay them."),
    ("h2", "The network in one paragraph"),
    ("body",
     "The chain produces one block every twelve seconds and mints TAO against a hard "
     "cap of 21 million tokens — a scarcity schedule deliberately modeled on Bitcoin. "
     "Every block's emission is distributed to <b>subnets</b>: independent, self-contained "
     "markets, each run by its own incentive mechanism and each with its own tradeable "
     "alpha token. Miners in a subnet produce a digital commodity — inference, model "
     "training, data pipelines, agents, storage — and validators score that work every "
     "tempo of 360 blocks (about 72 minutes). The scores, weighted by validator stake, "
     "decide how the subnet's emission is split among miners. Nothing is promised and "
     "nothing is owed: pay follows measured performance."),
    ("h2", "Subnets: 128 markets under one roof"),
    ("body",
     "A subnet is best understood as a company with one product, an automatic payroll, "
     "and no moat except performance. Slot 0 is the root network (TAO itself); slots 1 "
     "through 127 are live markets covering services from LLM inference (Chutes, SN64) "
     "to price prediction, tee-attested compute and agent infrastructure. Mainnet is "
     "capped at 128 active subnet slots today with expansion to 256 planned; the "
     "registration cost to claim a slot rose 6.5x by mid-2026, which makes every slot "
     "scarce and every incumbent defensive. For a miner, each subnet is a separate "
     "job: separate hardware requirements, separate registration burn, separate "
     "competition, and a separate answer to \"can I win here?\" — which is precisely "
     "the question the app automates."),
    ("table",
     ["Role", "What they do", "What they earn", "What they risk"],
     [
        ["Miner", "Runs hardware and code that performs the subnet's task; registered as a UID", "41% slot of the subnet emission, split by consensus score", "Registration burn, power, zero pay if scores stay low"],
        ["Validator", "Scores miners' work each tempo; stake-weighted", "41% slot, plus a baseline slice to root TAO stakers", "Stake slashing risk and the cost of running honest scoring"],
        ["Subnet owner", "Defines the incentive mechanism and rules", "Fixed 18% of the subnet's emission", "The market itself — a dead subnet earns nothing"],
        ["Staker / delegator", "Stakes TAO or alpha behind validators and subnets", "Share of validator emissions, pro-rata", "Token price and routing risk across 128 alpha tokens"],
     ],
     [0.14, 0.34, 0.26, 0.26],
     "Table 1 — the four roles of a Bittensor subnet. A GPU owner enters as a miner.",
     [0]),
    ("h2", "How money actually reaches a miner"),
    ("body",
     "Entry requires registering a key into the subnet, which costs a non-refundable "
     "recycle-recalibrated fee — demand-priced, and deliberately so: it burns the TAO "
     "rather than paying anyone, and it rises when a subnet is attractive. Once in, a "
     "miner's pay is decided by consensus: validators submit weight vectors, the Yuma "
     "consensus module clips outliers and computes a stake-weighted aggregate, and the "
     "miner's share of the 41% miner slot follows that aggregate. Validator trust "
     "(vtrust) is itself stake-weighted, which means large stakeholders' opinions "
     "dominate the scoreboard. The practical consequence defines this entire business: "
     "<b>you are not selling FLOPS, you are selling credibility to a small committee of "
     "staked judges</b> — and incumbents who have compounded trust for months are hard "
     "to displace on hardware alone."),
    ("body",
     "This is also why Bittensor mining is not Bitcoin mining. There is no hash puzzle "
     "a faster card wins by default; the work is useful AI labor, the scoreboard is "
     "engineered per subnet, and the durable advantage is a code team plus operations "
     "plus stake — not the GPU brand on the box. Chapter 5 quantifies exactly how far "
     "that advantage goes."),
]

CH3 = [
    ("lead",
     "Every twelve seconds the chain mints TAO and routes it through a two-level "
     "distribution system: first across 128 subnet markets by market demand, then "
     "inside each market by fixed role slots. Understanding both levels is "
     "understanding where the money sits."),
    ("h2", "The spigot: issuance and the halving clock"),
    ("body",
     "The block reward is 0.5 TAO — approximately 3,600 TAO per day, worth about "
     "$915,000 daily at the live price of $254.21. Bittensor's first halving fired on "
     "14-15 December 2025 when cumulative issuance crossed 10.5 million TAO, cutting "
     "the reward from 1 TAO to 0.5 TAO per block; issuance now stands near 11.2 million "
     "(53% of the cap) and the next halving triggers at 15.75 million, which at current "
     "rates is years away. Each halving also halves every subnet's alpha injection, so "
     "scarcity propagates through the whole economy simultaneously. For a miner this "
     "is a slowly deflating paycheck in TAO terms — the offset is that demand for "
     "subnet services, not the schedule, decides whether any individual seat gets rich."),
    ("table",
     ["Milestone", "Cumulative issuance", "Block reward", "Daily emission", "Status"],
     [
        ["Launch (2021)", "0", "1 TAO", "7,200 TAO", "done"],
        ["First halving", "10.5M TAO", "0.5 TAO", "3,600 TAO", "fired 14-15 Dec 2025"],
        ["Second halving", "15.75M TAO", "0.25 TAO", "1,800 TAO", "pending (issuance 11.2M)"],
        ["Third halving", "18.375M TAO", "0.125 TAO", "900 TAO", "pending"],
        ["Hard cap", "21M TAO", "-", "0", "asymptotic"],
     ],
     [0.20, 0.22, 0.16, 0.18, 0.24],
     "Table 2 — the halving schedule. Halvings key off issuance thresholds, not dates.",
     [1, 2, 3, 4]),
    ("h2", "Level one: routing emission across subnets (dTAO)"),
    ("body",
     "Since the Dynamic TAO upgrade of February 2025, the chain does not decide subnet "
     "budgets by committee — it runs a market. Every subnet has its own alpha token "
     "with a 21 million cap and a TAO/alpha liquidity pool; TAO holders move capital "
     "into the pools of the subnets they believe in, and each block's emission is split "
     "across subnets in proportion to demand — computed from each pool's EMA price, "
     "scaled by burn, and passed through an emission gate that suppresses weak or "
     "attacked shares. The root market (plain TAO staking) competes with every subnet "
     "for the same capital. The result is Darwinian: a subnet that loses market "
     "confidence bleeds emission within days, and a subnet that gains it compounds. "
     "Concentration is therefore not a bug of dTAO — it is the mechanism working, and "
     "it is why one subnet can legitimately absorb 13% of the entire network's emission "
     "while a hundred others share scraps."),
    ("h2", "Level two: the split inside a subnet"),
    ("chart", "/home/z/my-project/scripts/pdf-assets/ch-emission-split.png",
     "Figure 1 — how one subnet's block emission divides: 41% miners, 41% validators and stakers, 18% owner."),
    ("body",
     "Inside a subnet the split is fixed by hyperparameters: 41% to miners, 41% to "
     "validators and their stakers, 18% to the subnet owner. From the validator slot, "
     "a baseline slice is redirected to root TAO stakers through the dTAO coupling "
     "formula, so plain TAO stakers earn from every subnet proportionally to stake. "
     "The miner's 41% is the pot this business competes for. On SN64 — the largest "
     "subnet at roughly 13% of all network emission — the miner slot alone receives "
     "about 199 TAO per day, near $50,000 daily across the whole miner set; the "
     "entire question of GPU mining economics is how many UIDs actually touch that "
     "pot, and Chapter 5 answers it with chain data."),
    ("callout", "≈199 TAO/day",
     "the miner slot of SN64 alone — about $50k/day split across 256 seats, of which 7% earned last epoch"),
]

CH4 = [
    ("lead",
     "Strip the crypto vocabulary away and this is a hardware business: put capital "
     "into machines, sell their output into 128 automated markets, and keep the spread "
     "between revenue and power. The spread is decided by seat competition — which is "
     "why a decision engine, not a bigger power supply, is the scarce asset."),
    ("h2", "The cost side"),
    ("body",
     "The reference rig throughout this brief is an owned 96 GB VRAM workstation "
     "(RTX PRO 6000 Blackwell class, TEE-capable) at an owned electricity basis of "
     "$0.12/kWh. Three cost lines matter. Capex: a current-generation 96 GB card runs "
     "into five figures, and a single wrong-subnet entry effectively strands it — this "
     "is the $38,000-class mistake the app exists to prevent. Registration: entering a "
     "subnet burns a non-refundable, demand-priced fee, and full subnets recycle "
     "constantly so the burn repeats on every re-entry. Power and ops: a loaded GPU "
     "draws 400-600 W around the clock — $29-43 per month per card at our basis — plus "
     "real engineering time, which is the cost most newcomer models silently omit."),
    ("h2", "The revenue side"),
    ("body",
     "Revenue arrives in TAO and converts at a floating price ($254.21 on the scan "
     "date), so every projection carries token risk that no engine can remove. Within "
     "the token, two numbers decide the month: the <b>month-one odds</b> — our model's "
     "estimate that a brand-new seat earns anything at all in its first epoch period, "
     "discounted for whale dominance, full subnets and the weeks-long bond ramp — and "
     "the <b>net per month if you earn</b>, which is expected reward minus power on the "
     "active cost basis. A seat is only worth entering when both numbers clear the "
     "bar at the same time; the app displays them joined on every row and refuses to "
     "quote a payout without the odds that make it real."),
    ("chart", "/home/z/my-project/scripts/pdf-assets/ch-ev.png",
     "Figure 2 — today's real menu for the 96 GB rig: net $/month per seat with month-one odds. The two AVOID rows show payouts that exist on paper but not in practice."),
    ("h2", "Worked examples, live numbers"),
    ("body",
     "SN05 Numinous is the reference rig's best honest seat: CPU-only work, 66% "
     "month-one odds, roughly $881 net per month, conviction 81 — a RUN. SN83 Cathedral "
     "and SN92 Beam are the GPU path: about $334 and $329 net per month respectively at "
     "61-67% odds, both RUN, both realistic for a 96 GB card. Contrast SN64 (Chutes): "
     "the row still prints $330 per month <b>if you earn</b>, but the subnet is full at "
     "256/256 seats, only 7% of seats earned last epoch, and the top-10 wallets take "
     "100% of the pot — month-one odds 3%, verdict AVOID. SN30 (ItsAI) is the subtle "
     "trap: 84% of slots earn something, which looks open, but the top-10% take 99% of "
     "the incentive, leaving the median seat $3 per month underwater after power. "
     "Payout size without seat odds is marketing; this engine never shows one without "
     "the other."),
    ("h2", "The two-lens rule: seat quality and rig fit"),
    ("body",
     "Every opportunity passes two independent gates, and conflating them is the "
     "classic newcomer error. The seat lens asks whether a new UID can win at all "
     "(Chapter 5's tiers); the rig lens asks whether <b>this</b> machine can do the "
     "work at an acceptable cost. Today the best seat on the entire network — SN82 "
     "Bitcast, an Open field with 96% month-one odds and $13,557 per month net — fails "
     "the rig lens for us: it requires an H200-class 141 GB card, so for the reference "
     "rig its honest value is exactly zero and its verdict is AVOID. The app is "
     "deliberately rude about this. An open seat your rig cannot sit in is not an "
     "opportunity, and printing it as one would be selling hope."),
    ("callout", "$13,557/mo — for an H200 owner. For this rig: $0.",
     "SN82 Bitcast is the network's best seat; the rig gate is what makes the answer honest"),
]

CH5 = [
    ("lead",
     "This is the chapter the marketing pages of every mining guide omit. On most GPU "
     "subnets the reward distribution is not merely skewed — it is architecturally "
     "closed, and the chain data says so plainly."),
    ("h2", "The honest census"),
    ("body",
     "Applying one grading standard to all 128 live subnets — rewarded share of slots, "
     "top-10% incentive capture, month-one odds, displacement pressure — produces the "
     "census below. One subnet is an Open field where new seats genuinely earn. "
     "Eighteen are Fightable: real odds, real warnings. Five are Knife fights where "
     "professional farms take most of the pot. And 104 — 81% of the network — are "
     "graded Don't enter: a new seat earns approximately zero while still paying the "
     "registration burn and the power bill."),
    ("chart", "/home/z/my-project/scripts/pdf-assets/ch-census.png",
     "Figure 3 — the competition census across all 128 subnets, live scan of 26 October 2026."),
    ("h2", "Winner-take-all, measured"),
    ("body",
     "The single most predictive number is the share of a subnet's incentive captured "
     "by its ten best-paid UIDs. On the flagship GPU subnets that number is not 60 or "
     "70% — it is effectively 100%. Chutes (SN64), the network's largest market and "
     "about 13% of all TAO emission, paid 7% of its slots last epoch with its top ten "
     "taking the whole pot; its leading operators run Kubernetes farms with dedicated "
     "engineering teams and 850 GB to 5 TB of model cache per site. Pareton (SN9) "
     "rewarded 0.8% of seats, SayGM (SN27) 0.4%, Targon (SN3) 2.7% — and Targon's "
     "minimum hardware line is a rack of 8x H100s with TEE profiles. These are not "
     "failing subnets; they are functioning markets with a scale moat, which is "
     "exactly why a newcomer with a single GPU should not pay the burn to enter them."),
    ("chart", "/home/z/my-project/scripts/pdf-assets/ch-whale-share.png",
     "Figure 4 — top-10% incentive capture on case-study subnets. At or above the 85% line, a new seat is fighting the scoreboard itself."),
    ("table",
     ["Subnet", "Slots earning", "Top-10% capture", "Min hardware", "Verdict"],
     [
        ["Bitcast SN82", "95.5%", "12%", "H200 141 GB", "Open field — rig-gated"],
        ["Numinous SN05", "93.8%", "12%", "CPU only", "RUN"],
        ["Cathedral SN83", "95.7%", "26%", "GPU 24 GB", "RUN"],
        ["Beam SN92", "93.0%", "60%", "H100 80 GB", "RUN"],
        ["ItsAI SN30", "84.4%", "99%", "GPU 24 GB", "AVOID — whale cover"],
        ["Chutes SN64", "7.0%", "100%", "GPU 24 GB (farms: K8s)", "AVOID — knife fight"],
        ["Pareton SN9", "0.8%", "100%", "GPU 24 GB", "AVOID"],
        ["Targon SN3", "2.7%", "100%", "8x H100, TEE", "AVOID"],
     ],
     [0.22, 0.16, 0.18, 0.24, 0.20],
     "Table 3 — case-study rows from the live scan: earning breadth vs capture concentration.",
     [1, 2]),
    ("h2", "Why more VRAM does not break the moat"),
    ("body",
     "The instinctive response — buy a bigger card — is the most expensive way to be "
     "wrong. The moat on the big subnets is three-layered: scale (farms that out-buy "
     "any single card), code (teams that optimize against the validator's scoring "
     "function weekly), and stake (validators with large delegations whose trust, once "
     "earned, is self-reinforcing through the bond ramp). A $38,000 GPU without the "
     "engineering stack is a donation to whoever has it. This is why the app's grading "
     "keys on distribution spread rather than on hardware class: hardware is table "
     "stakes, while the spread tells you whether the table pays anyone but the house."),
    ("h2", "The SN30 lesson: surface metrics lie, spreads do not"),
    ("body",
     "ItsAI (SN30) deserves its own paragraph because it is the trap that catches "
     "every newcomer's dashboard. Its 84% slot-earning rate looks like an open field — "
     "most seats get something. But the top-10% of UIDs capture 99% of the incentive, "
     "so \"something\" for the median seat rounds to dust: our model puts the median "
     "new seat $3 per month underwater after power. Any ranking built on headline "
     "numbers — APY, pool size, emission rank — would flag SN30 as attractive. Only a "
     "distribution read catches it, and only a distribution read prices it honestly. "
     "That is the analytical core Infranex BT sells: not more data, but the two or "
     "three numbers that actually decide the outcome."),
    ("quote",
     "In Bittensor mining, the average is a lie told by the top ten wallets. "
     "Read the spread before you pay the burn."),
]

CHAPTERS_A = [
    (1, "Executive Summary", CH1),
    (2, "Bittensor Fundamentals", CH2),
    (3, "TAO Emissions and Distribution", CH3),
    (4, "The GPU Mining Business Model", CH4),
    (5, "Competition Reality: Winner-Take-All", CH5),
]
