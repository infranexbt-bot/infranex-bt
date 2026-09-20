"""Render cpu-miner-setup-guide.html to a fresh PDF (new filename) via Playwright."""
import asyncio
from playwright.async_api import async_playwright

SRC = "/home/z/my-project/download/cpu-miner-setup-guide.html"
OUT = "/home/z/my-project/download/cpu-miner-setup-guide-v2.pdf"


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=["--no-sandbox", "--force-color-profile=srgb"])
        page = await browser.new_page(viewport={"width": 720, "height": 1020})
        await page.goto(f"file://{SRC}", wait_until="networkidle")
        # Ensure web fonts are fully loaded before printing
        try:
            await page.evaluate("document.fonts.ready.then(() => true)")
            await page.wait_for_timeout(800)
        except Exception:
            pass
        await page.emulate_media(media="print")
        await page.pdf(
            path=OUT,
            width="720px",
            height="1020px",
            print_background=True,
            prefer_css_page_size=True,
            margin={"top": "0", "bottom": "0", "left": "0", "right": "0"},
        )
        await browser.close()
    print("written:", OUT)


asyncio.run(main())
