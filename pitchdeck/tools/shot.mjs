// usage: node tools/shot.mjs <page> <outPrefix> [shots e.g. 0,1,2] [w] [h]
import puppeteer from 'puppeteer-core';
const [page = 'main.html', out = 'shot', list = '0', w = '1440', h = '900'] = process.argv.slice(2);
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']
});
const p = await browser.newPage();
await p.setViewport({ width: +w, height: +h });
const logs = [];
p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
p.on('pageerror', e => logs.push('pageerror: ' + e.message));
for (const s of list.split(',')) {
  await p.goto(`http://127.0.0.1:8080/${page}?shot=${s}&adapt=0`, { waitUntil: 'networkidle0', timeout: 60000 });
  await p.waitForFunction(() => window.__kage && (window.__kage.RIG || window.__kage.fallback), { timeout: 60000 });
  await new Promise(r => setTimeout(r, 2500));
  await p.screenshot({ path: `${out}-${s}.png` });
}
console.log(logs.slice(0, 20).join('\n') || 'no console errors');
await browser.close();
