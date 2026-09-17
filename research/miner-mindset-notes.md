# Miner Mindset Research Notes (for scoring v2 implementation)

## Sources
- bittensor.com/docs/guides/mining — official: scope subnet, burn price, UID slots (256 default, trim to 64), eviction by emission-based pruning score, immunity period (default 4096 blocks ≈ 13.7h, subnets set higher), bond EMA (alpha=0.1), "choosing where to start matters more than registration price"
- bittensor.com/docs/concepts/emissions — per-tempo split: 18% owner / 41% miners / 41% validators+stakers; bonds EMA B(t)=0.1·ΔB+0.9·B(t-1); consensus = stake-weighted median (kappa 0.5); incentive = normalized clipped rank
- docs.taostats.io/docs/taostats-for-miners — miners receive 41%; high-emission = more competitive; emission DISTRIBUTION spread is the risk signal (wide = safe middle, narrow 0.004 range = knife fight); registrations/24h on full subnet = churn/dereg count; registration cost = competition signal; check metagraph trust/incentive/emission
- misar.blog subnet mining 2026 — "continuous performance tournament, not a lottery"; below-threshold earns ZERO; top 10-20% miners take 60-80% of emissions; median near breakeven; 1-3 month unprofitable tuning; subnet selection is half the job — "mediocre miner on rising subnet out-earns excellent miner on dying one"; due diligence: emissions share, alpha price trend, validator activity, owner engagement (GitHub/Discord); hardware by subnet type table (frontier text-gen A100/H100, small-model 4090/5090 24-32GB, image 4090, scraping CPU VPS, storage NVMe, logic VPS); costs: reg burn 0.1-3+ TAO dynamic, H100 $2-3.5/hr, A100 $1.2-1.9/hr, 5090 $0.4-0.8/hr, 5090 power ~$60/mo; rent don't buy; VRAM = binding constraint (70B FP8 ≈ 80GB); latency counts (colo beats faster home GPU); register during low-fee window (cost swings 3-5x/week); diversify 2-3 subnets; convert alpha on schedule
- oakresearch.io — evaluation framework: team, value prop, market, narrative/mindshare, real traction (users, revenue), validator attention, emission ranking
- subnetalpha.ai / SubnetRadar / taostats — dashboards miners use: alpha price, market cap, liquidity, health, emissions rank

## The miner decision funnel (5 questions, in order)
1. FIT — can my hardware run this? (subnet type → GPU tier; min_compute.yml; VRAM binding; latency)
2. TOP LINE — what does it pay? (subnet alpha emission/day × 41% miner share ÷ EARNING miners; alpha price in TAO (taoIn/alphaIn); × TAO price → USD)
3. BOTTOM LINE — what do I keep? (minus GPU rental/power, reg burn, infra; NET monthly USD; break-even; realistic = median miner, not top)
4. SEAT SAFETY — can I keep the slot? (saturation, churn regs/24h, emission spread inequality, immunity runway, bond EMA ramp penalty ≈ weeks)
5. HOLD VALUE — will revenue persist? (alpha price 24h trend, pool liquidity/TAO depth, sell-pressure slippage ≈ dailyEarn/alphaOut, owner activity, subnet maturity, emission stability)

## Key formulas
- alphaPriceTao = taoIn / alphaIn (pool ratio); USD = × TAO spot
- perEarningMinerDailyTao = emissionTaoPerDay × 0.41 / max(rewardedMiners, 1)  [rewarded = incentive>0]
  (note: current code computes miner share via minerAlphaRao ratio — keep as refinement; 41% is the canonical constant)
- netMonthlyUsd = monthlyGrossUsd − gpuCostMonthlyUsd(gpuTier) − infraCost
- breakEvenDays = (burnCostUsd + firstMonthCost) / (netDailyUsd)
- slippageImpact ≈ dailyAlphaEarned / alphaOutPool  (price impact of dumping daily earnings)
- inequality = top10%UIDs' share of total incentive (needs Incentives storage vec per subnet)
- seatRisk = saturation × churn × inequality composite; rampPenalty weeks ≈ from bond EMA alpha=0.1 → ~90% bonds in ≈ 22 epochs ≈ 1.1 days per validator cycle... practical: 1-3 months tuning (misar)

## Data: have vs need
HAVE (chain.ts already): minersCount, validatorsCount, subnetTao(taoIn), alphaIn, alphaOut, emission, emissionEnabled, tempo, movingPrice, rewardedMiners, maxUids, owner, registeredAt(subnet creation), identity github/desc, TAO price
NEED TO ADD:
- Incentives storage vec per subnet (batched, all 129) → inequality, rewarded count accuracy
- Burn cost per subnet (SubnetModule.Burn storage) → reg cost, demand signal
- ImmunityPeriod (per-subnet hyperparam, fallback global 4096)
- Alpha price ring buffer (server-side, 5-min samples, ~24h) → 24h trend per subnet
- Subnet category → GPU tier map (curated from identity/description keywords + known subnet list)

## Scoring v2 (miner-first 5-pillar)
1. Net ROI (0.30): netMonthlyUsd → log curve; negative → score floor
2. Seat Safety (0.20): room on subnet, churn, inequality, immunity
3. Alpha Economics (0.20): price trend 24h, liquidity depth, slippage impact, volatility
4. Earning Reality (0.15): rewarded/registered ratio, ramp penalty, top-heaviness adjustment to per-miner estimate
5. Fit & Feasibility (0.15): GPU tier match to subnet type, owner activity, maturity, emissionEnabled

UI fields per subnet: Net Monthly (after GPU cost), Est. APY on capital, GPU Req (from subnet type), Alpha price + 24h trend, Liquidity, Churn, Top-10% emission share, Reg burn cost, Seat risk badge.
