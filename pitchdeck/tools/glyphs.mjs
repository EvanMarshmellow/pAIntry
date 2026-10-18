import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
const p = await b.newPage();
await p.goto('http://127.0.0.1:8080/main.original.html?nogl=1', { waitUntil: 'networkidle0' });
const r = await p.evaluate(async () => {
  await document.fonts.load('600 100px Wordmark'); await document.fonts.load('400 100px Onest'); await document.fonts.load('400 100px NotoJP');
  const c = document.createElement('canvas').getContext('2d');
  const test = (fam, ch) => { c.font = '100px ' + fam + ', monospace'; const a = c.measureText(ch).width; c.font = '100px monospace'; const m = c.measureText(ch).width; c.font = '100px ' + fam + ', serif'; const s = c.measureText(ch).width; return a !== m || a === s ? (c.font='100px '+fam+', serif', Math.abs(c.measureText(ch).width - s) < .01 && a !== m ? 1 : 1) : 0; };
  const has = (fam, ch) => { c.font = '100px ' + fam + ', monospace'; const a = c.measureText(ch).width; c.font = '100px ' + fam + ', serif'; const b2 = c.measureText(ch).width; return a === b2; };
  const out = {};
  for (const [fam, s] of [['Wordmark', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'], ['Onest', 'abcxyzAZ0123$€’“”—éèàçô&?!<>\'']]) out[fam] = [...s].filter(ch => !has(fam, ch)).join('');
  return out;
});
console.log('missing glyphs:', JSON.stringify(r));
await b.close();
