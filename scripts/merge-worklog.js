// Merge the surviving /tmp worklog (pre-wipe history) with the fresh
// RECOVERY-1 entry into the restored /home/z/my-project/worklog.md.
import fs from "node:fs";

const OLD = "/tmp/my-project/worklog.md";
const NEW = "/home/z/my-project/worklog.md";

const oldRaw = fs.readFileSync(OLD, "utf8");
const newRaw = fs.readFileSync(NEW, "utf8");

// Split the fresh file: header line + the RECOVERY-1 entry.
const marker = "\n---\n";
const idx = newRaw.indexOf(marker);
const recoveryEntry = newRaw.slice(idx); // "\n---\nTask ID: RECOVERY-1 ..."

const merged =
  oldRaw.trimEnd() +
  "\n\n" +
  "> === CONTAINER WIPE " + new Date().toISOString() + " — worklog reconstructed from /tmp snapshot; everything below is the fresh environment ===\n" +
  recoveryEntry;

fs.writeFileSync(NEW, merged, "utf8");
console.log(
  "worklog merged:",
  oldRaw.length,
  "chars of history +",
  recoveryEntry.length,
  "chars recovery entry =",
  merged.length,
  "chars total"
);
