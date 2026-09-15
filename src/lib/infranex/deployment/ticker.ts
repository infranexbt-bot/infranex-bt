import { db } from "@/lib/db";
import { tickDeployment } from "./engine";

/**
 * Deployment auto-ticker (DEPLOY-2).
 *
 * The deployment lifecycle (requested → approved → provisioning → … →
 * started) advances one state per tick. Historically ticks came ONLY from
 * the browser (stepper / deployments-view pollers), so a deployment froze
 * mid-pipeline — e.g. stuck at "approved" showing Approve=Running and every
 * later step Pending forever — whenever the dialog closed, the tab went to
 * the background, or the dev server restarted.
 *
 * This pass gives the server the same driver: every active (non-terminal)
 * deployment gets a tick, so the pipeline always keeps moving whether or
 * not any UI is open.
 *
 * Safety notes:
 * - Terminal states (started / stopping / stopped / terminated / failed)
 *   are excluded; tickDeployment itself also no-ops on them.
 * - "stopped" is never auto-restarted (nextLogicalState has no transition
 *   out of stopped) — restarting is an explicit user action.
 * - On-chain registration (burn TAO / get UID) is a separate explicit user
 *   action and is never triggered by ticks.
 * - A provisioning failure (e.g. missing provider API key) moves the
 *   deployment to "failed" with the real error instead of hanging.
 */
const ACTIVE_STATES = ["requested", "approved", "provisioning", "provisioned", "setup", "ready", "deploying"];

export async function runDeploymentTickerPass(): Promise<{ ticked: number; active: number }> {
  const rows = await db.deployment.findMany({
    where: { status: { in: ACTIVE_STATES } },
    select: { id: true },
  });

  let ticked = 0;
  for (const row of rows) {
    try {
      await tickDeployment(row.id);
      ticked++;
    } catch (e) {
      // One broken deployment must never block the others. advanceDeployment
      // already moved genuinely-failed provisions to "failed" before throwing.
      console.warn(
        `[deploy-ticker ${row.id}] tick failed: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  return { ticked, active: rows.length };
}
