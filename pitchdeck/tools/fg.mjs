// Render tools/fg.js plates into kitchen-assets/fg-*.webp, and the kitchen
// backgrounds into kitchen-assets/scene-*.webp sized for the cards and hero window.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
const p = await b.newPage();
await p.goto('http://127.0.0.1:8080/Skill.md', { waitUntil: 'load' });
await p.addScriptTag({ path: 'tools/fg.js' });
const plates = await p.evaluate(() => window.buildPlates());
for (const [k, v] of Object.entries(plates)) fs.writeFileSync(`kitchen-assets/fg-${k}.webp`, Buffer.from(v.split(',')[1], 'base64'));

const scenes = { 'scene-pantry': ['kitchen-3.jpg', 1400], 'scene-market': ['kitchen-1.jpg', 1400], 'scene-table': ['kitchen-2.webp', 1400], 'scene-preview': ['kitchen-4.jpeg', 740] };
for (const [k, [src, w]] of Object.entries(scenes)) {
  const url = await p.evaluate(async (src, w) => {
    const i = new Image(); i.src = '/kitchen/' + src; await i.decode();
    const s = Math.min(1, w / i.naturalWidth), c = document.createElement('canvas');
    c.width = Math.round(i.naturalWidth * s); c.height = Math.round(i.naturalHeight * s);
    c.getContext('2d').drawImage(i, 0, 0, c.width, c.height);
    return c.toDataURL('image/webp', .86);
  }, src, w);
  fs.writeFileSync(`kitchen-assets/${k}.webp`, Buffer.from(url.split(',')[1], 'base64'));
}
console.log(Object.keys(plates).length, 'plates +', Object.keys(scenes).length, 'scenes');
await b.close();
