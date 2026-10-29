// Extract IOTA row + network-wide rewarded-ratio picture from /api/network
const net = JSON.parse(await Bun.file("/home/z/my-project/scripts/network.json").text());

// Structure probe
const keys = Object.keys(net);
console.log("top-level keys:", keys.slice(0, 10).join(", "));
const list = Array.isArray(net) ? net : (net.opportunities ?? net.rows ?? net.subnets ?? []);
console.log("list length:", list.length);
if (list.length) console.log("row keys:", Object.keys(list[0]).join(", "));
