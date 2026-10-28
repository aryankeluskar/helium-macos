const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const html = process.argv[2] === '--html';
  for (const job of process.argv.slice(html ? 3 : 2)) {
    const [input, output, size] = job.split(':');
    const [width, height] = size.includes('x') ? size.split('x').map(Number) : [+size, +size];
    await page.setViewportSize({ width, height });
    if (html) {
      await page.goto(`file://${input}`);
      await page.evaluate(() => document.fonts.ready);
    } else {
      const svg = fs.readFileSync(input, 'utf8').replace(/width="\d+" height="\d+"/, `width="${width}" height="${height}"`);
      await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
    }
    await page.screenshot({ path: output, omitBackground: true, clip: { x: 0, y: 0, width, height } });
  }
  await browser.close();
})();
