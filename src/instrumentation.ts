// DEVOPS-1 — start the background workers at server boot.
//
// Previously startWorkers() was lazily triggered by GET /api/network (the
// sidebar footer), so the monitor only ran while a browser was open. The
// DevOps engine must watch miners continuously — instrumentation.register()
// runs once when the Next.js server (nodejs runtime) boots, before traffic.
// startWorkers() itself is idempotent, so dev hot-reloads are safe.

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // BOOT-RESTORE — rebuild seedable catalog tables (overrides / playbook /
    // chain snapshot) from scripts/recycle-baseline.json if a sandbox recycle
    // wiped the DB. Safe no-op when data is present; never throws into boot.
    const { maybeRunBootRestore } = await import("./lib/infranex/boot-restore");
    void maybeRunBootRestore();
    const { startWorkers } = await import("./lib/infranex/workers");
    void startWorkers();
  }
}
