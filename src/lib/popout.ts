// POPOUT-1 — "Open in new window" for menu pages.
//
// Every sidebar entry (and the header's pop-out button) can lift its page
// into its own browser window. The mechanics are one URL contract:
//   /?view=<ViewKey>&mode=full
// The app boots straight into that page in STANDALONE mode (see POPOUT-1 in
// src/app/page.tsx): only the page content is displayed — no sidebar, no
// nav menus — exactly what the operator asked for (2026-10-30: "display only
// the opportunity page", not the full menu tree). Session cookies are shared,
// so the popout is fully signed in. The main app keeps using plain
// /?view=<ViewKey> for its own deep links (full shell), so the two contexts
// never collide.
//
// A features string is passed on purpose: with dimensions present, browsers
// open a REAL separate window (not just a background tab), which is what the
// operator asked for — e.g. keeping Opportunities docked on a second monitor
// while the main window stays on Deployments. noopener keeps the new window
// from reaching back into this one (and returns null, so callers must not
// try to hold the reference).

export const POPOUT_FEATURES =
  "width=1440,height=900,menubar=yes,toolbar=yes,location=yes,status=yes,resizable=yes,scrollbars=yes,noopener,noreferrer";

/** Query-param value that marks a window as standalone (page-only). */
export const POPOUT_MODE_PARAM = "full";

export function popoutHref(view: string): string {
  return `/?view=${encodeURIComponent(view)}&mode=${POPOUT_MODE_PARAM}`;
}

export function openViewInNewWindow(view: string): void {
  if (typeof window === "undefined") return;
  window.open(popoutHref(view), "_blank", POPOUT_FEATURES);
}
