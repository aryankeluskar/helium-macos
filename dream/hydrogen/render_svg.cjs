const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const job of process.argv.slice(2)) {
    const [input, output, size] = job.split(':');
    const svg = fs.readFileSync(input, 'utf8').replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}"`);
    await page.setViewportSize({ width: +size, height: +size });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
    await page.screenshot({ path: output, omitBackground: true, clip: { x: 0, y: 0, width: +size, height: +size } });
  }
  await browser.close();
})();
