// Audit: what does the REAL opportunities pipeline produce for SN64 (Chutes)?
import { db } from "../src/lib/db";
import { mergeOpportunities } from "../src/lib/infranex/use-network";

const snap = await (async () => {
  const row = await db.chainSnapshot.findFirst({ orderBy: { id: "desc" } });
  return JSON.parse(row!.subnetsJson);
})();

// mergeOpportunities is the client merge — replicate its live-row shape.
// It takes (snap, profConfig); snap is LiveNetworkSnapshot. Cheapest faithful
// path: reuse the API the browser uses.
