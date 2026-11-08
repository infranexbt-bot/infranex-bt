/**
 * SN53 (engy) incentive distribution analysis.
 * Pulls the last-epoch incentive/emission/dividends vectors for netuid 53
 * straight from the Bittensor chain and prints the shape of the reward
 * distribution — who got paid, how unevenly, where the cliff sits.
 * Read-only, no keys needed.
 */
const { ApiPromise, WsProvider } = require("@polkadot/api");

const ENDPOINT = "wss://entrypoint-finney.opentensor.ai:443";
const NETUID = 53;
const RAO = 1e9;

function vec(arr) {
  if (!arr) return [];
  return arr.map((v) => Number(v.toString()));
}

(async () => {
  const api = await ApiPromise.create({
    provider: new WsProvider(ENDPOINT, 20000),
  });
  try {
    const [incRaw, emRaw, divRaw] = await Promise.all([
      api.query.subtensorModule.incentive(NETUID),
      api.query.subtensorModule.emission(NETUID),
      api.query.subtensorModule.dividends(NETUID),
    ]);

    const inc = vec(incRaw); // u16 normalized weights (0-65535)
    const em = vec(emRaw); // rao paid last epoch per uid
    const div = vec(divRaw); // validator dividends

    const incTotal = inc.reduce((a, b) => a + b, 0);
    const emTotalTao = em.reduce((a, b) => a + b, 0) / RAO;
    const paid = inc
      .map((v, uid) => ({
        uid,
        v,
        share: incTotal > 0 ? v / incTotal : 0,
        emTao: (em[uid] || 0) / RAO,
      }))
      .filter((x) => x.v > 0)
      .sort((a, b) => b.v - a.v);

    const top10N = Math.max(1, Math.ceil(inc.length * 0.1));
    const out = {
      uidSlots: inc.length,
      paidCount: paid.length,
      divNonZeroValidators: div.filter((v) => v > 0).length,
      incTotalNorm: incTotal,
      minerLaneTaoLastEpoch: emTotalTao,
      top10: {
        n: top10N,
        potShare: paid.slice(0, top10N).reduce((a, b) => a + b.share, 0),
      },
      top1: paid[0] ? { uid: paid[0].uid, share: paid[0].share, emTao: paid[0].emTao } : null,
      top5PotShare: paid.slice(0, 5).reduce((a, b) => a + b.share, 0),
      curveTop12: paid.slice(0, 12).map((x, i) => ({
        rank: i + 1,
        uid: x.uid,
        potShare: +x.share.toFixed(4),
        incentiveRaw: x.v,
        emTaoLastEpoch: +x.emTao.toFixed(4),
      })),
      cliffZone: paid.slice(20, 34).map((x, i) => ({
        rank: i + 21,
        uid: x.uid,
        potShare: +x.share.toFixed(5),
        incentiveRaw: x.v,
      })),
      dustTail: paid.slice(-5).map((x) => ({
        uid: x.uid,
        potShare: +x.share.toFixed(6),
        incentiveRaw: x.v,
        emTaoLastEpoch: +x.emTao.toFixed(6),
      })),
      unpaidEmTotal: +(emTotalTao - paid.reduce((a, b) => a + b.emTao, 0)).toFixed(4),
    };
    console.log(JSON.stringify(out, null, 1));
  } catch (e) {
    console.error("QUERY_FAIL:", e.message);
  } finally {
    try { await api.disconnect(); } catch {}
    setTimeout(() => process.exit(0), 500);
  }
})();
