#!/usr/bin/env python3
"""One-month rented 4090/5090 mining EV model.
Pulls live consumer-bucket yields from the Infranex GPU Landscape API snapshot
(cached at /tmp/gpu-landscape.json, block 9225329, TAO $302.21) and builds
per-candidate month economics.

Usage: python3 scripts/gpu-rental-ev.py
"""
import json

SNAP = "/tmp/gpu-landscape.json"
TAO_USD = 302.21

# Rental market (Oct 2026 search: Vast/Lium/RunPod/Nova medians)
RENT = {  # $/hr planning numbers: (budget, plan, high)
    "4090": (0.20, 0.25, 0.40),
    "5090": (0.35, 0.45, 0.69),
}
HOURS = 720  # 30 days
RECYCLE_TAO = 0.5  # one-time hotkey registration, typical dynamic band 0.1-2 TAO

# Candidate -> (recommended card, rewarded, registered, miner emission TAO/d,
#               entry realism, notes)
# entry realism: probability-weighted discount an honest NEW miner should apply
# to the paper per-earner number.  Marketplace/broad-reward designs get high
# factors; top-2-of-256 competitive designs get ~zero for a newcomer.
CANDIDATES = [
    ("51",  "lium.io",    "5090", 72, 256, 277.84, 0.20, "marketplace: paid per job-day; paper assumes 100% utilization"),
    ("96",  "Verathos",   "4090", 72, 256, 18.66, 0.50, "broad reward spread, 4090 named natively"),
    ("81",  "Reliquary",  "4090", 56, 256, 18.98, 0.40, ">=24 GB floor, consumer ok"),
    ("123", "MANTIS",     "4090", 248, 256, 11.00, 0.80, "near-universal rewards but thin per earner"),
    ("32",  "ItsAI",      "4090", 239, 256, 7.80, 0.80, "near-universal rewards, paper below rental"),
    ("74",  "Gittensor",  "5090", 21, 256, 9.25, 0.15, "pays merged code, dev skill not GPU hours"),
    ("91",  "cascade",    "4090", 5, 256, 13.56, 0.10, "validator pins one GPU model per round"),
    ("53",  "engy",       "4090x2", 14, 256, 106.04, 0.15, "consumer path needs 2x 4090/5090"),
    ("9",   "iota",       "4090", 2, 256, 73.23, 0.02, "only 2 rewarded slots - lottery for newcomer"),
    ("10",  "Pareton",    "5090", 1, 256, 23.26, 0.02, "single rewarded slot"),
]


def main():
    data = json.load(open(SNAP))
    live_meta = data["meta"]
    print(f"Snapshot block {live_meta['blockNumber']}  TAO ${TAO_USD}  "
          f"subnets {live_meta['totalSubnets']}")
    print(f"Recycle (one-time): ~{RECYCLE_TAO} TAO = ${RECYCLE_TAO*TAO_USD:.0f}\n")

    hdr = (f"{'SN':>4} {'name':<11} {'card':<7} | {'rent $/mo':>9} "
           f"{'paper $/d':>10} {'real $/d':>9} {'net $/mo':>9}  verdict")
    print(hdr)
    print("-" * len(hdr))

    for netuid, name, card, rew, reg, emiss, realism, note in CANDIDATES:
        if card == "4090x2":  # engy dual-card path
            rent_hr = RENT["4090"][1] * 2
            card_label = "2x4090"
        else:
            rent_hr = RENT[card][1]
            card_label = card
        rent_mo = rent_hr * HOURS
        rent_d = rent_mo / 30
        paper_d = emiss / rew * TAO_USD
        real_d = paper_d * realism
        net_mo = (real_d - rent_d) * 30 - RECYCLE_TAO * TAO_USD
        if realism < 0.10:
            verdict = "LOTTERY (entry odds ~0 for newcomer)"
        elif net_mo > rent_mo * 0.5:
            verdict = "STRONG"
        elif net_mo > 0:
            verdict = "positive"
        elif net_mo > -rent_mo * 0.5:
            verdict = "marginal"
        else:
            verdict = "NEGATIVE"
        print(f"{netuid:>4} {name:<11} {card_label:<7} | {rent_mo:>9.0f} "
              f"{paper_d:>10.2f} {real_d:>9.2f} {net_mo:>+9.0f}  {verdict}"
              f"   [{note}]")

    rent_5090_d = RENT["5090"][1] * 24
    print("\nBreak-even for SN51: paper $%.0f/d per rewarded supplier; a 5090 at $%.2f/hr = $%.2f/d "
          "is covered at %.1f%% utilization"
          % (277.84 / 72 * TAO_USD, RENT["5090"][1], rent_5090_d,
             100 * rent_5090_d / (277.84 / 72 * TAO_USD)))


if __name__ == "__main__":
    main()
