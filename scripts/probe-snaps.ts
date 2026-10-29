// Shortlist: 4090-runnable subnets where rewards are actually broad (vs IOTA)
const snaps = JSON.parse(await Bun.file("/home/z/my-project/scripts/snaps.json").text());

// Probe structure
const arr = Array.isArray(snaps) ? snaps : (snaps.opportunities ?? snaps.rows ?? snaps.snapshots ?? []);
console.log("top-level:", Array.isArray(snaps) ? `array(${snaps.length})` : Object.keys(snaps).join(","));
console.log("list len:", arr.length);
if (arr.length) console.log("row keys:", Object.keys(arr[0]).join(", "));
