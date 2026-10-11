const r = await Bun.file("/tmp/lium-econ.json").json();
console.log(`as_of=${r.as_of} window=${r.window_days}d provider_share=${r.provider_rental_share}`);
console.log("model | $/gpu-hr | util% | $/GPU-month (rentals+idle+extra)");
const rows: any[] = r.classes.map((c: any) => {
  const totalHours = (c.rented_gpu_hours_30d ?? 0) + (c.idle_gpu_hours_30d ?? 0);
  const totalUsd = (c.rental_price_usd_per_gpu_hour ?? 0) * (c.rented_gpu_hours_30d ?? 0) * r.provider_rental_share + (c.idle_pay_usd_30d ?? 0) + (c.rented_extra_usd_30d ?? 0);
  const perGpuMonth = totalHours > 0 ? (totalUsd / totalHours) * 730 : 0;
  return { m: c.gpu_model, p: c.rental_price_usd_per_gpu_hour, u: c.utilisation, m30: perGpuMonth, rh: c.rented_gpu_hours_30d, ih: c.idle_gpu_hours_30d };
});
rows.sort((a, b) => b.m30 - a.m30);
for (const x of rows) console.log(`${x.m} | $${x.p?.toFixed(2)} | ${(x.u * 100).toFixed(0)}% | $${x.m30.toFixed(0)}`);
const pick = rows.filter(x => /4090|3090$|A100|H100 80GB|H200|5090|L40S|PRO 6000/i.test(x.m));
console.log("\n--- USER PICKS ---");
for (const x of pick) console.log(`${x.m}: $${x.m30.toFixed(0)}/GPU-month  (util ${(x.u*100).toFixed(0)}%, $${x.p?.toFixed(2)}/hr)`);
