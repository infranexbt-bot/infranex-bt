// Hex-only verification: no decoded text goes to stdout (transport strips SGR tokens).
import { writeFileSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { buildWorkstationScript } from "../src/lib/infranex/lium-bootstrap";

// 1. Hex of the TS source line containing BOLD.
const src = readFileSync("src/lib/infranex/lium-bootstrap.ts", "utf8");
const srcLine = src.split("\n").find((l) => l.includes("'BOLD=") && l.includes("GREEN="));
console.log("SRC_LINE_LEN:", srcLine?.length);
console.log("SRC_LINE_HEX:", Buffer.from(srcLine ?? "", "utf8").toString("hex").slice(0, 160));

// 2. Generate a script and hex its BOLD line.
const script = buildWorkstationScript({
  walletName: "lium-provider",
  hotkeyName: "gpu-node-1",
  protectColdkey: true,
});
const genLine = script.split("\n").find((l) => l.startsWith("BOLD="));
console.log("GEN_LINE_LEN:", genLine?.length);
console.log("GEN_LINE_HEX:", Buffer.from(genLine ?? "", "utf8").toString("hex").slice(0, 200));

// 3. bash -n it fresh (no stale files involved).
const tmp = "/home/z/my-project/scripts/bootstrap-check/fresh-check.sh";
writeFileSync(tmp, script);
try {
  execSync(`bash -n ${tmp}`, { stdio: "pipe" });
  console.log("BASH_N: OK");
} catch (e) {
  console.log("BASH_N: FAIL");
  console.log(String((e as { stderr: Buffer }).stderr));
}
