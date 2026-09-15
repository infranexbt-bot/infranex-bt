/**
 * Cross-view hand-off for the inline deploy stepper.
 *
 * Other views navigate to Deployments and preselect a subnet/offer:
 *   - Opportunity "Start mining"  → preselects the subnet
 *   - GPU catalog "Provision"     → preselects the offer
 *
 * A module singleton with take-once semantics keeps that hand-off
 * effect-free and stale-proof: the stepper consumes it exactly once on
 * mount, so navigating away and back never re-applies an old pick.
 */
export interface DeployPreselect {
  netuid?: number | null;
  offerId?: string | null;
}

let pending: DeployPreselect | null = null;

export function setDeployPreselect(p: DeployPreselect) {
  pending = p;
}

export function takeDeployPreselect(): DeployPreselect | null {
  const p = pending;
  pending = null;
  return p;
}
