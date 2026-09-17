// Probe: does Inter load and render in Chromium for the guide HTML?
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('requestfailed', r => console.log('REQ FAILED:', r.url().slice(-60), r.failure()?.errorText));
  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE:', m.text().slice(0, 120)); });
  await page.goto('file:///home/z/my-project/download/devops-engine-miner-guide.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const info = await page.evaluate(() => {
    const loaded = [];
    document.fonts.forEach(f => loaded.push(`${f.family} ${f.weight} ${f.status}`));
    const el = document.querySelector('.front-title');
    const cs = el ? getComputedStyle(el).fontFamily : 'NO EL';
    return {
      interCheck: document.fonts.check('900 66px Inter'),
      monoCheck: document.fonts.check('400 12px "JetBrains Mono"'),
      faces: loaded,
      titleFamily: cs,
    };
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();
