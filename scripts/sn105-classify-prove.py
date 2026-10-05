"""SN105 Beam — prove where 'RTX 4090 24GB · 24GB+' comes from.

1) Fetch the on-chain identity description for netuid 105 (and a few GPU
   subnets for comparison).
2) Run the app's CATEGORY_RULES classifier on that text to show which
   keyword fires and which GPU tier it assigns.
"""
import subprocess, json, re

CHAIN_SCRIPT = r"""
import { ApiPromise, WsProvider } from "@polkadot/api";

const API_URL = "wss://entrypoint-finney.opentensor.ai:443";
const NETUIDS = [105, 64, 96, 4];

async function main() {
  const provider = new WsProvider(API_URL);
  const api = await ApiPromise.create({ provider });
  const out = [];
  for (const n of NETUIDS) {
    try {
      const identity = await api.query.subnetModule.subnetIdentitiesV3(n);
      const id = identity.isSome ? identity.unwrap().toHuman() : null;
      const name = await api.query.subnetModule.subnetNames(n);
      out.push({
        netuid: n,
        name: name.isSome ? name.unwrap().toHuman() : null,
        identity: id,
      });
    } catch (e) { out.push({ netuid: n, error: String(e) }); }
  }
  console.log(JSON.stringify(out, null, 2));
  await api.disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
"""
with open("/home/z/my-project/scripts/sn105-chain.mjs", "w") as f:
    f.write(CHAIN_SCRIPT)

raw = subprocess.run(
    ["bun", "run", "/home/z/my-project/scripts/sn105-chain.mjs"],
    capture_output=True, text=True, timeout=120, cwd="/home/z/my-project",
)
if raw.returncode != 0:
    print("CHAIN ERR:", raw.stderr[-1500:])
    raise SystemExit(1)
chain = json.loads(raw.stdout)

# ---- classifier mirror (src/lib/infranex/miner-score.ts CATEGORY_RULES) ----
RULES = [
    ("Frontier inference",      r"\b(frontier|llm|text.?gen|prompt|language model|chat|assistant|inference)\b"),
    ("Model training",          r"\b(pretrain|pre-train|model training|training network|grpo|rlhf|post.?training)\b"),
    ("Media generation",        r"\b(video|image|diffusion|vision|photo|generative media|3d|render)\b"),
    ("Audio & speech",          r"\b(audio|speech|voice|music|sound)\b"),
    ("Data & scraping",         r"\b(scrap|crawl|data collect|data index|social data|sentiment|feed|dataset)\b"),
    ("Storage",                 r"\b(storag|file|archiv|backup)\b"),
    ("Prediction & markets",    r"\b(prediction|market mak|trading|financ|quant|hedge|odds)\b"),
    ("Software eng agents",     r"\b(software[ -]?engineer(?:ing)?|coding|code[ -]?(?:gen|agent|repair)|program(?:ming)?|developer)\b"),
    ("Agents & logic",          r"\b(agents?|orchestrat|routing|logic|swarm|tool use|evm|smart contract|web3 infra)\b"),
    ("Science & simulation",    r"\b(protein|fold|bio|genom|drug|science|research|simulat)\b"),
    ("Compute sharing",         r"\b(compute|gpu|depin|edge|latency|bandwidth|network shar)\b"),
    ("Verification & security", r"\b(moderat|detect|scan|verif|audit|secur|privacy|zero.?know)\b"),
    ("Real-world data",         r"\b(maps?|geo|weather|energy|robot|drone|iot)\b"),
]

print("\n================ CHAIN DATA + CLASSIFIER ================")
for s in chain:
    ident = s.get("identity") or {}
    desc = (ident.get("description") or "")
    name = (ident.get("name") or s.get("name") or "")
    text = f"{name} {desc}"
    hit = None
    for label, pat in RULES:
        m = re.search(pat, text, re.I)
        if m:
            hit = (label, m.group(0))
            break
    print(f"\nSN{s['netuid']}  name={name!r}")
    print(f"  description: {desc[:400]!r}")
    if hit:
        print(f"  → FIRST RULE MATCH: {hit[0]}  (keyword: {hit[1]!r})")
    else:
        print("  → no rule match → revenue fallback tier")
