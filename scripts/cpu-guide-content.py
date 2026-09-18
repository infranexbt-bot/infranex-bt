# CPU MINER SETUP GUIDE — content module (English)
# Block kinds: h1, h2, body, bullet, numbered, table, statband, callout, code, image
# Consumed by gen-cpu-guide-pdf.py (Report route: ReportLab body + Playwright cover)

IMG = "/home/z/my-project/download/cpu-miner-setup-guide/images"

CONTENT = [

# ------------------------------------------------------------------ 1. INTRODUCTION
{"kind": "h1", "text": "1. Introduction — CPU Mining on Bittensor"},
{"kind": "body", "text": "Most Bittensor subnets reward validators and miners for machine-learning work, and that work is usually assumed to need an expensive GPU. It does not — not everywhere. A handful of subnets are built so that a modest CPU virtual machine can do the required work: serving small models, answering consensus probes, running lightweight verification loops, or providing low-latency availability. On those subnets a two-vCPU box with 8 GB of RAM competes honestly with machines that cost twenty times as much to rent. This guide teaches you how to find such subnets, rent a cheap server for them, and run a miner on it — either with one-click automation or by hand."},
{"kind": "body", "text": "The guide is written for a first-time miner. Every step assumes no prior experience with cloud providers, Linux servers, or the Bittensor toolchain. Two paths are covered side by side. <b>Path A (recommended)</b> uses the CPU Catalog built into the Infranex BT platform: you paste a cloud provider API key, pick an offer, click <b>Rent &amp; auto-install</b>, and the platform provisions the server, installs the base mining stack, and hands the host to the DevOps Engine with a nine-step install plan. <b>Path B</b> is the fully manual route — create the server in the provider's web console, SSH in, and type each command yourself. Path A takes about 15 minutes of active work; Path B takes 30 to 45 minutes and teaches you what the automation is doing underneath."},
{"kind": "body", "text": "The worked example throughout this guide is <b>RedTeam (netuid 61)</b>, a CPU-class subnet whose documented hosting profile is 2 vCPU cores, 8 GB of RAM, 50 GB of disk, Ubuntu 22.04, and no GPU. Every command and every screenshot below uses that profile so you can follow along exactly. The same procedure works for any CPU-class subnet — only the repository you clone and the subnet number change."},
{"kind": "statband", "stats": [["~$5-9/mo", "CPU host cost (RedTeam-class)"], ["~$161/mo", "typical GPU host cost"], ["~95%", "cost saved vs GPU mining"], ["15 min", "active setup time (Path A)"]]},
{"kind": "body", "text": "A note on expectations before you spend anything. CPU mining is not a guarantee of income: subnets pay emissions only to miners whose responses the validator ranks highly, and competition on popular subnets can be real. What a cheap CPU box gives you is a legitimately low-cost position from which to learn the machinery — wallet, registration, provisioning, logs — without risking a GPU-sized bill. Treat your first miner as tuition that usually costs less than a restaurant meal per month."},

# ------------------------------------------------------------------ 2. PREREQUISITES
{"kind": "h1", "text": "2. Prerequisites Checklist"},
{"kind": "body", "text": "Everything you need falls into four buckets: an identity on the Bittensor chain (the wallet), a place to run (the cloud server), a way to manage it (the Infranex BT platform or plain SSH), and a small budget. Work through the table below before starting Step 1 — each row lists what the item is used for and where to get it. Nothing here requires special approval; a standard account on the provider of your choice is sufficient."},
{"kind": "table",
 "header": ["Item", "Why you need it", "Where to get it"],
 "ratios": [0.24, 0.42, 0.34],
 "rows": [
   ["Bittensor wallet (coldkey + hotkey)", "Coldkey holds TAO and pays fees; the hotkey is registered on the subnet as your miner identity", "Created locally with btcli — see Step 1"],
   ["Cloud provider account", "Hosts the miner: Hetzner Cloud or DigitalOcean for CPU boxes", "console.hetzner.cloud or cloud.digitalocean.com — billing enabled"],
   ["Infranex BT platform access", "Path A: CPU Catalog, DevOps Engine, monitoring (optional but recommended)", "Your operator ID + access code"],
   ["~$5-10 per month", "Server rent while you evaluate the subnet", "Provider invoice, billed hourly"],
   ["0.1-1.0 TAO", "Hotkey registration fee (recycled into the subnet), plus a small reserve", "In your coldkey wallet — see Step 1"],
   ["Terminal basics (Path B only)", "Copy-paste commands, SSH into the server", "Any terminal: macOS/Linux shell or Windows PowerShell"],
 ]},
{"kind": "body", "text": "On provider choice: Hetzner Cloud is usually the cheapest per vCPU in EU locations and is the default in this guide's examples; DigitalOcean costs slightly more but has worldwide regions and a very simple console. Both work identically with the app and with this guide. If you already have an account with either one, just use it — creating a second account offers no advantage."},
{"kind": "image", "src": IMG + "/s01-login.png", "caption": "Figure 1 — Infranex BT sign-in. Sign in with your operator ID and access code to use the CPU Catalog (Path A)."},

# ------------------------------------------------------------------ 3. STEP 1 — WALLET
{"kind": "h1", "text": "3. Step 1 — Create Your TAO Wallet"},
{"kind": "body", "text": "A Bittensor wallet is a pair of cryptographic keys. The <b>coldkey</b> is your bank account: it holds your TAO balance, signs stake transfers, and pays the subnet registration fee. It should live on a machine you trust and never be placed on the mining server. The <b>hotkey</b> is your miner's public identity: it is registered on the subnet's metagraph and is what the validator scores. The hotkey can sit on the server; the coldkey must not."},
{"kind": "body", "text": "Both keys are created with <b>btcli</b>, the official Bittensor command-line tool. Install it once on your local machine (a laptop is fine — this machine does not need to stay online for mining), then run the two creation commands below. You will be asked to choose a wallet name; the examples use <b>default</b> for the coldkey wallet and <b>miner</b> for the hotkey, which matches the app's defaults later."},
{"kind": "code", "lang": "local machine", "text": "pip install bittensor\nbtcli wallet new_coldkey --wallet default\nbtcli wallet new_hotkey  --wallet default --hotkey miner"},
{"kind": "body", "text": "Each command generates a key and shows a <b>mnemonic</b> — twelve English words that can rebuild the key from nothing. Write the words on paper (not in a screenshot, not in a cloud note) and store them somewhere safe. Anyone holding the coldkey's twelve words owns your TAO; there is no reset and no support desk. If you lose the words and the key file, the funds are gone."},
{"kind": "callout", "text": "<b>Backup rule.</b> Paper copy of both mnemonics, stored offline, before you fund anything. The coldkey mnemonic is the master key to your TAO. The hotkey mnemonic only controls mining identity, but back it up too — re-registering after a loss costs another registration fee."},
{"kind": "body", "text": "Finally, fund the coldkey with the registration budget: 0.1 to 1.0 TAO covers the fee on most subnets (each subnet recycles its own fee amount), plus a small reserve. Check the exact fee for your subnet with <b>btcli subnet list</b> before registering. Transfer can come from any exchange wallet or another Bittensor wallet you control. Verify the balance arrived with <b>btcli wallet balance</b> — the number you see here is what the registration in Step 5 will draw from."},

# ------------------------------------------------------------------ 4. STEP 2 — CONNECT PROVIDER
{"kind": "h1", "text": "4. Step 2 — Connect a CPU Provider in the App"},
{"kind": "body", "text": "Path A starts in the platform. Sign in, open <b>CPU Catalog</b> (section 06b in the left navigation), and click <b>Provider API keys</b> in the top-right. The dialog lists exactly two CPU providers — <b>Hetzner Cloud</b> and <b>DigitalOcean</b> — because those are the two this release supports for CPU provisioning. Paste the API key from your provider account into the matching row and press <b>Save &amp; verify</b>; the platform calls the provider's API immediately and reports whether the key works before saving anything."},
{"kind": "image", "src": IMG + "/s07-cpu-keys-dialog.png", "caption": "Figure 2 — Provider API keys dialog. Keys are validated on save, encrypted with AES-256-GCM at rest, and never displayed again."},
{"kind": "body", "text": "Where do you find the key? In Hetzner Cloud, open your project, go to <b>Security &gt; API tokens</b>, and generate a token — read and write scope is required because renting a server is a write operation. In DigitalOcean, use <b>API &gt; Tokens</b> and generate a full-access personal access token (a read-only token can list prices but cannot rent). Name the token something recognizable like <b>infranex-cpu</b> so you can audit or revoke it later from the provider side."},
{"kind": "body", "text": "The platform treats the key with the same care as a password. It is encrypted with AES-256-GCM before it touches the database, used only server-side to call the provider's pricing and provisioning APIs, never sent back to the browser, and never displayed again after saving. Removing the key from the dialog immediately removes that provider's offers from the catalog. If you ever suspect the key leaked, delete it in the app and revoke it in the provider console — both take effect instantly."},
{"kind": "image", "src": IMG + "/s08-connect-provider.png", "caption": "Figure 3 — Until a key is connected, the catalog shows an honest empty state with the Connect a CPU provider button — no synthetic placeholder offers."},

# ------------------------------------------------------------------ 5. STEP 3 — PICK AN OFFER
{"kind": "h1", "text": "5. Step 3 — Pick a Server Offer"},
{"kind": "body", "text": "With a key connected, the CPU Catalog fills with live offers pulled directly from the provider's pricing API — Hetzner's server-type list or DigitalOcean's size list, refreshed about every 60 seconds. Nothing here is estimated: the price column is the provider's own hourly and monthly rate for that exact machine type in that location. Use the filter row to narrow the list by provider, by RAM, and by maximum monthly price, and sort by cheapest."},
{"kind": "image", "src": IMG + "/s06-cpu-catalog.png", "caption": "Figure 4 — CPU Catalog (06b). The three explainer cards describe the pipeline; the chips below enforce the minimum specs before you commit."},
{"kind": "body", "text": "What should you look for in an offer? The platform enforces a hard floor — <b>at least 2 vCPU, 4 GB RAM, and 40 GB disk</b> — and refuses to provision anything below it, because smaller boxes fail the base stack installation. For RedTeam-class subnets the recommended profile is higher: <b>2 vCPU, 8 GB RAM, 50 GB disk</b>, which is exactly the documented requirement of netuid 61. On Hetzner that profile maps to the CX22 server type at roughly $4.5 to $5 per month in the EU locations; on DigitalOcean the equivalent is a 2 vCPU / 4 GB basic droplet, and an 8 GB droplet runs about $12 per month."},
{"kind": "table",
 "header": ["Spec line", "Minimum (floor)", "RedTeam α61 recommended"],
 "ratios": [0.34, 0.30, 0.36],
 "rows": [
   ["vCPU cores", "2", "2"],
   ["RAM", "4 GB", "8 GB"],
   ["Disk", "40 GB", "50 GB"],
   ["Operating system", "Ubuntu 22.04 LTS", "Ubuntu 22.04 LTS"],
   ["GPU", "not required", "not required"],
   ["Reference price", "≈ $5/mo (Hetzner CX22)", "≈ $4.5-9/mo depending on provider/region"],
 ]},
{"kind": "body", "text": "Two practical tips when comparing offers. First, prefer a location close to the subnet's validators — lower round-trip latency slightly improves how quickly your miner answers probes, and for most CPU subnets EU-central (Hetzner's Nuremberg or Falkenstein) is a safe default. Second, do not pay for headroom you will not use: an 8 GB box that idles at 30 percent memory is the sweet spot for netuid 61, while a 16 GB box doubles the bill for no scoring benefit. You can always migrate later — the DevOps Engine's fix flow rebuilds the host on a new offer in place."},

# ------------------------------------------------------------------ 6. STEP 4 — RENT & AUTO-INSTALL
{"kind": "h1", "text": "6. Step 4 — Rent &amp; Auto-Install (Path A)"},
{"kind": "body", "text": "This is the step where the platform does the work Path B would make you do by hand. Open the offer row and click <b>Rent &amp; auto-install</b>. Behind that one button the platform runs a five-stage pipeline, and each stage is visible in the dialog as it happens: it re-resolves the offer live (so the price you saw is the price you pay), profiles your chosen subnet's git repository for its real requirements, refuses anything that cannot honestly run, provisions the server with cloud-init, and finally hands the finished host to the DevOps Engine."},
{"kind": "numbered", "items": [
 "<b>Offer re-resolution.</b> The platform re-fetches the offer from the provider API at the moment you click. If the machine type sold out or the price changed, you see it immediately — you are never billed against a stale listing.",
 "<b>Requirements profiling.</b> The engine fetches the subnet's repository (for netuid 61: the RedTeam subnet repo) and reads its README, requirements.txt, and Dockerfile to establish what the miner actually needs — CPU, RAM, disk, GPU, Python version.",
 "<b>Honesty gate.</b> If the repo documents GPU support as required, or the box is below the 2 vCPU / 4 GB / 40 GB floor, provisioning stops with a clear message. The platform will not rent hardware it knows cannot run the workload.",
 "<b>Provisioning.</b> The server is created at the provider via your stored key: Ubuntu 22.04 image, your chosen size and region, and a cloud-init user-data script that installs Docker, Python venv tooling, and the Bittensor base stack on first boot.",
 "<b>Hand-off to DevOps.</b> The finished host — with its SSH transport recorded server-side — appears in the DevOps Engine (section 08) as a host with a nine-step install plan pending your approvals.",
]},
{"kind": "body", "text": "The provisioning call takes one to three minutes. When the dialog reports success, switch to the <b>DevOps Engine</b> view and you will see the new host with its install plan: nine steps that begin with system verification and dependency installation, continue through the subnet-specific install, and end at the miner launch — with two deliberate <b>approval gates</b> where the platform stops and waits for you. The gates exist because the steps after them spend your funds (registration) and start your miner (launch); nothing irreversible happens without an explicit click from you."},
{"kind": "image", "src": IMG + "/s10-devops-engine.png", "caption": "Figure 5 — DevOps Engine (08). Rented hosts land here with the nine-step install plan; wallet and launch steps wait for your explicit approval."},
{"kind": "callout", "text": "<b>What the platform does not do silently:</b> it never spends TAO, never registers your hotkey, and never starts the miner until you approve each gate in DevOps. If you walk away after Step 4, you pay only the server's hourly rent — nothing on-chain has happened yet."},

# ------------------------------------------------------------------ 7. STEP 5 — REGISTER & LAUNCH
{"kind": "h1", "text": "7. Step 5 — Register the Hotkey and Launch"},
{"kind": "body", "text": "The first approval gate in the DevOps install plan is <b>wallet registration</b>. At this step the platform needs three things you have prepared in Step 1: the coldkey (to pay the fee), the hotkey (to register), and the subnet number (61 in our example). Enter the wallet name and hotkey name when the gate asks for them — the app never asks for mnemonics; it uses the key files you unlocked in the wallet dialog, or in the manual flow you run the register command yourself. Registration writes your hotkey into the subnet's metagraph, which is the on-chain list of miner identities the validator scores."},
{"kind": "code", "lang": "what the gate runs", "text": "btcli subnet register --netuid 61 \\\n    --wallet default --hotkey miner\n# fee: 0.1-1.0 TAO (recycled), paid from the coldkey"},
{"kind": "body", "text": "Registration is fast — a few seconds on-chain — but two things can block it, and both show up as clear errors at the gate. The first is an underfunded coldkey: the fee is drawn at the moment of registration, and if the balance is short the transaction fails without spending anything; top up from Step 1 and retry. The second is a full subnet: every subnet has a limited number of miner slots, and when all slots are taken, registration is refused until a slot frees. If netuid 61 is full when you read this, the platform's Opportunities view ranks CPU-class subnets with open seats — pick one with available slots and repeat Steps 3 to 5 against that subnet number instead."},
{"kind": "body", "text": "After registration succeeds, the plan continues to the second gate: <b>launch approval</b>. Approving it starts the miner process on your server with the subnet's configuration — the repo the engine installed in Step 4, your wallet and hotkey names injected as environment variables, and the process supervised so it restarts on crash. From this moment you are mining: the process holds an open connection to the subnet's validator and begins answering its probes. The DevOps host card flips to a running state and the log tail on the card becomes live."},
{"kind": "callout", "text": "<b>Costs begin and stay visible here.</b> From launch onward you pay the server rent (about $0.007/hour for a CX22) for as long as the host lives. The DevOps card and the Monitoring view both show the host; terminating the host from the app stops the spend the same minute."},

# ------------------------------------------------------------------ 8. PATH B — MANUAL DIY
{"kind": "h1", "text": "8. Path B — Manual DIY Setup over SSH"},
{"kind": "body", "text": "Prefer to see every screw? Path B builds the identical result by hand. It is the same five stages as the automated pipeline — create the box, install the base stack, fetch the subnet's code, configure the wallet, start the miner — executed as plain commands. This path is worth doing once even if you plan to use Path A afterwards, because every DevOps install step will then map to something you have personally typed."},
{"kind": "h2", "text": "8.1 Create the server in the provider console"},
{"kind": "numbered", "items": [
 "Log in to <b>console.hetzner.cloud</b> (or cloud.digitalocean.com) and create a new server / droplet.",
 "Choose <b>Ubuntu 22.04</b> as the image, the <b>CX22</b> type in EU-central for netuid 61 (2 vCPU / 4 GB / 40 GB), or the 8 GB variant for the full RedTeam profile.",
 "Add your SSH public key (generate one locally with <b>ssh-keygen -t ed25519</b> if you do not have one) — password login is slower and less safe.",
 "Pick a location near the validators (EU-central is a safe default), create the server, and note its IPv4 address.",
]},
{"kind": "h2", "text": "8.2 Install the base stack"},
{"kind": "code", "lang": "on the server (ssh root@YOUR_SERVER_IP)", "text": "apt update && apt upgrade -y\napt install -y docker.io python3-venv python3-pip git ufw\nufw allow OpenSSH && ufw --force enable\n# bittensor CLI + python stack\npython3 -m venv /opt/btvenv\nsource /opt/btvenv/bin/activate\npip install --upgrade pip\npip install bittensor"},
{"kind": "h2", "text": "8.3 Fetch the subnet's miner code"},
{"kind": "body", "text": "Each subnet's repository defines exactly how its miner runs. For netuid 61 the engine reads the RedTeam repository's README and requirements.txt — you do the same manually. Clone the repo, install its pinned dependencies into the same virtual environment, and read its README for the miner's launch command and any required environment variables. This is the same evidence the automated pipeline uses for its honesty gate, so a repo that demands a GPU here is a subnet you should not rent a CPU box for."},
{"kind": "code", "lang": "on the server", "text": "git clone https://github.com/redeam-tensor/redteam-subnet.git /opt/subnet\ncd /opt/subnet\npip install -r requirements.txt\n# read the miner section of README.md before the next step"},
{"kind": "h2", "text": "8.4 Configure the wallet and start the miner"},
{"kind": "body", "text": "Copy the hotkey file to the server (never the coldkey), set the wallet environment, and run the miner under a supervisor so it survives SSH disconnects and crashes. The example uses pm2, a process manager that is forgiving for beginners; systemd works equally well. Check the subnet README for the exact entry point — the shape of the command below is what most neuron miners look like."},
{"kind": "code", "lang": "on the server", "text": "# from your LOCAL machine — copy ONLY the hotkey:\nscp -r ~/.bittensor/wallets/default/hotkeys/miner \\\n    root@YOUR_SERVER_IP:/root/.bittensor/wallets/default/hotkeys/\n\n# on the server:\nnpm install -g pm2 2>/dev/null || apt install -y npm && npm i -g pm2\nsource /opt/btvenv/bin/activate\ncd /opt/subnet\npm2 start python --name redteam-miner -- neurons/miner.py \\\n    --netuid 61 --wallet.name default --wallet.hotkey miner\npm2 save && pm2 startup"},
{"kind": "callout", "text": "<b>Security floor for Path B.</b> Coldkey stays on your local machine — the server only ever needs the hotkey. Keep the firewall on (ufw), disable password SSH auth, and run the miner as a non-root user once you are comfortable. These three habits cover the vast majority of real-world compromises."},

# ------------------------------------------------------------------ 9. VERIFY MINING
{"kind": "h1", "text": "9. Verify You Are Mining"},
{"kind": "body", "text": "\"Running\" and \"mining\" are different states, and the difference is measurable. A running process consumes CPU; a mining process is being scored by the validator and holds a UID on the subnet's metagraph. Three checks take you from launch to certainty, and all three take under a minute each. Run them a few minutes after launch — validators typically poll miners on their own cycle, so first scores appear within one to two epochs."},
{"kind": "numbered", "items": [
 "<b>Process check.</b> Path A: the DevOps host card shows the install plan complete and the log tail streaming. Path B: <b>pm2 status</b> shows the miner online with low restart count, and <b>pm2 logs redteam-miner</b> shows it booting, connecting, and serving requests.",
 "<b>Metagraph check.</b> From any machine: <b>btcli subnet metavaragraph --netuid 61</b> lists the subnet's UIDs. Find your hotkey's row — its UID existing at all means registration landed; the I (incentive) column going above zero means the validator is scoring you.",
 "<b>Emission check.</b> <b>btcli wallet overview</b> shows TAO accruing against the hotkey's stake as epochs pass. Numbers move slowly at first — one epoch is roughly 12 minutes, and rankings stabilize over the first hours.",
]},
{"kind": "code", "lang": "verification commands", "text": "pm2 status                        # Path B: process alive?\npm2 logs redteam-miner --lines 50 # boot + request logs\nbtcli subnet metavaragraph --netuid 61   # find your UID + I column\nbtcli wallet overview             # TAO balance & stake trend"},
{"kind": "image", "src": IMG + "/s03-subnets.png", "caption": "Figure 6 — The Subnets view (03) shows the subnet's live mechanics; the Opportunities view (02) ranks CPU-class subnets by net monthly potential."},
{"kind": "body", "text": "What healthy logs look like varies by subnet, but the stable signals are: the miner announces itself, registers with the axon (its listening endpoint), then logs periodic incoming requests and its responses. A process that boots and then logs nothing for many minutes is usually either unregistered (check the metagraph again) or unreachable from the validator (check the firewall and that the axon port is open). The Troubleshooting table in Section 11 maps each of these symptoms to a fix."},

# ------------------------------------------------------------------ 10. MONITOR & MAINTAIN
{"kind": "h1", "text": "10. Monitor, Maintain, and Stop the Spend"},
{"kind": "body", "text": "A CPU miner is low-maintenance by design, but three routines keep it healthy. Daily (or whenever you open the platform), glance at the <b>Monitoring</b> view — it tracks host reachability, and the DevOps host card surfaces process restarts and errors before they become downtime. Weekly, update the subnet code: miners that fall behind the repo's latest version slowly lose score as the subnet evolves. And monthly, review the provider invoice against your expectations — a CX22 should bill almost exactly its listed monthly price, and any surprise is worth investigating."},
{"kind": "bullets", "items": [
 "<b>Restart the miner</b> (Path B: <b>pm2 restart redteam-miner</b>; Path A: the DevOps card's restart action) after any config change, and after code updates.",
 "<b>Update the code</b> on the server: <b>cd /opt/subnet &amp;&amp; git pull &amp;&amp; pip install -r requirements.txt</b>, then restart the process. The DevOps Engine's fix flow does the equivalent automatically.",
 "<b>Watch the subnet's health</b>, not just your own: if the subnet's emission or validator set collapses, your miner is fine but the reward pool is not. The platform's Subnets and Opportunities views make this visible at a glance.",
 "<b>Stop the spend when needed.</b> Terminating the host (Path A: DevOps card terminate; Path B: delete the server in the provider console) stops billing immediately. Your hotkey stays registered — re-renting later costs a fresh setup but no second registration fee if the hotkey is still on the metagraph.",
]},
{"kind": "image", "src": IMG + "/s05-cpu-guide-view.png", "caption": "Figure 7 — The in-app CPU Guide (05) condenses this workflow for reference while you operate; Monitoring (10) and DevOps Engine (08) are the day-to-day surfaces."},
{"kind": "body", "text": "Cost expectation, realistically stated. The server is the only continuous cost: $4.5 to $9 per month depending on provider and region. The registration fee is a one-time cost per subnet entry, recycled into the subnet rather than burned. Earnings, on the other hand, are not guaranteed and not constant — they depend on your rank among the subnet's miners and on the subnet's emissions. The honest frame is: your downside is capped at about the price of two coffees per month, and your upside is learning the full mining stack on live infrastructure."},

# ------------------------------------------------------------------ 11. TROUBLESHOOTING
{"kind": "h1", "text": "11. Troubleshooting"},
{"kind": "body", "text": "Nearly every first-week problem falls into one of the rows below. The pattern for diagnosing is always the same: establish at which layer it broke — provider (server exists?), transport (SSH reachable?), process (miner alive?), registration (UID exists?), or scoring (incentive above zero?) — then apply the matching fix. The platform's DevOps host card automates the first three layers; the last two are chain state you check with btcli."},
{"kind": "table",
 "header": ["Symptom", "Likely cause", "Fix"],
 "ratios": [0.32, 0.30, 0.38],
 "rows": [
   ["SSH: connection refused / timeout", "Server not booted yet, or firewall blocks port 22", "Wait 1-2 min after creation; check provider console power state; ensure ufw allows OpenSSH"],
   ["Provider key rejected at save", "Wrong scope or trailing whitespace", "Regenerate token with read/write scope; paste without spaces; check provider status page"],
   ["Install step fails: out of memory", "Box below the subnet's real RAM need", "Migrate to the 8 GB profile (DevOps fix flow, or a bigger type in Path B)"],
   ["Registration rejected: insufficient balance", "Coldkey underfunded for the fee", "Top up the coldkey (Step 1) and retry the gate"],
   ["Registration rejected: subnet full", "No free miner slots on this netuid", "Pick a CPU-class subnet with open seats in Opportunities (02) and re-run Steps 3-5"],
   ["Miner runs, no incentive (I = 0)", "Not yet scored, or unreachable axon", "Wait 1-2 epochs; then check firewall allows the axon port from the README; verify UID in metagraph"],
   ["Miner crashes on boot", "Missing dependency or stale config", "Read pm2/install logs; pip install -r requirements.txt again; restart"],
   ["Costs higher than expected", "Extra volumes, IPs, or a bigger type", "Check provider invoice line items; DevOps shows the exact machine type it rents"],
 ]},
{"kind": "body", "text": "If a problem does not fit the table, the fastest escalation path is evidence, not guesses: capture the failing install step's log from the DevOps card (Path A) or the last 50 lines of pm2 logs (Path B), note the exact subnet and machine type, and reproduce the failing command once. Nine times out of ten the error message in that log is the answer; the remaining tenth is where the platform's Ops agent and the subnet's own Discord channel come in."},

# ------------------------------------------------------------------ 12. FAQ & NEXT STEPS
{"kind": "h1", "text": "12. FAQ and Next Steps"},
{"kind": "h2", "text": "12.1 Frequently asked questions"},
{"kind": "table",
 "header": ["Question", "Answer"],
 "ratios": [0.34, 0.66],
 "rows": [
   ["Do I need a GPU at all?", "Not for CPU-class subnets like RedTeam (61). The platform's honesty gate blocks renting a CPU box for subnets whose repos document GPU requirements."],
   ["Can I run several miners on one box?", "Sometimes — check the subnet's RAM footprint. The catalog floor (2 vCPU / 4 GB / 40 GB) assumes one miner; adding a second halves your headroom."],
   ["Why is my incentive zero after hours?", "Most often: unregistered hotkey (no UID), unreachable axon port, or the validator simply ranks competitors higher. Work through Section 9's three checks in order."],
   ["What happens if I terminate the server?", "Billing stops that minute; the miner stops; the hotkey's registration persists until it decays. Re-renting later means re-running the install, not paying again to register."],
   ["Which subnet should I start with?", "Open Opportunities (02), filter for CPU-classified workloads, and compare net monthly potential against open seats. RedTeam (61) is this guide's worked example."],
   ["Is this financial advice?", "No. Emissions depend on subnet performance and competition. This guide is operational documentation for the machinery, not a return forecast."],
 ]},
{"kind": "h2", "text": "12.2 Glossary"},
{"kind": "table",
 "header": ["Term", "Meaning"],
 "ratios": [0.26, 0.74],
 "rows": [
   ["Coldkey", "Your on-chain identity holding TAO; pays fees and stake. Never leaves your local machine."],
   ["Hotkey", "The miner's working identity, registered on a subnet's metagraph; safe to keep on the server."],
   ["netuid", "A subnet's number on the chain — RedTeam is netuid 61."],
   ["Metagraph", "The on-chain table of a subnet's UIDs, stakes, and scores."],
   ["Incentive (I)", "The validator's current score for a UID; above zero means you are earning."],
   ["Emission", "TAO released by the chain per epoch and split among a subnet's participants."],
   ["cloud-init", "First-boot provisioning script the platform injects to install the base stack."],
   ["DevOps Engine", "The platform view (08) that runs the nine-step install plan with approval gates."],
 ]},
{"kind": "h2", "text": "12.3 Where to go next"},
{"kind": "body", "text": "Once your first CPU miner has survived a week — registered, scored, and stable — you have the full skill chain: wallet custody, provisioning, installation, and verification. From there, three directions add value. Scale horizontally by renting a second CPU box for another CPU-class subnet; the second take of the procedure takes minutes because you already know every gate. Graduate to GPU subnets when you find one whose economics you like — the GPU Catalog (06) mirrors everything you learned here, and the platform's GPU Miner Setup Guide covers the GPU-specific steps. Or go deeper on one subnet: read its repository beyond the README, understand what the validator actually rewards, and tune your miner's configuration against it. The machinery in this guide is the foundation for all three."},
{"kind": "body", "text": "Reference links used throughout: Bittensor docs at docs.bittensor.com (btcli and wallet concepts), Hetzner Cloud console at console.hetzner.cloud, DigitalOcean console at cloud.digitalocean.com, and the in-app surfaces — CPU Guide (05), CPU Catalog (06b), DevOps Engine (08), and Monitoring (10). Keep this PDF beside those views and the two paths will stay one glance apart."},
]
