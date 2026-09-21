"""Focused login probe — dump form state, submit, capture error/redirect."""
import asyncio
import sys

from playwright.async_api import async_playwright

BASE = "http://127.0.0.1:3000"
CODE = "BRJ2-W2GT-WJNF-97VC"


async def main() -> int:
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
        )
        page = await browser.new_page(viewport={"width": 1366, "height": 900})
        reqs = []
        page.on("response", lambda r: reqs.append((r.status, r.url)) if "/api/" in r.url else None)
        await page.goto(f"{BASE}/login", wait_until="networkidle", timeout=60000)

        inputs = page.locator("input")
        n = await inputs.count()
        for i in range(n):
            ph = await inputs.nth(i).get_attribute("placeholder")
            tp = await inputs.nth(i).get_attribute("type")
            print(f"input[{i}] type={tp} placeholder={ph}")
        await inputs.nth(0).fill("admin")
        await inputs.nth(1).fill(CODE)
        await page.screenshot(path="/tmp/probe-filled.png")
        await page.locator("button[type=submit]").click()
        await page.wait_for_timeout(4000)
        print("url now:", page.url)
        body = await page.inner_text("body")
        print("body snippet:", " | ".join(body.split("\n")[:8]))
        print("api responses:", reqs[-5:])
        await page.screenshot(path="/tmp/probe-after.png")
        await browser.close()
        return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
