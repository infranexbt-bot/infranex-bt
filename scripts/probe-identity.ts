/**
 * Probe + decode SubnetIdentitiesV3 (raw SCALE Bytes fallback).
 * Struct: subnet_name, github_repo, subnet_contact, subnet_url, discord,
 * description (each Compact<u32>-prefixed Vec<u8>) + additional pairs.
 */
import { ApiPromise, WsProvider } from "@polkadot/api";

const WS = process.env.CHAIN_WS ?? "wss://entrypoint-finney.opentensor.ai:443";

/** Read a SCALE Compact<u32> length prefix; returns [value, bytesConsumed]. */
function readCompact(u8a: Uint8Array, off: number): [number, number] {
  const b0 = u8a[off];
  if (b0 === undefined) throw new Error("compact out of range");
  const mode = b0 & 0b11;
  if (mode === 0) return [b0 >> 2, 1];
  if (mode === 1) return [((b0 >> 2) | (u8a[off + 1] << 6)), 2];
  if (mode === 2) return [b0 >> 2 | (u8a[off+1] << 6) | (u8a[off+2] << 14) | (u8a[off+3] << 22), 4];
  if (mode === 3) {
    // Huge compact — bottom two bits 11, remaining 30 bits are the value.
    const u32 = (b0 | (u8a[off+1] << 8) | (u8a[off+2] << 16) | (u8a[off+3] << 24)) >>> 0;
    return [u32 >>> 2, 4];
  }
  throw new Error("unreachable");
}

function decodeIdentity(hex: string): Record<string, string | [string, string][]> {
  const raw = hex.startsWith("0x") ? hex.slice(2) : hex;
  const u8a = new Uint8Array(raw.length / 2);
  for (let i = 0; i < u8a.length; i++) u8a[i] = parseInt(raw.substr(i * 2, 2), 16);
  const td = new TextDecoder();
  let off = 0;
  const readVec = (): string => {
    const [len, c] = readCompact(u8a, off);
    off += c;
    const bytes = u8a.slice(off, off + len);
    off += len;
    return td.decode(bytes).trim();
  };
  const out: Record<string, string | [string, string]> = {};
  out.subnetName = readVec();
  out.githubRepo = readVec();
  out.subnetContact = readVec();
  out.subnetUrl = readVec();
  out.discord = readVec();
  out.description = readVec();
  // `additional` is a single (BoundedVec<u8>, BoundedVec<u8>) tuple —
  // verified against SN3/SN11 raw SCALE bytes (no outer count prefix).
  out.additional = [readVec(), readVec()];
  return out;
}

async function main() {
  const api = await ApiPromise.create({ provider: new WsProvider(WS), noInitWarn: true });
  await api.isReady;
  const entry = (api.query.subtensorModule as unknown as Record<
    string,
    { entries: (args?: unknown) => Promise<Array<[unknown, unknown]>> }
  >)["subnetIdentitiesV3"];
  const entries = await entry.entries();
  console.log(`subnetIdentitiesV3: ${entries.length} entries`);

  const want = process.argv[2]
    ? new Set(process.argv[2].split(",").map(Number))
    : null; // null → all

  const dump: Record<string, unknown> = {};
  for (const [k, v] of entries) {
    const sk = k as { args?: Array<{ toString(): string }>; toString(): string };
    const netuid = Number(sk.args?.[0]?.toString() ?? sk.toString());
    if (want && !want.has(netuid)) continue;
    const hex = (v as unknown as { toHex(): string }).toHex();
    try {
      const decoded = decodeIdentity(hex);
      dump[netuid] = decoded;
      if (want) {
        console.log(`\n--- netuid ${netuid} ---`);
        for (const [fk, fv] of Object.entries(decoded)) {
          const s = JSON.stringify(fv);
          console.log(`  ${fk}: ${s && s.length > 300 ? s.slice(0, 300) + "…" : s}`);
        }
      }
    } catch (e) {
      dump[netuid] = { decodeError: (e as Error).message };
      console.log(`netuid ${netuid} decode failed: ${(e as Error).message}`);
    }
  }

  if (!want) {
    const out = process.env.OUT ?? "tool-results/subnet-identities.json";
    const { writeFileSync } = await import("node:fs");
    writeFileSync(out, JSON.stringify({
      source: "finney chain subtensorModule.subnetIdentitiesV3",
      extractedAt: new Date().toISOString(),
      count: Object.keys(dump).length,
      entries: Object.fromEntries(Object.entries(dump).map(([k, v]) => [Number(k), v])),
    }, null, 1));
    console.log(`wrote ${Object.keys(dump).length} identities → ${out}`);
  }

  await api.disconnect();
  process.exit(0);
}

main().catch((e) => { console.error("probe failed:", e); process.exit(1); });
