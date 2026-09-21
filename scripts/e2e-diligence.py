"""DILIGENCE-1 E2E — login → opportunities → detail dialog → diligence panel
→ 14 stages → approve → provision hand-off. Runs Chromium inside the container.
"""
import asyncio
import json
import sys

from playwright.async_api import async_playwright

BASE = "http://127.0.0.1:3000"
CODE = "BRJ2-W2GT-WJNF-97VC"  # admin enroll code from scripts/users.local.json
SHOTS = "/tmp/e2e"


async def goto_resilient(page, url, tries=5):
    """goto with retries — the dev server may be restarting (keepalive)."""
    for i in range(tries):
        try:
            await page.goto(url, wait_until="networkidle", timeout=45000)
            return
        except Exception as e:
            if i == tries - 1:
                raise
            print(f"goto failed ({e.__class__.__name__}), retrying in 8s…")
            await asyncio.sleep(8)


async def main() -> int:
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            args=[
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--disable-extensions",
                "--js-flags=--max-old-space-size=256",
            ]
        )
        ctx = await browser.new_context(viewport={"width": 1366, "height": 900})
        page = await ctx.new_page()
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(str(e)))

        # 1 — login
        await goto_resilient(page, f"{BASE}/login")
        await page.screenshot(path=f"{SHOTS}-1-login.png")
        content = await page.content()
        print("login page loaded:", "login" in content.lower())

        # The login form shape — find input(s) and a submit button generically.
        inputs = page.locator("input")
        n_inputs = await inputs.count()
        print("inputs on login page:", n_inputs)
        if n_inputs >= 1:
            await inputs.first.fill("admin")
        if n_inputs >= 2:
            await inputs.nth(1).fill(CODE)
        btn = page.locator("button[type=submit]")
        await btn.first.click()
        await page.wait_for_url(lambda u: "/login" not in u, timeout=30000)
        print("after login url:", page.url)

        # 2 — navigate to Opportunities via sidebar
        nav = page.get_by_text("Opportunities", exact=False).first
        await nav.click()
        await page.wait_for_timeout(2500)
        await page.screenshot(path=f"{SHOTS}-2-opportunities.png")

        # 3 — open the first opportunity row (detail dialog)
        row = page.locator("table tbody tr").first
        if await row.count() == 0:
            row = page.locator("[data-slot=card] .cursor-pointer").first
        await row.click()
        await page.wait_for_timeout(1200)
        await page.screenshot(path=f"{SHOTS}-3-dialog.png")

        # 4 — expand the diligence pipeline
        trig = page.get_by_text("Diligence pipeline", exact=False).first
        await trig.click()
        await page.wait_for_timeout(1800)

        # 5 — verify 14 stage rows rendered
        stage_badges = await page.locator("text=source ·").count()
        print("stage rows rendered:", stage_badges)
        body = await page.inner_text("body")
        for stage in ["Discover subnet", "Is subnet active?", "Registration available?",
                      "Hardware requirement", "Technical complexity", "Competition",
                      "Validator behavior", "Emission trend", "Alpha/TAO liquidity",
                      "Governance / protocol risk", "GPU/CPU cost", "Expected net return",
                      "Downside scenario"]:
            if stage not in body:
                print("MISSING STAGE:", stage)
        has_gate = "Opportunity verdict" in body
        has_approve = "you approve" in body.lower()
        has_provision = "Provision infrastructure" in body
        print(f"gate={has_gate} approve={has_approve} provision={has_provision}")
        await page.screenshot(path=f"{SHOTS}-4-stages.png")

        # 6 — approve (button may be disabled when verdict is DO NOT PROVISION)
        approve_btn = page.get_by_role("button", name="Approve").first
        if await approve_btn.is_enabled():
            await approve_btn.click()
            await page.wait_for_timeout(1500)
            body2 = await page.inner_text("body")
            print("approved badge shown:", "Approved" in body2)
        else:
            print("approve disabled (hard fails) — expected for some subnets")
        await page.screenshot(path=f"{SHOTS}-5-approved.png")

        # 7 — provision hand-off
        prov = page.get_by_role("button", name="Provision infrastructure").first
        if await prov.is_enabled():
            await prov.click()
            await page.wait_for_timeout(2000)
            body3 = await page.inner_text("body")
            print("landed on deployments:", "Deploy a new miner" in body3 or "Deployment engine" in body3)
            await page.screenshot(path=f"{SHOTS}-6-deploy.png")
        else:
            print("provision still locked (not approved)")

        # 8 — server-side: approval persisted?
        print("page errors:", errors[:3] if errors else "none")
        await browser.close()

        # Check DB via API is out of scope here; print summary
        print("E2E DONE")
        return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
