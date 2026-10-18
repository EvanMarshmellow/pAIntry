/* Foreground cut-out compositions for the kitchen theme.
   Runs in the browser (tools/fg.mjs drives it). Every plate is drawn flush to
   its bottom edge, the same contract the original foreground PNGs kept, so the
   page's bottom-anchored placement rules still hold. */
window.buildPlates = async function () {
  const load = n => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = '/kitchen-assets/ing-' + n + '.png'; });
  const ING = { tomato: await load('tomato'), carrot: await load('carrot'), broccoli: await load('broccoli'), chicken: await load('chicken-leg') };

  function rng(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }

  /* one ingredient: size is the longest side, a soft contact shadow under it */
  function ing(x, name, cx, cy, size, rot, flip, shade) {
    const img = ING[name], s = size / Math.max(img.width, img.height);
    const w = img.width * s, h = img.height * s;
    x.save(); x.translate(cx, cy); x.rotate(rot || 0); if (flip) x.scale(-1, 1);
    let src = img;
    if (shade) {                                           /* shade on a scratch canvas, so it only darkens this item */
      const [t, tx] = canvas(img.width, img.height);
      tx.drawImage(img, 0, 0); tx.globalCompositeOperation = 'source-atop';
      tx.fillStyle = 'rgba(40,18,8,' + shade + ')'; tx.fillRect(0, 0, img.width, img.height);
      src = t;
    }
    x.shadowColor = 'rgba(30,14,6,.38)'; x.shadowBlur = size * .08; x.shadowOffsetY = size * .035;
    x.drawImage(src, -w / 2, -h / 2, w, h);
    x.restore();
  }
  /* a heap: items laid back-to-front, larger and brighter toward the front */
  function pile(x, W, H, opt) {
    const r = rng(opt.seed), items = [];
    for (let i = 0; i < opt.n; i++) {
      const t = r();
      const px = opt.x0 + (opt.x1 - opt.x0) * t;
      const crest = opt.crest(t);                       /* 0..1 height of the heap here */
      const dep = Math.pow(r(), .55);
      const py = H - crest * H * (1 - dep) * opt.h + H * .02;
      items.push({ px: px * W, py, dep, name: opt.names[(r() * opt.names.length) | 0], rot: (r() - .5) * 1.6, flip: r() > .5, sz: opt.size * (.75 + r() * .5) });
    }
    items.sort((a, b) => a.py - b.py);
    items.forEach(it => ing(x, it.name, it.px, it.py, it.sz * W, it.rot, it.flip, (1 - it.dep) * .28));
  }
  const hump = (c, w) => t => Math.exp(-Math.pow((t - c) / w, 2));

  /* --- flat props in the same vector style as the icons --------------------- */
  function board(x, cx, by, w, h) {                         /* butcher block on its edge, seen from the front */
    x.save();
    x.fillStyle = '#8a4f27'; roundRect(x, cx - w / 2, by - h, w, h, h * .12); x.fill();
    x.fillStyle = '#b06a35'; roundRect(x, cx - w / 2, by - h, w, h * .78, h * .12); x.fill();
    x.strokeStyle = 'rgba(90,44,18,.45)'; x.lineWidth = h * .025;
    for (let i = 1; i < 7; i++) { x.beginPath(); x.moveTo(cx - w / 2 + w * i / 7, by - h + h * .06); x.lineTo(cx - w / 2 + w * i / 7, by - h * .26); x.stroke(); }
    x.fillStyle = 'rgba(255,214,160,.22)'; roundRect(x, cx - w / 2, by - h, w, h * .12, h * .1); x.fill();
    x.restore();
  }
  function crate(x, cx, by, w, h) {
    x.save();
    x.fillStyle = '#7a4522'; x.fillRect(cx - w / 2, by - h, w, h);
    const slats = 3;
    for (let i = 0; i < slats; i++) {
      const y = by - h + i * (h / slats) + h * .04;
      x.fillStyle = i % 2 ? '#b8743c' : '#c98545'; x.fillRect(cx - w / 2 + w * .03, y, w * .94, h / slats - h * .08);
    }
    x.fillStyle = '#6a3a1c'; x.fillRect(cx - w / 2, by - h, w * .07, h); x.fillRect(cx + w / 2 - w * .07, by - h, w * .07, h);
    x.restore();
  }
  function basket(x, cx, by, w, h) {
    x.save();
    x.beginPath(); x.moveTo(cx - w / 2, by - h); x.lineTo(cx + w / 2, by - h);
    x.lineTo(cx + w * .40, by); x.lineTo(cx - w * .40, by); x.closePath();
    x.fillStyle = '#b77a3c'; x.fill(); x.clip();
    x.strokeStyle = '#8f5a29'; x.lineWidth = h * .05;
    for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo(cx - w / 2, by - h + i * h / 5.5); x.lineTo(cx + w / 2, by - h + i * h / 5.5); x.stroke(); }
    x.lineWidth = h * .035;
    for (let i = -8; i <= 8; i++) { x.beginPath(); x.moveTo(cx + i * w / 15, by - h); x.lineTo(cx + i * w / 19, by); x.stroke(); }
    x.restore();
    x.fillStyle = '#9c6431'; roundRect(x, cx - w * .52, by - h - h * .1, w * 1.04, h * .16, h * .08); x.fill();
  }
  function jar(x, cx, by, w, h, glow) {
    x.save();
    if (glow) {                                             /* the one lit object: candle light inside the glass */
      const g = x.createRadialGradient(cx, by - h * .45, 0, cx, by - h * .45, w * 1.1);
      g.addColorStop(0, 'rgba(255,196,110,.55)'); g.addColorStop(.5, 'rgba(255,150,60,.16)'); g.addColorStop(1, 'rgba(255,140,60,0)');
      x.fillStyle = g; x.fillRect(cx - w * 1.2, by - h * 1.3, w * 2.4, h * 1.3);
    }
    x.fillStyle = 'rgba(176,204,196,.62)'; roundRect(x, cx - w / 2, by - h * .86, w, h * .86, w * .16); x.fill();
    x.fillStyle = '#c9a24a'; roundRect(x, cx - w * .42, by - h, w * .84, h * .13, w * .05); x.fill();
    x.fillStyle = '#a8842f'; x.fillRect(cx - w * .42, by - h * .9, w * .84, h * .03);
    x.fillStyle = 'rgba(255,255,255,.35)'; roundRect(x, cx - w * .36, by - h * .76, w * .08, h * .58, w * .04); x.fill();
    x.restore();
  }
  function pot(x, cx, by, w, h) {
    x.save();
    x.fillStyle = '#5b2f1c'; roundRect(x, cx - w * .62, by - h * .92, w * .2, h * .12, h * .05); x.fill();
    roundRect(x, cx + w * .42, by - h * .92, w * .2, h * .12, h * .05); x.fill();
    const g = x.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
    g.addColorStop(0, '#9c3d1c'); g.addColorStop(.35, '#d8682e'); g.addColorStop(1, '#8a3216');
    x.fillStyle = g; roundRect(x, cx - w / 2, by - h, w, h, w * .08); x.fill();
    x.fillStyle = '#6e2a12'; x.fillRect(cx - w / 2, by - h, w, h * .1);
    x.fillStyle = 'rgba(255,220,180,.25)'; x.fillRect(cx - w * .32, by - h * .82, w * .06, h * .66);
    x.restore();
  }
  function roundRect(x, X, Y, W, H, R) { x.beginPath(); x.moveTo(X + R, Y); x.arcTo(X + W, Y, X + W, Y + H, R); x.arcTo(X + W, Y + H, X, Y + H, R); x.arcTo(X, Y + H, X, Y, R); x.arcTo(X, Y, X + W, Y, R); x.closePath(); }

  const ALL = ['tomato', 'carrot', 'broccoli', 'chicken'];
  const VEG = ['tomato', 'carrot', 'broccoli'];
  const out = {};
  const plate = (name, W, H, draw) => { const [c, x] = canvas(W, H); draw(x, W, H); out[name] = c.toDataURL('image/webp', .9); };

  /* I · counter board (was the temple wall): board along the lower left, produce on it */
  plate('counter', 1536, 884, (x, W, H) => {
    board(x, W * .46, H, W * .9, H * .34);
    pile(x, W, H * .7, { seed: 11, n: 22, x0: .06, x1: .86, crest: hump(.4, .5), h: .9, size: .14, names: ALL });
  });
  /* I · tall crate of carrots and broccoli (was the pine) */
  plate('crate', 1024, 1438, (x, W, H) => {
    const ch = H * .30;
    for (let i = 0; i < 7; i++) {                          /* carrots fanned up out of the crate, tips down */
      const a = -.62 + i * .21;
      ing(x, 'carrot', W * .5 + Math.sin(a) * W * .26, H - ch - H * .13 - Math.cos(a) * H * .07, W * .34, a + 2.45, false, .1);
    }
    ing(x, 'broccoli', W * .32, H - ch - H * .1, W * .36, -.3, false, .08);
    ing(x, 'broccoli', W * .68, H - ch - H * .12, W * .34, .35, true, .08);
    ing(x, 'broccoli', W * .5, H - ch - H * .2, W * .42, .05, false, 0);
    crate(x, W * .5, H, W * .9, ch);
  });
  /* the long low bank of produce (was the tall grass) */
  plate('produce-bank', 1717, 916, (x, W, H) => {
    pile(x, W, H, { seed: 21, n: 60, x0: -.02, x1: 1.02, crest: t => .55 + .45 * hump(.35, .3)(t) + .3 * hump(.8, .2)(t), h: .62, size: .11, names: VEG });
  });
  /* II · a diagonal spray of carrots and broccoli out of the lower-left corner (was the sakura branch) */
  plate('spray-left', 1536, 1024, (x, W, H) => {
    const r = rng(31);
    for (let i = 0; i < 16; i++) {
      const t = i / 15, px = W * (.04 + t * .78) + (r() - .5) * 60, py = H * (.96 - t * .74) + (r() - .5) * 70;
      ing(x, i % 3 ? 'carrot' : 'broccoli', px, py, W * (.2 - t * .07) * (.85 + r() * .3), -.6 + t * .4 + (r() - .5) * .8, r() > .5, (1 - t) * .1);
    }
  });
  /* II · tomatoes out of the lower-right corner (was the maple) */
  plate('spray-right', 1536, 1024, (x, W, H) => {
    const r = rng(41);
    for (let k = 0; k < 6; k++) {                          /* trusses: tight clusters, thinning toward the tip */
      const t = k / 5, cx = W * (.94 - t * .72), cy = H * (.9 - t * .66), n = 6 - k * .7;
      for (let i = 0; i < n; i++) {
        const a = r() * 6.28, d = r() * W * (.07 - t * .03);
        ing(x, 'tomato', cx + Math.cos(a) * d, cy + Math.sin(a) * d * .8, W * (.15 - t * .06) * (.8 + r() * .35), (r() - .5) * .9, r() > .5, (1 - t) * .12);
      }
    }
  });
  /* II · the lit jar (was the stone lantern) */
  plate('jar-lamp', 1024, 1499, (x, W, H) => {
    const jw = W * .62, jh = H * .62;
    jar(x, W * .5, H, jw, jh, true);
    x.save(); roundRect(x, W * .5 - jw / 2, H - jh * .86, jw, jh * .86, jw * .16); x.clip();
    pile(x, W, H, { seed: 51, n: 20, x0: .22, x1: .78, crest: () => .72, h: .52, size: .3, names: ['tomato', 'carrot'] });
    x.restore();
    x.fillStyle = 'rgba(214,236,232,.16)'; roundRect(x, W * .5 - jw / 2, H - jh * .86, jw, jh * .86, jw * .16); x.fill();
  });
  /* II · basket of vegetables (was the garden bush) */
  plate('basket', 1717, 876, (x, W, H) => {
    pile(x, W, H * .62, { seed: 61, n: 26, x0: .2, x1: .8, crest: hump(.5, .32), h: .9, size: .13, names: VEG });
    basket(x, W * .5, H, W * .64, H * .45);
  });
  /* III · heap of tomatoes (was the basalt stones) */
  plate('tomato-heap', 1536, 996, (x, W, H) => {
    pile(x, W, H, { seed: 71, n: 52, x0: .06, x1: .94, crest: hump(.5, .42), h: .78, size: .16, names: ['tomato'] });
  });
  /* IV · the long shelf horizon (was the hill) */
  plate('shelf', 1774, 887, (x, W, H) => {
    x.fillStyle = '#7a4522'; x.fillRect(0, H * .82, W, H * .18);
    x.fillStyle = '#a8642f'; x.fillRect(0, H * .80, W, H * .05);
    const r = rng(81);
    for (let i = 0; i < 14; i++) {
      const cx = W * (.04 + i * .07), jh = H * (.20 + r() * .14), jw = jh * (.6 + r() * .25);
      jar(x, cx, H * .80, jw, jh, false);
      x.save(); roundRect(x, cx - jw / 2, H * .80 - jh * .86, jw, jh * .86, jw * .16); x.clip();
      pile(x, W, H * .80, { seed: 90 + i, n: 9, x0: (cx - jw / 2) / W, x1: (cx + jw / 2) / W, crest: () => .6, h: .5, size: .03, names: [ALL[i % 4]] });
      x.fillStyle = 'rgba(214,236,232,.14)'; roundRect(x, cx - jw / 2, H * .80 - jh * .86, jw, jh * .86, jw * .16); x.fill();
      x.restore();
    }
  });
  /* IV · stock pot with drumsticks and carrots (was the shrine ruins) */
  plate('stockpot', 1536, 1001, (x, W, H) => {
    for (let i = 0; i < 6; i++) ing(x, i % 2 ? 'carrot' : 'chicken', W * (.34 + i * .064), H * (.30 - (i % 2) * .07), W * .24, -.7 + i * .28, i % 2, 0);
    pot(x, W * .5, H, W * .56, H * .62);
    pile(x, W, H, { seed: 101, n: 8, x0: .12, x1: .3, crest: () => .5, h: .4, size: .12, names: VEG });
  });
  return out;
};
