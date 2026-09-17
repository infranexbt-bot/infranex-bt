// CPU-CATALOG-1 — fixture tests for the CPU provider adapters + the
// GPU-subnet routing refusal. No real provider is called for the parsing
// checks (fetch is intercepted with API-doc-shaped fixtures); the GPU-lock
// check runs against the live dev server with a THROWAWAY key row that is
// deleted in cleanup. Run: bun scripts/test-cpu-adapters.ts

import { hetznerOffers, digitalOceanOffers } from "../src/lib/infranex/cpu-providers";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    pass++;
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// --- Fixtures shaped exactly per provider API docs ---------------------------

const HETZNER_SERVER_TYPES = {
  server_types: [
    {
      id: 104,
      name: "cx22",
      cores: 2,
      memory: 4,
      disk: 40,
      cpu_type: "shared",
      architecture: "x86",
      prices: [
        { location: "fsn1", price_monthly: { net: "3.7900000000", gross: "4.5101000000" } },
        { location: "ash", price_monthly: { net: "4.5900000000", gross: "5.4600000000" } },
      ],
    },
    {
      id: 112,
      name: "cx32",
      cores: 4,
      memory: 8,
      disk: 80,
      cpu_type: "shared",
      architecture: "x86",
      prices: [{ location: "fsn1", price_monthly: { net: "6.8000000000", gross: "8.0920000000" } }],
    },
    {
      // ARM — excluded (miner docker images are amd64)
      id: 200,
      name: "cax11",
      cores: 2,
      memory: 4,
      disk: 40,
      cpu_type: "shared",
      architecture: "arm",
      prices: [{ location: "fsn1", price_monthly: { net: "3.2900000000", gross: "3.9151000000" } }],
    },
    {
      // deprecated — excluded
      id: 1,
      name: "cx11",
      cores: 1,
      memory: 2,
      disk: 20,
      cpu_type: "shared",
      architecture: "x86",
      deprecated: true,
      prices: [{ location: "fsn1", price_monthly: { net: "3.2900000000", gross: "3.9151000000" } }],
    },
    {
      // dedicated CPU — kept, tagged dedicated
      id: 300,
      name: "ccx13",
      cores: 2,
      memory: 8,
      disk: 80,
      cpu_type: "dedicated",
      architecture: "x86",
      prices: [{ location: "fsn1", price_monthly: { net: "13.6900000000", gross: "16.2900000000" } }],
    },
    {
      // no prices — excluded
      id: 400,
      name: "cx42",
      cores: 8,
      memory: 16,
      disk: 160,
      cpu_type: "shared",
      architecture: "x86",
      prices: [],
    },
  ],
};

const DO_SIZES = {
  sizes: [
    {
      slug: "s-2vcpu-4gb",
      memory: 4096,
      vcpus: 2,
      disk: 80,
      price_monthly: 24.0,
      price_hourly: 0.03519,
      available: true,
      regions: ["nyc1", "fra1", "sgp1"],
    },
    {
      slug: "c-4",
      memory: 8192,
      vcpus: 4,
      disk: 25,
      price_monthly: 87.0,
      price_hourly: 0.12755,
      available: true,
      regions: ["nyc3"],
    },
    {
      // GPU droplet — excluded
      slug: "gpu-h100x1-80gb",
      memory: 245760,
      vcpus: 20,
      disk: 720,
      price_monthly: 3348.0,
      price_hourly: 4.904,
      available: true,
      regions: ["nyc3"],
    },
    {
      // unavailable — excluded
      slug: "s-1vcpu-1gb",
      memory: 1024,
      vcpus: 1,
      disk: 25,
      price_monthly: 6.0,
      price_hourly: 0.00898,
      available: false,
      regions: ["nyc1"],
    },
  ],
};

async function withMockFetch<T>(routes: { match: RegExp; body: unknown }, fn: () => Promise<T>): Promise<T> {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (routes.match.test(url)) {
      return new Response(JSON.stringify(routes.body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return realFetch(input as RequestInfo);
  }) as typeof fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = realFetch;
  }
}

async function main() {
  console.log("Hetzner adapter (fixture):");
  const h = await withMockFetch(
    { match: /api\.hetzner\.cloud\/v1\/server_types/, body: HETZNER_SERVER_TYPES },
    () => hetznerOffers("fixture-key")
  );
  check("excludes arm / deprecated / priceless types", h.length === 3, h.map((o) => o.model).join(","));
  const cx22 = h.find((o) => o.model === "CX22");
  check("CX22 present", Boolean(cx22));
  check("CX22 cheapest-location pricing (fsn1 €4.51 gross)", Math.abs((cx22?.monthlyPrice ?? 0) - 4.51) < 0.001, `$${cx22?.monthlyPrice}/mo`);
  check("CX22 hourly = monthly/730", Math.abs((cx22?.hourlyPrice ?? 0) - 4.51 / 730) < 0.0001, `$${cx22?.hourlyPrice}/hr`);
  check("CX22 region = cheapest location", cx22?.region === "fsn1", cx22?.region);
  check("CX22 specs 2c/4GB/40GB shared", cx22?.cpuCores === 2 && cx22?.ramGb === 4 && cx22?.diskGb === 40 && cx22?.cpuType === "shared");
  check("CX22 id hetzner-cx22", cx22?.id === "hetzner-cx22", cx22?.id);
  const ccx = h.find((o) => o.model === "CCX13");
  check("CCX13 tagged dedicated", ccx?.cpuType === "dedicated");

  console.log("DigitalOcean adapter (fixture):");
  const d = await withMockFetch(
    { match: /api\.digitalocean\.com\/v2\/sizes/, body: DO_SIZES },
    () => digitalOceanOffers("fixture-key")
  );
  check("excludes gpu-*/unavailable sizes", d.length === 2, d.map((o) => o.model).join(","));
  const s24 = d.find((o) => o.model === "s-2vcpu-4gb");
  check("s-2vcpu-4gb present with DO monthly", s24?.monthlyPrice === 24.0, `$${s24?.monthlyPrice}/mo`);
  check("s-2vcpu-4gb region global (region-independent pricing)", s24?.region === "global", s24?.region);
  const c4 = d.find((o) => o.model === "c-4");
  check("c-4 cpu-optimized tagged dedicated", c4?.cpuType === "dedicated");
  check("ids do-*", d.every((o) => o.id.startsWith("do-")));

  console.log("GPU-subnet routing refusal (live server, throwaway key):");
  const BASE = process.env.BASE_URL ?? "http://localhost:3000";
  let login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: "admin", code: "BRJ2-W2GT-WJNF-97VC" }),
  });
  if (login.status === 401) {
    const { execSync } = await import("child_process");
    execSync("bun scripts/seed-users.ts", { stdio: "ignore" });
    login = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "admin", code: "BRJ2-W2GT-WJNF-97VC" }),
    });
  }
  const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  const authed = (path: string, init?: RequestInit) =>
    fetch(`${BASE}${path}`, { ...init, headers: { ...(init?.headers ?? {}), cookie } });

  // Insert a throwaway hetzner key so the route passes the key guard (the
  // refusal path fires BEFORE any provider HTTP call).
  const { execSync } = await import("child_process");
  execSync(
    `bun -e "const {PrismaClient}=require('@prisma/client');const {encryptSecret}=require('./src/lib/devops/crypto.ts');const p=new PrismaClient();p.providerKey.upsert({where:{provider:'hetzner'},update:{keyEnc:encryptSecret('throwaway-test-key')},create:{provider:'hetzner',keyEnc:encryptSecret('throwaway-test-key')}}).then(()=>p.\\$disconnect())"`,
    { cwd: process.cwd(), stdio: "ignore" }
  );

  try {
    // SN5 Chutes documents GPU requirements — must refuse with GPU guidance.
    let r = await authed("/api/cpu-provision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "hetzner",
        offerId: "hetzner-cx32",
        netuid: 5,
        walletName: "default",
        hotkeyName: "miner-cpu",
      }),
    });
    const gpuLock = (await r.json()) as { error?: string };
    check(
      "SN5 (GPU subnet) refused with GPU-Catalog guidance",
      r.status === 400 && /documents GPU requirements/i.test(gpuLock.error ?? ""),
      gpuLock.error?.slice(0, 80)
    );

    // RedTeam SN61 is CPU — flow reaches resolveCpuOffer → provider API with a
    // throwaway key → honest 5xx (never a fake success).
    r = await authed("/api/cpu-provision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "hetzner",
        offerId: "hetzner-cx32",
        netuid: 61,
        walletName: "default",
        hotkeyName: "miner-cpu",
      }),
    });
    check(
      "SN61 with throwaway key fails honestly at the provider (no fake rental)",
      r.status >= 400,
      `HTTP ${r.status}`
    );
  } finally {
    // Cleanup — remove the throwaway key row.
    execSync(
      `bun -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.providerKey.deleteMany({where:{provider:'hetzner'}}).then(()=>p.\\$disconnect())"`,
      { cwd: process.cwd(), stdio: "ignore" }
    );
  }

  // Confirm the key row is gone.
  const keys = (await (await authed("/api/providers/keys")).json()) as {
    keys: Array<{ id: string; hasKey: boolean }>;
  };
  check(
    "throwaway key cleaned up",
    keys.keys.find((k) => k.id === "hetzner")?.hasKey === false
  );

  console.log(`\nCPU-CATALOG adapters: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error("test-cpu-adapters crashed:", e);
  process.exit(1);
});
