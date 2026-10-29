// POPOUT-1 — "Open in new window" for menu pages.
//
// Every sidebar entry (and the header's pop-out button) can lift its page
// into its own browser window. The mechanics are one URL contract:
//   /?view=<ViewKey>
// The app boots straight into that page (see POPOUT-1 in src/app/page.tsx),
// session cookies are shared, so the popout is fully signed in and carries
// the complete app shell — sidebar, header, footer — at full-page width.
//
// A features string is passed on purpose: with dimensions present, browsers
// open a REAL separate window (not just a background tab), which is what the
// operator asked for — e.g. keeping Opportunities docked on a second monitor
// while the main window stays on Deployments. noopener keeps the new window
// from reaching back into this one (and returns null, so callers must not
// try to hold the reference).

export const POPOUT_FEATURES =
  "width=1440,height=900,menubar=yes,toolbar=yes,location=yes,status=yes,resizable=yes,scrollbars=yes,noopener,noreferrer";

export function popoutHref(view: string): string {
  return `/?view=${encodeURIComponent(view)}`;
}

export function openViewInNewWindow(view: string): void {
  if (typeof window === "undefined") return;
  window.open(popoutHref(view), "_blank", POPOUT_FEATURES);
}
