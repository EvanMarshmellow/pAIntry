// contact sheet of the fg plates on a dark ground, for review
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
const p = await b.newPage(); await p.setViewport({ width: 1600, height: 1000 });
const files = fs.readdirSync('kitchen-assets').filter(f => f.startsWith('fg-'));
await p.setContent('<body style="margin:0;background:#2a1d14;display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:8px">' + files.map(f => `<div style="outline:1px solid #555;color:#fff;font:12px sans-serif"><img src="http://127.0.0.1:8080/kitchen-assets/${f}" style="width:100%;display:block">${f}</div>`).join('') + '</body>', { waitUntil: 'networkidle0' });
await p.screenshot({ path: process.argv[2], fullPage: true }); await b.close();
