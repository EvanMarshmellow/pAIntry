/* -------------------------------------------------------- the citrus moon
   The disc that hangs over the hall is half an orange, cut across: a rind
   ring, a white pith ring, and ten segments of pulp running out from a pale
   core. What sells it as fruit rather than as a sun is the segment walls and
   the vesicles — the tiny teardrop sacs every segment is packed with — so
   those are drawn as structure, not left to noise. Authored in near-neutral
   warm tones; the material lifts it into HDR so the bloom can find it. */
function texMoon() {
  const S = 512, c = cvs(S, S), x = c.getContext('2d');
  const R = S / 2 - 1, C = S / 2, rnd = mulberry32(91);
  x.save(); x.beginPath(); x.arc(C, C, R, 0, TAU); x.clip();

  /* rind and pith */
  x.fillStyle = 'rgb(214,120,36)'; x.fillRect(0, 0, S, S);
  x.fillStyle = 'rgb(246,226,186)'; x.beginPath(); x.arc(C, C, R * .93, 0, TAU); x.fill();

  /* the segments, each a wedge of pulp with a rounded outer end */
  const SEG = 10, inner = R * .07, outer = R * .86;
  for (let i = 0; i < SEG; i++) {
    const a0 = i / SEG * TAU + .035, a1 = (i + 1) / SEG * TAU - .035;
    x.beginPath();
    x.moveTo(C + Math.cos((a0 + a1) / 2) * inner, C + Math.sin((a0 + a1) / 2) * inner);
    x.lineTo(C + Math.cos(a0) * outer * .9, C + Math.sin(a0) * outer * .9);
    x.quadraticCurveTo(C + Math.cos((a0 + a1) / 2) * outer * 1.06, C + Math.sin((a0 + a1) / 2) * outer * 1.06,
                       C + Math.cos(a1) * outer * .9, C + Math.sin(a1) * outer * .9);
    x.closePath();
    const g = x.createRadialGradient(C, C, inner, C, C, outer);
    const t = .9 + rnd() * .16;
    g.addColorStop(0, hex(250 * t, 190 * t, 92 * t));
    g.addColorStop(.6, hex(244 * t, 150 * t, 44 * t));
    g.addColorStop(1, hex(232 * t, 122 * t, 30 * t));
    x.fillStyle = g; x.fill();
    /* vesicles: little teardrops pointing at the core */
    x.save(); x.clip();
    for (let k = 0; k < 150; k++) {
      const a = a0 + rnd() * (a1 - a0), r = inner + Math.sqrt(rnd()) * (outer - inner);
      const px = C + Math.cos(a) * r, py = C + Math.sin(a) * r, s = 3 + rnd() * 7;
      x.save(); x.translate(px, py); x.rotate(a);
      x.fillStyle = rnd() > .5 ? 'rgba(255,236,170,.22)' : 'rgba(150,60,10,.16)';
      x.beginPath(); x.ellipse(0, 0, s * 1.6, s * .55, 0, 0, TAU); x.fill();
      x.restore();
    }
    x.restore();
  }
  /* the core and a scatter of pips */
  x.fillStyle = 'rgb(248,232,196)'; x.beginPath(); x.arc(C, C, inner * 1.15, 0, TAU); x.fill();
  for (let i = 0; i < 3; i++) {
    const a = rnd() * TAU, r = R * (.25 + rnd() * .3);
    x.fillStyle = 'rgb(240,214,160)';
    x.beginPath(); x.ellipse(C + Math.cos(a) * r, C + Math.sin(a) * r, 9, 5, a, 0, TAU); x.fill();
  }
  /* zest texture on the rind, and a soft shading so it is not cut out of paper */
  x.globalCompositeOperation = 'overlay'; x.globalAlpha = .22;
  x.drawImage(fbmCanvas(256, 256, 517, 5, 24, 1.2), 0, 0, S, S);
  x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
  const sh = x.createRadialGradient(S * .40, S * .38, S * .18, S * .52, S * .56, S * .72);
  sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(60,20,0,.28)');
  x.fillStyle = sh; x.fillRect(0, 0, S, S);
  x.restore();

  const fe = x.createRadialGradient(C, C, R - 2.5, C, C, R);
  fe.addColorStop(0, 'rgba(0,0,0,1)'); fe.addColorStop(1, 'rgba(0,0,0,0)');
  x.globalCompositeOperation = 'destination-in';
  x.fillStyle = fe; x.fillRect(0, 0, S, S);
  x.globalCompositeOperation = 'source-over';
  return c;
}
