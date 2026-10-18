// rasterize ingredient/* to kitchen-assets/ing-<name>.png (alpha, 512px max side)
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
const p = await b.newPage();
await p.goto('http://127.0.0.1:8080/kitchen-assets/', { waitUntil: 'load' }).catch(() => {});
for (const f of fs.readdirSync('ingredient')) {
  const name = f.replace(/\.[a-z]+$/, '');
  const url = await p.evaluate(async src => {
    const img = new Image(); img.src = src; await img.decode();
    const w0 = img.naturalWidth || 800, h0 = img.naturalHeight || 800, s = 512 / Math.max(w0, h0);
    let c = document.createElement('canvas'); c.width = Math.round(w0 * s); c.height = Math.round(h0 * s);
    const x = c.getContext('2d'); x.drawImage(img, 0, 0, c.width, c.height);
    // trim transparent margins
    const d = x.getImageData(0, 0, c.width, c.height).data; let l = c.width, t = c.height, r = 0, bt = 0;
    for (let yy = 0; yy < c.height; yy++) for (let xx = 0; xx < c.width; xx++) if (d[(yy * c.width + xx) * 4 + 3] > 8) { l = Math.min(l, xx); r = Math.max(r, xx); t = Math.min(t, yy); bt = Math.max(bt, yy); }
    const o = document.createElement('canvas'); o.width = r - l + 1; o.height = bt - t + 1;
    o.getContext('2d').drawImage(c, l, t, o.width, o.height, 0, 0, o.width, o.height);
    return o.toDataURL('image/png');
  }, 'http://127.0.0.1:8080/ingredient/' + f);
  fs.writeFileSync(`kitchen-assets/ing-${name}.png`, Buffer.from(url.split(',')[1], 'base64'));
  console.log('ok', name);
}
await b.close();
