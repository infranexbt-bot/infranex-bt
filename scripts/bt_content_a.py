# -*- coding: utf-8 -*-
"""Bittensor Complete Guide — content part A (chapters 1-5).

Block kinds:
  h1 (title)            -> chapter heading + TOC level 0
  h2 (title)            -> section heading + TOC level 1
  h3 (title)            -> minor heading, not in TOC
  body (text)           -> justified body paragraph (rich text tags allowed)
  bullets ([items])     -> bulleted list, left aligned
  numbered ([items])    -> numbered list, left aligned
  quote (text)          -> pull quote with accent left border
  stats ([(big, label), ...])  -> callout stat row (max 3)
  table ({ratios, header, rows, caption}) -> palette table, all cells Paragraph
  chart ({path, caption, max_h}) -> block-level image + caption
"""

SECTIONS_A = [

# =================================================================
("h1", "What Exactly Is Bittensor?"),

("body", "Bittensor is a decentralized, open-source network whose purpose is to produce, "
 "rank, and price machine intelligence. It runs on its own blockchain (called Subtensor, "
 "built on the Polkadot SDK) and coordinates thousands of independent machines that perform "
 "artificial-intelligence work for the network. Unlike a normal AI company, Bittensor does not "
 "employ engineers, own data centers, or sell a product. Instead, it maintains a market: anyone "
 "who produces useful intelligence gets paid in the network's native token, TAO, in proportion "
 "to how valuable that work is judged to be. In the same way that Bitcoin converts electricity "
 "into scarce digital money, Bittensor converts compute, models, and machine-learning skill into "
 "a tradable digital commodity: intelligence itself."),

("body", "The project was created by the OpenTensor Foundation, founded by Jacob Steeves and "
 "Ala Shaabana, and the network began issuing blocks in early 2021. What started as a single "
 "machine-learning market was redesigned in April 2023 with the Finney upgrade, which introduced "
 "subnets — independent, self-contained markets that each define their own task and reward "
 "system. This turned Bittensor from one application into a whole economy of specialized AI "
 "markets sharing one settlement layer. The network's consensus mechanism, Yuma Consensus, is "
 "named after the pseudonymous identity used by its founders in early writings, echoing the "
 "tradition of Satoshi Nakamoto: the chain itself, not any company, decides who gets paid and "
 "how much."),

("stats", [
    ("21,000,000", "Hard cap of TAO, mirroring Bitcoin"),
    ("Early 2021", "Network genesis — first TAO issued"),
    ("41 / 41 / 18", "Miners / validators / owners: emission split"),
]),

("body", "The mental model matters more than the terminology. Bitcoin takes a physical input "
 "(electricity), burns it on an objective competition (hashing), and converts the winner's effort "
 "into a scarce digital asset. Bittensor takes the inputs of the AI economy — GPUs, models, data "
 "pipelines, and engineering skill — runs them through an objective competition judged by "
 "validators, and converts the winners' output into TAO. There is no CEO, no roadmap committee, "
 "and no API key to apply for. The network's 'product' is whatever hundreds of competing subnet "
 "teams can prove, block after block, to be the most useful intelligence available. That is why "
 "supporters describe Bittensor as the first open market for digital intelligence rather than "
 "another blockchain project."),

("quote", "Bittensor treats intelligence the way Bitcoin treated energy: a raw input that a free "
 "market continuously converts into a scarce, tradable asset."),

# =================================================================
("h1", "What Does Bittensor Actually Do?"),

("body", "Strip away the branding and Bittensor does three things continuously, every few "
 "minutes, forever. First, it lets anyone plug AI workloads into a global market: a miner "
 "registers a machine, points it at a subnet, and starts serving whatever that subnet demands — "
 "answers, forecasts, embeddings, storage, or raw GPU compute. Second, it automatically scores "
 "that work: validators query every miner, compare outputs against the subnet's reward model, "
 "and write their judgments to the blockchain as weight vectors. Third, it pays: Yuma Consensus "
 "aggregates those judgments into a tamper-resistant ranking, and the chain releases tokens to "
 "the ranked participants at every epoch. Produce, rank, pay — that loop is the entire engine."),

("body", "What does the network literally produce? Today the answer is a long list that grows "
 "with every new subnet: large-language-model inference served from decentralized GPU fleets, "
 "fine-tuned and pre-trained models, text-prompting services, AI assistants, financial forecasts "
 "and trading signals, scraped and structured datasets, vector embeddings, content generation "
 "including video, peer-to-peer storage, and general-purpose compute marketplaces. Each subnet "
 "is effectively a vertical SaaS product whose suppliers are paid in tokens instead of invoices, "
 "and whose customers are the stakers who back the subnet's economy. The practical consequence "
 "is that a single network now supplies services that would otherwise require a dozen separate "
 "vendor relationships."),

("body", "Why is that valuable? A centralized AI provider decides internally whether its model "
 "is good, prices it however the market tolerates, and can throttle or censor access at will. "
 "Bittensor inverts every one of those properties: quality is decided by many independent "
 "validators reaching consensus, pricing emerges from open competition for emission, and access "
 "is permissionless by construction. Consumers get redundant, commodity-priced intelligence; "
 "producers get global demand without sales contracts; and neither side needs anyone's "
 "permission. The table below summarizes the contrast."),

("table", {
    "ratios": [0.22, 0.39, 0.39],
    "header": ["Dimension", "Centralized AI (closed vendor)", "Bittensor (open market)"],
    "rows": [
        ["Who decides quality",
         "The vendor's internal evaluation teams",
         "Independent validators reach on-chain consensus"],
        ["Access",
         "Contracts, sales calls, API keys, possible throttling",
         "Permissionless — register a key and participate"],
        ["Pricing",
         "Fixed list prices set by the vendor",
         "Market-set emission; capital flows to the best subnets"],
        ["Source of innovation",
         "Internal R&D roadmaps",
         "Global open competition across 128+ subnet teams"],
        ["Payment rail",
         "Fiat invoices and billing cycles",
         "TAO paid per block, within minutes"],
        ["Failure mode",
         "Outages, censorship, vendor lock-in",
         "Underperformers lose emission or deregister"],
    ],
    "caption": "Table 1 — Structural comparison: closed AI vendors versus the Bittensor market.",
}),

# =================================================================
("h1", "TAO: The Token That Powers the Network"),

("body", "TAO is the native unit of the Bittensor network, and its name comes from the Tao — "
 "the ineffable principle of the I Ching that the founders cite as inspiration for a system "
 "that orders itself without a ruler. TAO serves three roles at once: it is the reward miners "
 "and validators earn, the stake that validators and delegators lock to secure honest "
 "evaluation, and the settlement asset in which every subnet's economy is ultimately denominated. "
 "Crucially, the supply was not pre-mined: TAO enters circulation exclusively as emission to "
 "network participants who are actively producing or securing intelligence."),

("body", "The supply design mirrors Bitcoin deliberately. Total supply is hard-capped at exactly "
 "21,000,000 TAO, and issuance follows a decreasing schedule governed by halvings. Unlike "
 "Bitcoin, Bittensor's halvings trigger on supply milestones rather than fixed block heights: "
 "when the network had issued 10.5 million TAO — half the cap — in December 2025, the block "
 "reward was cut in half from 1 TAO to 0.5 TAO, dropping daily issuance from 7,200 TAO to "
 "3,600 TAO. The next milestone is 15.75 million TAO (three quarters of the cap), which at the "
 "post-halving rate arrives around 2030, and each subsequent halving slows the faucet further. "
 "The final fractions of the 21 million are issued on an asymptotic curve stretching decades "
 "into the future — engineered scarcity, exactly as Bitcoin's architects designed it."),

("stats", [
    ("21M / \u224811.3M", "Hard cap versus circulating supply"),
    ("3,600 TAO", "Daily issuance after the Dec 2025 halving"),
    ("\u224870%", "Share of liquid TAO currently staked"),
]),

("body", "So how many TAO are available right now? As of late October 2026, roughly 11.3 to "
 "11.4 million TAO are in circulation — a little over half of the 21 million cap, with the "
 "remaining 46 percent scheduled to be emitted over the coming decades. The market values that "
 "float at around 2.9 billion US dollars, with TAO trading near 255 dollars per token on the "
 "official network interface. Importantly for miners and investors, roughly 70 percent of "
 "circulating TAO is staked to validators and subnets, which means the genuinely liquid float "
 "is only a few million tokens. Scarcity is therefore double-layered: the issuance schedule "
 "caps future supply, and staking removes most of the existing supply from daily trading."),

("chart", {"path": "assets/bt_supply.png",
           "caption": "Figure 1 — Cumulative TAO issuance: historical supply to October 2026 "
                      "and projected path to the second halving at 15.75M (\u22482030).",
           "max_h": 250}),

("table", {
    "ratios": [0.22, 0.24, 0.24, 0.30],
    "header": ["Milestone", "Supply trigger", "When", "Daily issuance after"],
    "rows": [
        ["Genesis", "0 TAO issued", "January 2021", "7,200 TAO per day"],
        ["First halving", "10.5M TAO issued", "December 2025", "3,600 TAO per day"],
        ["Second halving", "15.75M TAO issued", "\u2248 2030 (projected)", "1,800 TAO per day"],
        ["Terminal", "21M asymptotic limit", "Decades away", "Approaches zero"],
    ],
    "caption": "Table 2 — TAO supply schedule: halvings trigger on supply milestones, not dates.",
}),

# =================================================================
("h1", "Subnets: The Markets of Bittensor"),

("body", "A subnet is a self-contained digital market living inside Bittensor, identified by a "
 "number called its netuid. Each subnet defines three things: a task (what miners must deliver), "
 "a reward model (how quality is measured), and an economy (how emission and stake flow around "
 "it). The mainnet is currently capped at 128 active subnet slots, with an expansion to 256 "
 "planned — which means a subnet slot is a scarce, contested asset, and the weakest subnets "
 "risk being deregistered and recycled when the chain is full. Subnets were introduced by the "
 "Finney upgrade in April 2023 and are the reason Bittensor behaves like an economy rather than "
 "a single application."),

("body", "In February 2025 the network activated dynamic TAO (dTAO), the upgrade that gave each "
 "subnet its own token economy. Every subnet now issues an alpha token with its own 21 million "
 "cap and its own halving curve starting from launch. TAO holders stake into the subnets they "
 "believe in; the more capital is staked on a subnet, the larger the share of network emission "
 "it captures; and each subnet runs an alpha/TAO liquidity pool that gives its alpha a live "
 "market price. The result is a Darwinian capital market layered on top of the technical "
 "market: subnets that attract stakers grow, and subnets that cannot convince capital decay. "
 "By March 2026 the combined market capitalization of all subnet alpha tokens had reached "
 "roughly 1.12 billion dollars — about 27 percent of TAO's own market cap — and subnets "
 "generated an estimated 43 million dollars of economic activity in the first quarter of 2026 "
 "alone."),

("body", "What do these markets actually sell? The variety is the point: the network has become "
 "a portfolio of specialized AI businesses. Some subnets serve model inference from distributed "
 "GPU fleets; others pre-train or fine-tune models; others run prompting services, AI "
 "assistants, trading and forecasting systems, video generation, data pipelines, or storage "
 "networks. Measured live inside the Infranex BT platform in October 2026, some of the "
 "strongest evidence-backed opportunities included SN82 Noah (video generation), SN5 Hone "
 "(assistant services), SN83 CliqueAI, and SN9's pre-training market — each with different "
 "hardware requirements, reward mechanics, and competitive dynamics."),

("table", {
    "ratios": [0.24, 0.42, 0.34],
    "header": ["Category", "What miners deliver", "Live examples (Oct 2026)"],
    "rows": [
        ["Inference and serving", "LLM completions and API responses from GPU fleets",
         "Compute marketplaces; assistant subnets"],
        ["Training and pre-training", "Model checkpoints, fine-tunes, gradients",
         "SN9 pre-training market"],
        ["Prompting and assistants", "Prompt completions, agent behavior, chat services",
         "SN5 Hone; SN83 CliqueAI"],
        ["Finance and forecasting", "Price predictions, trading signals, risk models",
         "SN68 NOVA; SN107 Minos"],
        ["Video and media", "Generated and processed video content",
         "SN82 Noah"],
        ["Data, storage and infra", "Scraped data, embeddings, storage, raw compute",
         "Data-scraping and storage subnets"],
    ],
    "caption": "Table 3 — Subnet categories and examples of what each market pays miners to produce.",
}),

("body", "For a miner or investor, two properties of subnets matter most. First, independence: "
 "each subnet is a separate labor market with its own demand curve, so a GPU that is mediocre "
 "in one market can be elite in another. Second, mortality: because slots are capped, a subnet "
 "that loses its stakers and its emission can be removed — the network recycles its weakest "
 "markets the way an exchange delists dead stocks. Both properties make subnet selection the "
 "single most consequential decision a participant makes, which is precisely the problem "
 "Infranex BT's intelligence tooling is built to solve."),

# =================================================================
("h1", "How a Subnet Works: The Incentive Loop"),

("body", "Every subnet is built from a small set of on-chain primitives. The subnet owner "
 "publishes a specification and chain code that define the task and the reward function. "
 "Participants run neurons: miners run the worker side, exposing their service through an Axon "
 "— a public API endpoint on their machine — while validators run the evaluation side, querying "
 "miners with a client called a Dendrite. The entire state of who is participating and how they "
 "are scored is visible in the metagraph, the subnet's on-chain directory of neurons, stakes, "
 "and weights. Nothing is hidden: a miner can see its rank, its scores, and exactly which "
 "validators are rewarding it."),

("body", "The loop runs on a fixed heartbeat called the tempo — roughly 360 blocks, or about "
 "twelve minutes. During each tempo, validators continuously probe miners, score their outputs "
 "against the subnet's reward model, and submit weight vectors to the chain. Yuma Consensus "
 "then aggregates those vectors into a single authoritative ranking, designed to resist "
 "collusion: validators who set weights far from the consensus are penalized, while honest "
 "agreement is reinforced through a bond mechanism. Once consensus is reached, the subnet's "
 "alpha emission is distributed — by design roughly 41 percent to miners, 41 percent to "
 "validators, and 18 percent to the subnet owner. Layered on top, dTAO directs the network's "
 "TAO emission into the liquidity pools of the subnets that stakers back, and the chain "
 "recycles excess TAO by buying alpha from those pools, supporting each subnet's price floor."),

("chart", {"path": "assets/bt_loop.png",
           "caption": "Figure 2 — The subnet incentive loop: owners define, miners serve, "
                      "validators grade, consensus settles, and dTAO routes capital.",
           "max_h": 200}),

("body", "The economic consequences are immediate and unforgiving. Performance is income: a "
 "miner's earnings are a direct function of its consensus rank, so quality, latency, and "
 "reliability convert into TAO every twelve minutes. Reachability is life: if a miner's Axon "
 "endpoint is not publicly reachable, validators cannot score it, and it earns exactly zero "
 "no matter how good its hardware is. Competition never sleeps: because weights and emission "
 "re-set at every tempo, a miner that rests on yesterday's quality is silently overtaken. This "
 "is why professional mining is an operations discipline as much as a machine-learning one — "
 "and why the monitoring and verdict tooling described later in this guide exists."),

("chart", {"path": "assets/bt_donut.png",
           "caption": "Figure 3 — Intra-subnet alpha emission split: roughly 41% miners, "
                      "41% validators, 18% subnet owner each epoch.",
           "max_h": 200}),

]
