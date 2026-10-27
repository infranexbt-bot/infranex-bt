# PDF-CONTENT-B — chapters 6-9 of the Infranex BT investor brief.

CH6 = [
    ("lead",
     "Everything in chapters 2-5 describes a market that already works. This chapter "
     "describes the gap in it: the chain publishes every number a miner needs, and "
     "almost nobody can assemble those numbers into an honest answer before their "
     "money is already burned."),
    ("h2", "The problem: information asymmetry with a non-refundable entry fee"),
    ("body",
     "Bittensor's data is public — metagraphs, reward spreads, slot occupancy, "
     "emission flows — but it is scattered across explorers and APIs, expressed in "
     "unfamiliar units, and wrapped in promotional noise from subnet owners whose "
     "business model is recruiting miners. The entry fee is a burn: demand-priced, "
     "non-refundable, and repeating on every re-entry into a full subnet. Put those "
     "together and the newcomer's decision is framed perversely — the moment of "
     "maximum enthusiasm is the moment of least information, and the market charges "
     "for the experiment. The measurable result is the census in chapter 5: 104 of "
     "128 subnets pay a new seat approximately nothing, yet every one of them "
     "collects registrations."),
    ("body",
     "The asymmetry is not symmetrical ignorance, either. The top operators read the "
     "spread data daily and position accordingly; validators know their own scoring "
     "dynamics; subnet owners know their emission trends. The only participant "
     "flying blind is the one writing the largest check for the least information — "
     "the hardware owner deciding where to point $38,000. That is the specific "
     "asymmetry the app closes, and closing it is the product."),
    ("h2", "What Infranex BT is"),
    ("body",
     "Infranex BT is a web decision engine for Bittensor mining on an owned-hardware "
     "basis. It scans all 128 subnets live, merges chain data with a profitability "
     "configuration and operator overrides, and produces one graded answer per subnet: "
     "a competition tier (Open field, Fightable, Knife fight, Don't enter, No data), "
     "a conviction score from 0 to 100, a RUN / WATCH / AVOID verdict, month-one win "
     "odds, and a dollar projection specific to the configured rig. Nothing is "
     "hand-entered and nothing is cached indefinitely — every verdict traces to a "
     "chain read, and when data is stale the app says so on the page instead of "
     "pretending otherwise."),
    ("h2", "The conviction engine: 55 / 25 / 20"),
    ("chart", "/home/z/my-project/scripts/pdf-assets/ch-conviction.png",
     "Figure 5 — the conviction engine weights on the owned-rig basis. Earning reality dominates because a seat that never pays invalidates every other signal."),
    ("body",
     "Every subnet is scored by three components. <b>Earning reality (55%)</b> is the "
     "rent-earn gate: does the rig meet the hardware profile, is a seat even "
     "obtainable, what are the odds and the net dollars. <b>Diligence (25%)</b> runs "
     "a fourteen-stage pipeline over the subnet's operational signals — registration "
     "economics, reward history, displacement pressure — and can hard-fail the row "
     "outright with a DO-NOT-PROVISION verdict. <b>Model confidence (20%)</b> scales "
     "the whole score by how much verified chain data backs it, so thin-data subnets "
     "cannot ride a lucky average into a RUN. Three hard gates sit above the blend: "
     "a failed rig gate, a failed diligence stage, or a below-minimum profit "
     "projection each cap the verdict at AVOID regardless of how bright the other "
     "numbers look. On today's scan the engine returns 3 RUN, 0 WATCH and 125 AVOID "
     "— a distribution that looks harsh precisely because the network is harsh."),
    ("h2", "The AVOID list is the product"),
    ("body",
     "Investors are used to products that sell winners; this one's first deliverable "
     "is the 125 rows it refuses to bless. Each AVOID is a prevented experiment: a "
     "registration burn not paid, a GPU month not stranded, an engineering weekend "
     "not spent porting code into a market whose scoreboard was never going to pay. "
     "Priced conservatively at $38,000 of stranded capex plus burn and power per "
     "wrong entry, the 104 Don't-enter grades alone represent the difference between "
     "a beginner losing their stake and a beginner still holding their capital. The "
     "RUN list is small — that is honest — but it is real: today it routes one CPU "
     "seat and two GPU seats that together clear roughly $1,540 per month for the "
     "reference rig at 61-67% month-one odds each."),
    ("callout", "125 AVOIDs = 125 prevented $38k mistakes",
     "the app's largest line item is the loss that never happens"),
]

CH7 = [
    ("lead",
     "Seven features, one decision. Each exists because a specific question — asked "
     "at a specific moment in the miner's workflow — had no honest answer before."),
    ("table",
     ["Feature", "What it does", "The question it answers"],
     [
        ["Conviction ranking", "Scores all 128 subnets 0-100 with hard gates; publishes RUN / WATCH / AVOID", "Where do I point capital?"],
        ["Win-odds panel", "Grades every subnet into five competition tiers with month-1 odds, rewarded share and top-10% capture bars", "Can I win here at all?"],
        ["$ projections", "Net $/month per subnet on the active rig and power basis, shown only alongside the odds that qualify them", "What does MY rig make?"],
        ["Best-seat banner", "Picks the single highest-value enterable seat (Open field + Fightable) for the rig, live", "If I enter today, what do I make?"],
        ["Flip alerts", "Diffs every scan against the persisted tier snapshot; surfaces 7-day tier flips as alert chips", "When does an impossible seat become possible?"],
        ["Data honesty notices", "Staleness and empty-data states render on-page; UNKNOWN tier never fabricates an answer", "Can I trust this row?"],
        ["Overrides and notes", "Operator diligence notes and per-subnet overrides merge into the scoring pipeline", "Where do I store my own research?"],
     ],
     [0.20, 0.50, 0.30],
     "Table 4 — the feature suite mapped to the decisions it serves.", []),
    ("h2", "The win-odds panel and its blunt vocabulary"),
    ("body",
     "The panel's five tiers use deliberately unglamorous words. <b>Open field</b> "
     "means rewarded share is high, whales hold under half the pot, and month-one "
     "odds are 50% or better — enter without fear. <b>Fightable</b> means real odds "
     "but real warnings: displacement required, or a long bond ramp, or whales at "
     "half the table. <b>Knife fight</b> means professional farms take most of the "
     "pot and expect scraps. <b>Don't "
     "enter</b> means winner-take-all: under 5% of slots earned, or the top-10% "
     "capturing 95% or more, or a zero month-one projection — a seat that pays the "
     "burn for the privilege of earning nothing. <b>No data</b> is the honest "
     "shrubbery: where the chain read is incomplete the tier says so instead of "
     "guessing. Every row carries its reason line — the actual numbers that produced "
     "the grade — so the verdict is auditable at a glance."),
    ("h2", "Flip alerts: the cheapest signal in the network"),
    ("body",
     "Subnet quality is not static. Emission demand moves under dTAO, whale "
     "operators migrate, code teams ship, and a subnet graded Don't enter in March "
     "can be Fightable by June — that transition is precisely when a new seat is "
     "cheapest, before the crowd notices. The flip watcher persists the raw "
     "reward-spread tier per subnet on every scan and diffs it against the previous "
     "snapshot; qualifying flips surface as a seven-day alert strip in the panel. "
     "The same signal in reverse is an exit bell: when a seat's tier degrades from "
     "Fightable toward Knife fight, the miner already sitting in it wants to know "
     "before the next epoch, not after. One number pair — the tier, and the moment "
     "it changes — is the closest thing Bittensor has to a free option."),
    ("h2", "Dollar projections, honestly scoped"),
    ("body",
     "The projection line on each row quotes what the seat pays <b>if you earn</b> — "
     "expected reward on the active cost basis minus power — and it is always "
     "displayed next to the month-one odds that say how likely \"if you earn\" is. "
     "The pair is inseparable by design; a payout without odds is marketing. The "
     "best-seat banner collapses the whole panel to the one seat that maximizes "
     "rig-fit value among enterable tiers, and the projection math is identical "
     "across the app — dashboard, opportunities table and panel share one engine — "
     "so the number never disagrees with itself between screens."),
]

CH8 = [
    ("lead",
     "Features mean nothing until they change a decision. This chapter walks the "
     "workflow end to end with today's live scan as the worked example."),
    ("h2", "The decision workflow"),
    ("body",
     "Every cycle the app runs the same pipeline: a chain scan pulls metagraph state "
     "for all 128 subnets; the merger joins it with the profitability configuration "
     "and any operator overrides; the conviction engine scores and gates each row; "
     "the win-odds module grades competition tiers and computes month-one odds; the "
     "projection module attaches rig-specific net dollars; and the flip watcher "
     "diffs tiers against the persisted snapshot to raise alerts. The miner reads "
     "one screen: skip the 104, watch the 18, and choose among the seats that "
     "cleared both the seat lens and the rig lens."),
    ("table",
     ["Seat (live scan)", "Hardware", "Conviction", "Net $/mo", "Mo-1 odds", "Verdict"],
     [
        ["Numinous SN05", "CPU only", "81", "$881", "66%", "RUN"],
        ["Cathedral SN83", "GPU 24 GB+", "75", "$334", "67%", "RUN"],
        ["Beam SN92", "H100 80 GB", "71", "$329", "61%", "RUN"],
        ["Bitcast SN82", "H200 141 GB", "24", "$13,557", "96%", "AVOID — rig gate"],
        ["Chutes SN64", "GPU 24 GB+", "30", "$330 at 3% odds", "3%", "AVOID"],
        ["ItsAI SN30", "GPU 24 GB+", "20", "-$3", "60%", "AVOID — whale cover"],
     ],
     [0.24, 0.17, 0.13, 0.19, 0.12, 0.15],
     "Table 5 — the short list and the instructive rejects, from the 26 October 2026 scan.",
     [2, 3, 4]),
    ("h2", "Reading the short list the way an operator would"),
    ("body",
     "The CPU-first finding is the headline: the largest honest expected value for "
     "this rig is not GPU work at all — Numinous pays $881 per month for CPU-only "
     "labor at 66% odds, roughly 2.7x either GPU seat, because CPU markets are less "
     "farm-dominated. The GPU path is real but modest: Cathedral and Beam each clear "
     "about $330 per month, and a rig with the VRAM headroom can hold both theses in "
     "parallel — combined with the CPU seat, the three-RUN portfolio projects about "
     "$1,540 per month. Bitcast demonstrates the rig gate doing its job: the best "
     "seat on the network is worthless to a 96 GB card, and the engine says so "
     "instead of flattering the user. Chutes and ItsAI demonstrate the seat lens: "
     "one full, whale-closed market and one whale-covered trap, both priced "
     "correctly at approximately zero."),
    ("body",
     "The workflow then becomes maintenance instead of research. The miner holds the "
     "RUN seats, checks the flip strip for tier changes, and re-reads the panel when "
     "an alert fires — a subnet improving is a candidate entry, a held seat "
     "degrading is an exit. Total decision time per week drops from hours of "
     "explorer-diving to minutes of reading a screen that has already refused to "
     "lie about the other 124 rows."),
    ("callout", "≈$1,540 / month",
     "combined projection of the three RUN seats for the reference rig, at 61-67% month-one odds each"),
    ("h2", "What the miner actually does, step by step"),
    ("bullets", [
        "Open the panel; read the census and the best-seat banner — thirty seconds for the state of the whole network.",
        "Filter to Fightable + Open field; for each row read the reason line, the odds and the net dollars together.",
        "Cross-check the verdict chip: anything AVOID is closed for this rig today, whatever the payout line says.",
        "Before registering, check the flip strip — a fresh upgrade flip is the cheapest entry; a downgrade on a held seat is the exit bell.",
        "After entry, track the row weekly: bond ramp progress, rewarded share drift, and the epoch-level odds the model republishes each scan.",
    ]),
]

CH9 = [
    ("lead",
     "The business works because every layer of Bittensor's design routes money "
     "through a competition, and every competition creates an information premium "
     "for whoever reads it correctly. Infranex BT is that reader, productized."),
    ("h2", "The complete loop"),
    ("body",
     "Follow the dollar once around the system. The chain mints 3,600 TAO a day and "
     "routes it by market demand into 128 subnet pools — concentration by design. "
     "Inside each pool the emission splits into fixed role slots, and the miner slot "
     "is contested by UIDs whose pay follows stake-weighted validator scores — "
     "concentration by consensus. The winner-take-all shape that results (chapter 5) "
     "makes seat selection, not hardware, the binding constraint on returns — and "
     "seat selection is an information problem. Infranex BT sells the missing "
     "information layer: live spread analytics, rig-fit gating, dollar projections "
     "and flip alerts. Capital that would have burned in 104 closed markets routes "
     "instead to the few winnable seats; earnings improve; the operator's data "
     "advantage compounds with every scan. The loop closes: better decisions fund "
     "better data, which funds better decisions."),
    ("h2", "Revenue mechanics"),
    ("body",
     "The platform's value equation has three lines. First, <b>avoided loss</b>: at "
     "roughly $38,000 of stranded capex and burn per wrong entry, a single prevented "
     "Chutes-class registration repays a subscription many times over — and the app "
     "prevents them at a rate of 125 AVOIDs per scan. Second, <b>earnings uplift</b>: "
     "routing the same rig from a median seat to a RUN seat is the difference "
     "between -$3 and $881 per month in today's numbers, a spread the engine "
     "quantifies rather than promises. Third, <b>time</b>: the weekly decision cycle "
     "compresses from hours of manual explorer work to minutes, which is what makes "
     "multi-rig and multi-subnet portfolios manageable at all. Monetization follows "
     "those lines naturally — a monitoring subscription for the live panel and flip "
     "alerts, portfolio tiers for multi-rig operators, and the alert feed as the "
     "premium signal for funds that want the earliest read on subnet regime changes."),
    ("h2", "Growth levers"),
    ("bullets", [
        "Slot expansion 128 to 256: every new subnet re-runs the newcomer's dilemma — and needs the grader.",
        "dTAO churn: emission re-routing keeps flipping tiers; each flip is a fresh alert event.",
        "Multi-rig portfolio view: the engine already gates per rig profile; a fleet is the same math times N.",
        "Staking adjacency: the same spread analytics price alpha-pool risk for pure TAO holders.",
    ]),
    ("h2", "The honest risk register"),
    ("table",
     ["Risk", "What it is", "How the business absorbs it"],
     [
        ["TAO price", "Revenue is TAO-denominated; $254 today is not a contract", "Projections reprice every scan; the decision layer is price-agnostic"],
        ["dTAO drift", "Emission shares move; today's open field can close in weeks", "Flip alerts are the productized answer to exactly this risk"],
        ["Data latency", "Scans lag the chain by minutes-to-hours", "On-page staleness notices; verdicts cite their scan, never pretend live"],
        ["Model risk", "Odds are estimates from spreads, not guarantees", "Odds always shown beside payouts; confidence weighting discounts thin data"],
        ["Competition", "Explorers and subnet marketing pages approximate parts of this", "None join spread analytics to rig-fit gating with dollar outputs"],
        ["Regulatory", "Mining-adjacent crypto exposure varies by jurisdiction", "The product is information software; custody and token handling stay with the user"],
     ],
     [0.16, 0.42, 0.42],
     "Table 6 — what can hurt, and what already handles it.", [0]),
    ("h2", "The one-sentence thesis"),
    ("quote",
     "Bittensor pays $915,000 a day to win competitions whose rules are public but "
     "unreadable — Infranex BT is the app that reads them, grades all 128 seats, "
     "and alarms when the map changes."),
    ("body",
     "For the hardware owner, the brief reduces to this: the emission is real, the "
     "competition is measured, and the difference between the two is information. "
     "The app does not promise that Bittensor mining is easy — today's scan says "
     "the opposite, 125 times out of 128. It promises that every seat you consider "
     "is one the data can defend, with an alarm attached for the day the answer "
     "changes. In a market that charges a burn for every experiment, that is the "
     "edge."),
]

CHAPTERS_B = [
    (6, "Infranex BT and the Problem It Solves", CH6),
    (7, "The Feature Suite", CH7),
    (8, "How It Helps Miners Mine", CH8),
    (9, "How the Business Works: Conclusion", CH9),
]
