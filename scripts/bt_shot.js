// Screenshot a diagram HTML to PNG at 2x device scale (300dpi-equivalent).
// PNG sub-element pipeline per SKILL.md "Diagram Generation Strategy" — NOT a page.pdf pipeline.
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const [,, htmlPath, outPath, w, h] = process.argv;
  const width = parseInt(w || '900', 10);
  const height = parseInt(h || '330', 10);
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 2,
  });
  await page.goto('file://' + path.resolve(htmlPath), { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const el = await page.$('.canvas');
  if (el) {
    await el.screenshot({ path: outPath });
  } else {
    await page.screenshot({ path: outPath, fullPage: false });
  }
  await browser.close();
  console.log('saved', outPath);
})();
