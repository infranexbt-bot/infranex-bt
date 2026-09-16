/**
 * Deep-verify hosting constraints for candidate subnets:
 * dump README lines around hosting-related keywords with context.
 * Run: bun scripts/research-subnet-verify.ts
 */

const CANDIDATES: Array<{ netuid: number; name: string; owner: string; repo: string; grep: RegExp; label: string }> = [
  { netuid: 4, name: "Targon", owner: "manifold-inc", repo: "targon", grep: /bare|metal|TEE|attest|hardware|require/i, label: "bare-metal/TEE context" },
  { netuid: 28, name: "SayGM", owner: "taostat", repo: "gm-miner", grep: /TEE|TDX|must|require|deploy|hosting/i, label: "miner TEE requirement" },
  { netuid: 51, name: "lium.io", owner: "Datura-ai", repo: "lium-io", grep: /TDX|tee|attest|require|executor|provider/i, label: "executor TEE requirement" },
  { netuid: 58, name: "greevils", owner: "greevils-ai", repo: "greevils-cli", grep: /TDX|TEE|VM|deploy|miner|require/i, label: "TDX VM requirement" },
  { netuid: 90, name: "KubeTEE", owner: "KubeTEE-AI", repo: "kubetee-subnet", grep: /miner|require|hardware|bare|H\d00|B200|must/i, label: "miner hardware/hosting rules" },
  { netuid: 71, name: "Leadpoet", owner: "leadpoet", repo: "leadpoet", grep: /TEE|attest|enclave|miner|require/i, label: "TEE attestation for miners?" },
  { netuid: 94, name: "BitSota", owner: "AlveusLabs", repo: "SN94-BitSota", grep: /dedicated|hardware|bare|metal|require|GPU|V100|A\d00|H\d00|4090|5090/i, label: "dedicated hardware context" },
  { netuid: 33, name: "ReadyAI", owner: "afterpartyai", repo: "bittensor-conversation-genome-project", grep: /static ip|runpod|vast|docker|require/i, label: "static-ip + runpod allowed" },
  { netuid: 38, name: "ChronoLLM", owner: "chronollm", repo: "sn38", grep: /miner.*(?:require|run|host)|hardware|GPU|vRAM|VRAM/i, label: "miner-side requirements" },
];

async function fetchReadme(owner: string, repo: string): Promise<string | null> {
  for (const branch of ["HEAD", "main", "master"]) {
    for (const path of ["README.md", "readme.md", "README.rst", "README"]) {
      try {
        const res = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`, {
          headers: { "User-Agent": "infranex-bt-audit/1.0" },
        });
        if (res.ok) return await res.text();
      } catch { /* retry */ }
    }
  }
  return null;
}

const out: string[] = [];
for (const c of CANDIDATES) {
  out.push(`\n================ SN${c.netuid} ${c.name} (${c.owner}/${c.repo}) — ${c.label} ================`);
  const md = await fetchReadme(c.owner, c.repo);
  if (!md) {
    out.push("  !! README not found");
    continue;
  }
  const lines = md.split("\n");
  const hitIdx: number[] = [];
  lines.forEach((l, i) => {
    if (c.grep.test(l)) hitIdx.push(i);
  });
  // merge adjacent hits into context windows
  const windows: Array<[number, number]> = [];
  for (const i of hitIdx) {
    const last = windows[windows.length - 1];
    if (last && i - last[1] <= 3) last[1] = i;
    else windows.push([i, i]);
  }
  for (const [a, b] of windows.slice(0, 14)) {
    out.push(`--- lines ${a + 1}-${b + 1} ---`);
    for (let i = a; i <= b; i++) {
      const t = lines[i].replace(/[#*`>|]/g, "").trim();
      if (t) out.push(`  L${i + 1}: ${t.slice(0, 230)}`);
    }
  }
  if (hitIdx.length > 60) out.push(`  (${hitIdx.length} matching lines total — showing first windows)`);
}
await Bun.write("/tmp/subnet-verify.txt", out.join("\n"));
console.log(out.join("\n").slice(0, 30000));
