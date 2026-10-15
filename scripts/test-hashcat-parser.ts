#!/usr/bin/env bun
/**
 * test-hashcat-parser.ts — unit tests for parseHashcatRequirement().
 * Run: bun scripts/test-hashcat-parser.ts
 */
import { parseHashcatRequirement, parsePm2Requirement } from "../src/lib/devops/subnet-requirements";

const CASES: Array<{ name: string; text: string; req: boolean; min: string | null }> = [
  {
    name: "user-reported line (SN35-class README)",
    text: "Install Hashcat\nRecommended hashcat version >= v6.2.5",
    req: true,
    min: "6.2.5",
  },
  { name: "operator form", text: "hashcat >= 6.2.5 is required", req: true, min: "6.2.5" },
  { name: "paren form", text: "Requires hashcat (>= 6.2.5) for cracking", req: true, min: "6.2.5" },
  { name: "or-higher form", text: "Use hashcat v6.2.5 or higher", req: true, min: "6.2.5" },
  { name: "plus suffix", text: "requires hashcat 6.2.6+ on the host", req: true, min: "6.2.6" },
  { name: "no version", text: "You must install hashcat before running the miner.", req: true, min: null },
  { name: "mention only, other tool version nearby", text: "Install hashcat.\nCUDA 12.1 required.", req: true, min: null },
  { name: "no hashcat at all", text: "Install bittensor and CUDA 12.1", req: false, min: null },
  { name: "empty", text: "", req: false, min: null },
  { name: "null", text: null as unknown as string, req: false, min: null },
  {
    name: "case-insensitive + takes max",
    text: "HASHCAT 6.2.5 minimum; hashcat >= 6.2.6 preferred",
    req: true,
    min: "6.2.6",
  },
];

let fails = 0;
for (const c of CASES) {
  const got = parseHashcatRequirement(c.text);
  const ok = got.required === c.req && got.minVersion === c.min;
  if (!ok) fails++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${c.name}  → got {required:${got.required}, min:${got.minVersion}} want {required:${c.req}, min:${c.min}}`
  );
}

// PM2 cases
const PM2_CASES: Array<{ name: string; text: string; want: boolean }> = [
  { name: "user-reported line", text: "PM2 Installation\nInstall and run pm2 commands to keep your miner online at all times.", want: true },
  { name: "pm2 start command", text: "pm2 start neurons/miner.py --name miner", want: true },
  { name: "npm install -g pm2", text: "npm install -g pm2", want: true },
  { name: "no pm2", text: "Run under systemd or docker", want: false },
];
for (const c of PM2_CASES) {
  const got = parsePm2Requirement(c.text);
  const ok = got === c.want;
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  pm2: ${c.name} → ${got}`);
}
console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
