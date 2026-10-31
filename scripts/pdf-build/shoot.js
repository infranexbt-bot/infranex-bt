// Diagram screenshot helper — element capture at 2x device scale (300dpi-class PNG for PDF embedding).
// Diagrams are sub-elements embedded via ReportLab Image(); final PDF is still vector (ReportLab).
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const jobs = [
    ['fig1-appflow.html', 'assets/fig1-appflow.png'],
    ['fig2-lifecycle.html', 'assets/fig2-lifecycle.png'],
    ['fig3-backend.html', 'assets/fig3-backend.png'],
    ['fig4-devops-loop.html', 'assets/fig4-devops-loop.png'],
  ];
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 1000, height: 1400 } });
  const page = await ctx.newPage();
  for (const [src, out] of jobs) {
    await page.goto('file://' + path.resolve(__dirname, src));
    await page.waitForTimeout(250);
    const el = await page.$('#canvas');
    await el.screenshot({ path: path.resolve(__dirname, out) });
    const box = await el.boundingBox();
    console.log(`${out}  ${Math.round(box.width)}x${Math.round(box.height)} css px (PNG at 2x)`);
  }
  await browser.close();
})();
