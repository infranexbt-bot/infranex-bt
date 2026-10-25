// Verify lium-bootstrap generators: emit scripts for several configs and bash -n them.
import { writeFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import {
  buildHostScript,
  buildWorkstationScript,
  HOST_FILENAME,
  WORKSTATION_FILENAME,
} from "../src/lib/infranex/lium-bootstrap";

const OUT = "/home/z/my-project/scripts/bootstrap-check";
mkdirSync(OUT, { recursive: true });

const cases: { name: string; script: string }[] = [
  {
    name: `host-usdt-default-${HOST_FILENAME}`,
    script: buildHostScript({
      path: "usdt",
      driverInstalled: false,
      hgxBoard: false,
      openUfw: true,
      portalCommand: "",
    }),
  },
  {
    name: `host-alpha-hgx-portal-${HOST_FILENAME}`,
    script: buildHostScript({
      path: "alpha",
      driverInstalled: true,
      hgxBoard: true,
      openUfw: false,
      portalCommand: "curl -fsSL https://lium.io/mine.sh | bash -s -- --register --token ABC'123",
    }),
  },
  {
    name: `ws-protect-${WORKSTATION_FILENAME}`,
    script: buildWorkstationScript({
      walletName: "lium-provider",
      hotkeyName: "gpu-node-1",
      protectColdkey: true,
    }),
  },
  {
    name: `ws-nopass-weirdname-${WORKSTATION_FILENAME}`,
    script: buildWorkstationScript({
      walletName: "my prov;ider!", // sanitizer must strip ; and !
      hotkeyName: "gpu node 1",
      protectColdkey: false,
    }),
  },
];

let failed = 0;
for (const c of cases) {
  const p = `${OUT}/${c.name}`;
  writeFileSync(p, c.script);
  try {
    execSync(`bash -n "${p}"`, { stdio: "pipe" });
    console.log(`OK   ${c.name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${c.name}`);
    console.log(String((e as { stderr: Buffer }).stderr));
  }
}

// sanitizer sanity
const ws = cases[3].script;
if (/;\s*--wallet\.name|!/.test(ws.replace(/\n/g, " "))) {
  console.log("SANITIZER CHECK: suspicious chars leaked into commands — inspect manually");
}

// Confirm the unbraced-variable hazard: no literal "${" should appear in generated bash
for (const c of cases) {
  const bad = c.script.split("\n").filter((l) => l.includes("${"));
  if (bad.length) console.log(`NOTE ${c.name}: ${bad.length} line(s) with \${ :`, bad.slice(0, 3));
}
console.log(failed === 0 ? "ALL SYNTAX OK" : `${failed} FAILURES`);
