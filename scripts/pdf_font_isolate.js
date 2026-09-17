// Isolate: does a direct page.pdf() embed Inter, or does Paged.js break it?
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });

  // Test A: raw page, no Paged.js
  let page = await browser.newPage();
  await page.goto('file:///home/z/my-project/download/devops-engine-miner-guide.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: '/home/z/my-project/scripts/testA-raw.pdf', width: '720px', height: '1020px', printBackground: true, margin: {top:0,right:0,bottom:0,left:0} });
  await page.close();

  // Test B: with Paged.js polyfill applied (mimic converter)
  page = await browser.newPage();
  await page.goto('file:///home/z/my-project/download/devops-engine-miner-guide.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const pagedJs = require('fs').readFileSync('/home/z/my-project/skills/pdf/scripts/paged.polyfill.js', 'utf-8');
  await page.addScriptTag({ content: pagedJs });
  await page.waitForFunction(() => window.PagedPolyfill !== undefined || document.querySelector('.pagedjs_pages') !== null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3000);
  const status = await page.evaluate(() => {
    const loaded = [];
    document.fonts.forEach(f => loaded.push(`${f.family} ${f.weight} ${f.status}`));
    return { faces: loaded.slice(0, 10), pagedPages: document.querySelectorAll('.pagedjs_page').length };
  });
  console.log('After Paged.js:', JSON.stringify(status));
  await page.pdf({ path: '/home/z/my-project/scripts/testB-paged.pdf', width: '720px', height: '1020px', printBackground: true, margin: {top:0,right:0,bottom:0,left:0} });
  await browser.close();
  console.log('done');
})();
