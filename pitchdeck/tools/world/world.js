/* ------------------------------------------------------- the pantry hutch
   A two-tier kitchen dresser on the podium at the head of the flight: sage
   painted cabinets with oak trim, a butcher-block counter between the tiers,
   glass doors lit from inside so the jars on every shelf stand out as the
   only warm thing in the room, and the week's pots stacked along the top. */
const OAK = () => lib('oakMat', () => surface(postWood(), [1.1, 1.0], { color: hdr(2.1, 1.35, .86), normal: 1.0, metalness: .02, roughness: .82 }));
const BRASS = () => lib('brassMat', () => new THREE.MeshStandardMaterial({ color: 0xc89a42, roughness: .36, metalness: .72 }));
const COPPER = () => lib('copperMat', () => new THREE.MeshStandardMaterial({ color: 0xd2733e, roughness: .34, metalness: .62 }));

/* the hutch's nameplate, set in the wordmark face */
function texPlaque() {
  const W = 512, H = 256, c = cvs(W, H), x = c.getContext('2d');
  x.fillStyle = '#20150d'; x.fillRect(0, 0, W, H);
  x.strokeStyle = 'rgba(214,170,90,.7)'; x.lineWidth = 6; x.strokeRect(14, 14, W - 28, H - 28);
  x.fillStyle = '#e6c27a'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '600 92px Wordmark, Onest, sans-serif';
  x.fillText('PAINTRY', W / 2, H / 2 + 6);
  return c;
}

function buildTemple() {
  const g = new THREE.Group();
  /* one board library, sampled at two scales: painted panels lie long, the
     oak stiles carry their grain down their own length */
  const timber = surface(wallWood(), [4, 1.6], { color: hdr(1.25, 1.75, 1.45), normal: 1.1, roughness: .78 });
  const post   = OAK();
  const brass  = BRASS();
  const block  = surface(wallWood(), [3, .8], { color: hdr(2.3, 1.5, .98), normal: .9, roughness: .66 });
  /* the light behind the glass — the only thing in the room allowed to be bright */
  const paper = new THREE.MeshBasicMaterial({ color: hdr(1.10, .62, .26), fog: true, toneMapped: false });
  const grid  = new THREE.MeshBasicMaterial({ map: tx(texShoji()), transparent: true,
    depthWrite: false, fog: true });
  WORLD.paper = paper;

  /* one lit cabinet door: a glowing sheet with the glazing and shelves in front */
  function bay(w, h, x, y, z) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), paper);
    p.position.set(x, y, z); g.add(p);
    const s = new THREE.Mesh(new THREE.PlaneGeometry(w, h), grid);
    s.position.set(x, y, z + .06); s.renderOrder = 3; g.add(s);
  }
  /* The corbel band under each counter and the cornice. The pieces are merged,
     so they carry absolute coordinates — TEMPLE_Z has to go in here. */
  function brackets(halfW, halfD, y, step) {
    const parts = [];
    for (let x = -halfW; x <= halfW + 1e-3; x += step) {
      [-halfD, halfD].forEach(dz => {
        parts.push(new THREE.BoxGeometry(.30, .42, .30).translate(x, y, TEMPLE_Z + dz));
        parts.push(new THREE.BoxGeometry(.30, .14, .62).translate(x, y + .26, TEMPLE_Z + dz));
      });
    }
    const m = new THREE.Mesh(mergeGeos(parts), post);
    m.castShadow = false; g.add(m);
  }

  const F = PODIUM;                                   /* the hutch's floor level */

  /* ---- base cabinets: five lit glass doors between oak stiles ----------- */
  const core = new THREE.Mesh(new THREE.BoxGeometry(13.6, 5.0, 8.2), timber);
  core.position.set(0, F + 2.5, TEMPLE_Z); core.castShadow = true; g.add(core);
  for (let i = 0; i < 5; i++) bay(1.75, 3.1, -5.6 + i * 2.8, F + 2.75, TEMPLE_Z + 4.16);
  for (let i = 0; i < 6; i++) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(.46, 5.0, .34), post);
    c.position.set(-7.0 + i * 2.8, F + 2.5, TEMPLE_Z + 4.24); c.castShadow = true; g.add(c);
    if (i < 5) {                                      /* a brass knob on every door */
      const k = new THREE.Mesh(new THREE.SphereGeometry(.09, 12, 10), brass);
      k.position.set(-5.6 + i * 2.8 + .66, F + 2.5, TEMPLE_Z + 4.34); g.add(k);
    }
  }
  const kick = new THREE.Mesh(new THREE.BoxGeometry(14.6, .55, 8.9), post);
  kick.position.set(0, F + .27, TEMPLE_Z); g.add(kick);
  brackets(7.0, 4.4, F + 5.1, 1.40);

  /* ---- the butcher-block counter between the tiers ---------------------- */
  const counter = new THREE.Mesh(new THREE.BoxGeometry(15.4, .5, 9.8), block);
  counter.position.set(0, F + 5.55, TEMPLE_Z); counter.castShadow = true; counter.receiveShadow = true; g.add(counter);
  WORLD.templeTop = F + 16.0;

  /* ---- upper cabinet, with an open shelf of canisters along its foot ----- */
  const up = new THREE.Mesh(new THREE.BoxGeometry(10.0, 3.4, 6.0), timber);
  up.position.set(0, F + 9.4, TEMPLE_Z); up.castShadow = true; g.add(up);
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(12.4, .22, 8.4), post);
  shelf.position.set(0, F + 7.66, TEMPLE_Z); g.add(shelf);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(12.4, .12, .12), brass);
  rail.position.set(0, F + 8.25, TEMPLE_Z + 4.15); g.add(rail);
  /* canisters on the shelf: cream, tomato and sage, lids in brass */
  const tins = [0xd9c7a8, 0xb8452a, 0x7d9a7c, 0xe0b25a].map(c =>
    new THREE.MeshStandardMaterial({ color: c, roughness: .52, metalness: .05 }));
  const rnd = mulberry32(5150);
  for (let x = -5.8; x < 5.9; x += .62 + rnd() * .5) {
    const h = .45 + rnd() * .55, r = .17 + rnd() * .11;
    const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 18), tins[(rnd() * tins.length) | 0]);
    t.position.set(x, F + 7.77 + h / 2, TEMPLE_Z + 3.7 + rnd() * .2); t.castShadow = true; g.add(t);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.04, r * 1.04, .07, 18), brass);
    lid.position.set(x, F + 7.77 + h + .035, t.position.z); g.add(lid);
  }
  for (let i = 0; i < 4; i++) bay(1.2, 1.9, -4.5 + i * 3.0, F + 9.5, TEMPLE_Z + 3.06);
  /* the nameplate */
  const plq = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.0, .16), brass);
  plq.position.set(0, F + 10.62, TEMPLE_Z + 3.12); g.add(plq);
  const plqIn = new THREE.Mesh(new THREE.PlaneGeometry(1.66, .80),
    new THREE.MeshStandardMaterial({ map: tx(texPlaque()), roughness: .6, metalness: .2 }));
  plqIn.position.set(0, F + 10.62, TEMPLE_Z + 3.21); g.add(plqIn);
  brackets(5.2, 3.3, F + 11.2, 1.30);

  /* ---- the cornice, and the week's pots stacked on top of it ------------ */
  const c1 = new THREE.Mesh(new THREE.BoxGeometry(11.2, .46, 6.9), post);
  c1.position.set(0, F + 11.55, TEMPLE_Z); c1.castShadow = true; g.add(c1);
  const c2 = new THREE.Mesh(new THREE.BoxGeometry(12.0, .36, 7.5), post);
  c2.position.set(0, F + 11.96, TEMPLE_Z); c2.castShadow = true; g.add(c2);
  const copper = COPPER();
  const stock = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.38, 2.3, 32), copper);
  stock.position.set(-2.9, F + 13.29, TEMPLE_Z); stock.castShadow = true; g.add(stock);
  [-1, 1].forEach(s => {
    const ear = new THREE.Mesh(new THREE.TorusGeometry(.32, .07, 8, 18), brass);
    ear.position.set(-2.9 + s * 1.55, F + 13.9, TEMPLE_Z); ear.rotation.y = Math.PI / 2; g.add(ear);
  });
  const crock = new THREE.Mesh(new THREE.SphereGeometry(1.25, 28, 20), new THREE.MeshStandardMaterial({ color: 0x8c4a2a, roughness: .7 }));
  crock.scale.set(1, 1.15, 1); crock.position.set(1.0, F + 13.45, TEMPLE_Z); crock.castShadow = true; g.add(crock);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(.55, .7, .5, 24), crock.material);
  neck.position.set(1.0, F + 14.85, TEMPLE_Z); g.add(neck);
  [[3.4, 2.6, .34], [4.3, 2.1, .30], [-5.0, 1.7, .40]].forEach(([x, h, r]) => {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(r * .45, r, h, 18), new THREE.MeshStandardMaterial({ color: 0x2e4a2c, roughness: .25, metalness: .1 }));
    b.position.set(x, F + 12.14 + h / 2, TEMPLE_Z + .6); g.add(b);
  });

  /* ---- the two flanking counters, lit the same way ---------------------- */
  [-1, 1].forEach(s => {
    const w = new THREE.Mesh(new THREE.BoxGeometry(7.6, 3.4, 5.2), timber);
    w.position.set(s * 10.6, F + 1.7, TEMPLE_Z + 1.4); w.castShadow = true; g.add(w);
    for (let i = 0; i < 3; i++) bay(1.5, 2.1, s * 10.6 + (i - 1) * 2.4, F + 1.8, TEMPLE_Z + 4.06);
    const top = new THREE.Mesh(new THREE.BoxGeometry(8.2, .38, 5.8), block);
    top.position.set(s * 10.6, F + 3.59, TEMPLE_Z + 1.4); top.castShadow = true; g.add(top);
  });
  /* a kettle on the left counter, a saucepot on the right */
  const kettle = new THREE.Mesh(new THREE.SphereGeometry(.8, 24, 18), copper);
  kettle.scale.set(1, .82, 1); kettle.position.set(-10.2, F + 4.42, TEMPLE_Z + 2.0); g.add(kettle);
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(.08, .16, .9, 10), copper);
  spout.position.set(-9.45, F + 4.62, TEMPLE_Z + 2.0); spout.rotation.z = -.9; g.add(spout);
  const sauce = new THREE.Mesh(new THREE.CylinderGeometry(.85, .8, 1.0, 24), copper);
  sauce.position.set(10.4, F + 4.28, TEMPLE_Z + 2.2); g.add(sauce);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(1.4, .1, .16), post);
  handle.position.set(11.8, F + 4.6, TEMPLE_Z + 2.2); g.add(handle);

  scene.add(g); WORLD.temple = g;

  /* the glow the cabinets push out over their own steps */
  const spill = new THREE.Mesh(new THREE.PlaneGeometry(30, 16),
    new THREE.MeshBasicMaterial({ map: tx(texGlow('rgba(255,170,80,.80)', 'rgba(240,110,36,.24)')),
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: .30 }));
  spill.position.set(0, F + 3.0, TEMPLE_Z + 5.6); spill.renderOrder = 2;
  scene.add(spill); WORLD.hallHalo = spill;

  /* a band of steam between the hutch and the wall behind it — the one
     thing that stops the whole background reading as a single flat cut-out */
  const mist = new THREE.Mesh(new THREE.PlaneGeometry(64, 20),
    new THREE.MeshBasicMaterial({ map: tx(texGlow('rgba(220,190,160,.55)', 'rgba(170,130,100,.18)')),
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: .14 }));
  mist.position.set(0, F - 1.4, TEMPLE_Z + 10); mist.renderOrder = 2; scene.add(mist);
}

/* --------------------------------------------------- the citrus moon
   Hung well behind the hutch so the pots on its top cross its lower left. */
const MOON = { x: 17.9, y: 31.9, z: -72, r: 8.6 };
function buildMoon() {
  const disc = new THREE.Mesh(new THREE.PlaneGeometry(MOON.r * 2, MOON.r * 2),
    /* the slice is authored in its own colour; this only lifts it past one so
       the bloom picks it up, a little more in red than in blue */
    new THREE.MeshBasicMaterial({ map: tx(texMoon()), color: hdr(1.55, 1.18, .92),
      transparent: true, depthWrite: false, fog: false, toneMapped: false }));
  disc.position.set(MOON.x, MOON.y, MOON.z); disc.renderOrder = 1;
  scene.add(disc); WORLD.moon = disc;

  const halo = new THREE.Mesh(new THREE.PlaneGeometry(MOON.r * 6.4, MOON.r * 6.4),
    new THREE.MeshBasicMaterial({ map: tx(texGlow('rgba(255,180,90,.90)', 'rgba(232,120,40,.26)')),
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: .40 }));
  halo.position.set(MOON.x, MOON.y, MOON.z - .3); halo.renderOrder = 0;
  scene.add(halo); WORLD.moonHalo = halo;
}
/* On a tall frame the rig steps back and its horizontal reach narrows, which
   would slide the slice off the right edge — draw it in by the same amount. */
function placeMoon() {
  if (!WORLD.moon) return;
  const x = MOON.x * (1 - .40 * aspectFix());
  WORLD.moon.position.x = x;
  WORLD.moonHalo.position.x = x;
}

/* ------------------------------------------------------- the pot rack
   Where the gate stood: two oak posts, a crossbar, a top rail, and the
   kitchen's copper hung off the crossbar on S-hooks. The hanging pieces stay
   inside the middle of the span — the rig walks through just beside it. */
function buildTorii() {
  const oak = OAK(), brass = BRASS(), copper = COPPER();
  const iron = new THREE.MeshStandardMaterial({ color: 0x2a2320, roughness: .5, metalness: .6 });
  const g = new THREE.Group();
  const BASE = .78, H = 8.2, SPAN = 3.55;

  [-1, 1].forEach(s => {
    const col = new THREE.Mesh(new THREE.BoxGeometry(.56, H, .56), oak);
    col.position.set(s * SPAN, BASE + H / 2, 0); col.castShadow = true; g.add(col);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(.86, .52, .86), brass);
    foot.position.set(s * SPAN, BASE + .26, 0); foot.castShadow = true; g.add(foot);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(.38, 18, 14), brass);
    cap.position.set(s * SPAN, BASE + H + .9, 0); g.add(cap);
  });
  const NY = BASE + H - 2.15;
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(.16, .16, 8.4, 16), iron);
  bar.rotation.z = Math.PI / 2; bar.position.set(0, NY, 0); bar.castShadow = true; g.add(bar);
  const top = new THREE.Mesh(new THREE.BoxGeometry(9.8, .62, .7), oak);
  top.position.set(0, BASE + H + .3, 0); top.castShadow = true; g.add(top);

  /* what hangs off the bar: [x, kind, size] */
  const hooks = [[-2.4, 'pan', .78], [-1.35, 'ladle', .9], [-.45, 'pot', .55], [.55, 'pan', .62],
                 [1.45, 'whisk', .8], [2.35, 'pan', .5]];
  hooks.forEach(([x, kind, s]) => {
    const hook = new THREE.Mesh(new THREE.TorusGeometry(.12, .025, 6, 14, Math.PI * 1.5), iron);
    hook.position.set(x, NY - .2, 0); g.add(hook);
    const y0 = NY - .32;
    if (kind === 'pan') {                    /* a frying pan face-on, handle up to the hook */
      const hl = s * 1.3;
      const handle = new THREE.Mesh(new THREE.BoxGeometry(.12, hl, .06), copper);
      handle.position.set(x, y0 - hl / 2, 0); g.add(handle);
      const pan = new THREE.Mesh(new THREE.CylinderGeometry(s, s * .86, .16, 32), copper);
      pan.rotation.x = Math.PI / 2; pan.position.set(x, y0 - hl - s, .02); pan.castShadow = true; g.add(pan);
    } else if (kind === 'pot') {             /* a saucepot hung by its bail */
      const bail = new THREE.Mesh(new THREE.TorusGeometry(s * .9, .03, 6, 20, Math.PI), iron);
      bail.rotation.z = Math.PI; bail.position.set(x, y0 - s * .9, 0); g.add(bail);
      const body = new THREE.Mesh(new THREE.CylinderGeometry(s, s * .94, s * 1.2, 24), copper);
      body.position.set(x, y0 - s * 1.5, 0); body.castShadow = true; g.add(body);
    } else if (kind === 'ladle') {
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, s * 1.7, 8), brass);
      stem.position.set(x, y0 - s * .85, 0); g.add(stem);
      const cup = new THREE.Mesh(new THREE.SphereGeometry(s * .3, 16, 10, 0, TAU, Math.PI / 2, Math.PI / 2), brass);
      cup.position.set(x, y0 - s * 1.62, 0); g.add(cup);
    } else {                                 /* a whisk: handle and a cage of wires */
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(.06, .05, s * .8, 8), oak);
      stem.position.set(x, y0 - s * .4, 0); g.add(stem);
      for (let i = 0; i < 4; i++) {
        const w = new THREE.Mesh(new THREE.TorusGeometry(s * .26, .012, 4, 18), iron);
        w.scale.set(1, 2.2, 1); w.rotation.y = i * Math.PI / 4; w.position.set(x, y0 - s * 1.35, 0); g.add(w);
      }
    }
  });

  /* stands at the foot of the flight, small enough that the hutch keeps the
     top of the frame to itself; dropped by BASE*GS so the feet land */
  const GS = .72;
  g.position.set(0, -BASE * GS, -8.6); g.scale.setScalar(GS);
  scene.add(g); WORLD.torii = g;
}

/* ------------------------------------------------------- jar lamps
   A preserving jar on a crate with a candle burning in it: the light source
   the stone lanterns used to be, at the same footprints. */
function buildLantern(x, z, s, y) {
  const oak = OAK(), brass = BRASS();
  const glass = lib('jarGlass', () => new THREE.MeshStandardMaterial({ color: 0xd6efe6, roughness: .08, metalness: .1,
    transparent: true, opacity: .32, depthWrite: false }));
  const g = new THREE.Group();
  const crate = new THREE.Mesh(new THREE.BoxGeometry(1.0, .9, 1.0), oak);
  crate.position.y = .45; crate.castShadow = true; g.add(crate);
  const slat = new THREE.Mesh(new THREE.BoxGeometry(1.04, .1, 1.04), lib('crateDark', () =>
    new THREE.MeshStandardMaterial({ color: 0x3a2214, roughness: .9 })));
  slat.position.y = .45; g.add(slat);

  const paneMat = new THREE.MeshBasicMaterial({ color: hdr(2.3, .95, .26), fog: false, toneMapped: false });
  const flame = new THREE.Mesh(new THREE.CylinderGeometry(.2, .22, .55, 18), paneMat);
  flame.position.y = 1.25; g.add(flame);
  WORLD.lanternPane = WORLD.lanternPane || paneMat;
  const jarM = new THREE.Mesh(new THREE.CylinderGeometry(.34, .34, .95, 24, 1, true), glass);
  jarM.position.y = 1.38; jarM.renderOrder = 3; g.add(jarM);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(.3, .3, .12, 24), brass);
  lid.position.y = 1.9; g.add(lid);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.3, .03, 6, 24), brass);
  ring.rotation.x = Math.PI / 2; ring.position.y = 1.82; g.add(ring);

  const glow = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4),
    new THREE.MeshBasicMaterial({ map: tx(texGlow('rgba(255,170,80,.9)', 'rgba(255,110,30,.28)')),
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: .5 }));
  glow.position.y = 1.3; glow.renderOrder = 2; g.add(glow);
  glow.userData.billboard = true;

  const lt = new THREE.PointLight(0xff8a30, 2.6, 9, 2);
  lt.position.set(0, 1.3, 0); g.add(lt);
  WORLD.lanternLights = WORLD.lanternLights || [];
  WORLD.lanternLights.push(lt); WORLD.lanternGlows = WORLD.lanternGlows || []; WORLD.lanternGlows.push(glow);

  g.position.set(x, y || 0, z); g.scale.setScalar(s || 1);
  scene.add(g);
  return g;
}

/* ------------------------------------------------------- pendant lamps
   Enamel shades on long cords over the floor and the flight. They give the
   room a ceiling without building one: the cords run up into the dark. */
function buildPendants() {
  const enamel = new THREE.MeshStandardMaterial({ color: 0x2f5a46, roughness: .4, metalness: .15, side: THREE.DoubleSide });
  const cordM = new THREE.MeshBasicMaterial({ color: 0x0a0806 });
  const bulb = new THREE.MeshBasicMaterial({ color: hdr(3.2, 2.1, 1.1), toneMapped: false });
  const glowT = tx(texGlow('rgba(255,200,120,.9)', 'rgba(255,150,60,.24)'));
  [[-6.2, 9.4, -1.0], [6.2, 9.4, -1.0], [0, 14.6, -27.0]].forEach(([x, y, z]) => {
    const g = new THREE.Group();
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(.2, 1.0, .8, 32, 1, true), enamel);
    g.add(shade);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(.16, .2, .2, 16), enamel);
    crown.position.y = .5; g.add(crown);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, 16, 6), cordM);
    cord.position.y = 8.5; g.add(cord);
    const b = new THREE.Mesh(new THREE.SphereGeometry(.24, 16, 12), bulb);
    b.position.y = -.25; g.add(b);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2),
      new THREE.MeshBasicMaterial({ map: glowT, transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, fog: false, opacity: .42 }));
    glow.position.y = -.3; glow.renderOrder = 2; g.add(glow);
    WORLD.lanternGlows = WORLD.lanternGlows || []; WORLD.lanternGlows.push(glow);
    const lt = new THREE.PointLight(0xffb066, 3.4, 15, 2);
    lt.position.y = -.6; g.add(lt);
    g.position.set(x, y, z); scene.add(g);
  });
}

/* ------------------------------------------------------- potted bay trees
   The maples, brought indoors: the same branching, a terracotta pot under
   it, and a canopy of bay leaves. */
function buildMaple(seed, x, z, scale) {
  const rnd = mulberry32(seed);
  const parts = [], tips = [];
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3(), pos = new THREE.Vector3();
  const POT = 1.3;

  function seg(from, to, r0, r1) {
    dir.subVectors(to, from);
    const len = dir.length(); dir.normalize();
    const geo = new THREE.CylinderGeometry(r1, r0, len, 6, 1, true);
    Q.setFromUnitVectors(UP, dir);
    pos.addVectors(from, to).multiplyScalar(.5);
    M.compose(pos, Q, new THREE.Vector3(1, 1, 1));
    geo.applyMatrix4(M);
    parts.push(geo);
  }
  function branch(from, dirV, len, rad, depth) {
    const to = from.clone().addScaledVector(dirV, len);
    to.y += len * .10;
    seg(from, to, rad, rad * .68);
    if (depth >= 4 || len < .34) { tips.push(to.clone()); return; }
    const n = depth < 2 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const d = dirV.clone();
      d.x += (rnd() - .5) * 1.25; d.z += (rnd() - .5) * 1.25; d.y += .30 + rnd() * .5;
      d.normalize();
      branch(to, d, len * (.62 + rnd() * .16), rad * .66, depth + 1);
    }
  }
  const root = new THREE.Vector3(0, POT, 0), fork = new THREE.Vector3(0, POT + 1.5, 0);
  seg(root, fork, .2, .15);
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * TAU + rnd();
    branch(fork, new THREE.Vector3(Math.cos(a) * .8, .8, Math.sin(a) * .8).normalize(), 1.3, .14, 0);
  }
  const trunk = new THREE.Mesh(mergeGeos(parts),
    new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: .94, metalness: .0, side: THREE.DoubleSide }));
  trunk.castShadow = true;

  const terracotta = lib('terracotta', () => new THREE.MeshStandardMaterial({ color: 0xa24e2a, roughness: .86, metalness: 0 }));
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(1.0, .72, POT, 28), terracotta);
  pot.position.y = POT / 2; pot.castShadow = true; pot.receiveShadow = true;
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.06, .2, 28), terracotta);
  rim.position.y = POT - .05;
  const soil = new THREE.Mesh(new THREE.CircleGeometry(.96, 24), new THREE.MeshStandardMaterial({ color: 0x1a110b, roughness: 1 }));
  soil.rotation.x = -Math.PI / 2; soil.position.y = POT - .06;

  const leafGeo = new THREE.PlaneGeometry(.36, .36);
  const leafMat = new THREE.MeshStandardMaterial({
    map: tx(texLeaf()), color: 0x2c5a22, alphaTest: .42, side: THREE.DoubleSide,
    roughness: .7, metalness: 0, emissive: 0x0c1e06, emissiveIntensity: .5
  });
  const per = LOW ? 5 : 9;
  const inst = new THREE.InstancedMesh(leafGeo, leafMat, tips.length * per);
  const m4 = new THREE.Matrix4(), e = new THREE.Euler(), q2 = new THREE.Quaternion(), sc = new THREE.Vector3();
  let k = 0;
  tips.forEach(t => {
    for (let i = 0; i < per; i++) {
      const p = new THREE.Vector3(t.x + (rnd() - .5) * .95, t.y + (rnd() - .5) * .8, t.z + (rnd() - .5) * .95);
      e.set(rnd() * TAU, rnd() * TAU, rnd() * TAU);
      q2.setFromEuler(e);
      const s = .7 + rnd() * .75; sc.set(s, s, s);
      m4.compose(p, q2, sc);
      inst.setMatrixAt(k++, m4);
    }
  });
  inst.instanceMatrix.needsUpdate = true;
  inst.castShadow = false; inst.frustumCulled = false;

  const g = new THREE.Group();
  g.add(pot); g.add(rim); g.add(soil); g.add(trunk); g.add(inst);
  g.position.set(x, 0, z); g.scale.setScalar(scale || 1);
  g.rotation.y = rnd() * TAU;
  scene.add(g);
  /* leaves breathe in the draught from the door */
  leafMat.onBeforeCompile = sh => {
    sh.uniforms.uT = WORLD.uT;
    sh.vertexShader = 'uniform float uT;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n' +
      'vec3 wp = (instanceMatrix * vec4(0.0,0.0,0.0,1.0)).xyz;\n' +
      'float ph = wp.x*1.7 + wp.z*1.3 + wp.y*.7;\n' +
      'transformed.x += sin(uT*1.35 + ph)*0.04;\n' +
      'transformed.z += cos(uT*1.05 + ph*1.3)*0.03;\n');
  };
  return g;
}

/* ------------------------------------------------------- the produce
   Where the boulders sat: pumpkins, cabbages and red onions, big as the
   rocks were, left on the tiles like a market delivery not yet put away. */
function buildRocks() {
  const mats = {
    pumpkin: new THREE.MeshStandardMaterial({ color: 0xd06a1e, roughness: .55, metalness: .02 }),
    cabbage: new THREE.MeshStandardMaterial({ color: 0x5e8a3e, roughness: .7, metalness: 0 }),
    onion:   new THREE.MeshStandardMaterial({ color: 0x8a2c46, roughness: .45, metalness: .02 })
  };
  const stemM = new THREE.MeshStandardMaterial({ color: 0x4a3a1a, roughness: .9 });
  const rnd = mulberry32(404), n = noise2D(88);
  const spots = [[-6.2, -5.4, .95], [-7.4, -2.1, .7], [6.6, -7.2, .8], [8.0, -4.0, 1.05],
                 [-9.0, -8.4, 1.15], [9.6, -9.2, .9], [3.4, -7.8, .55], [-3.2, -8.6, .6]];
  const kinds = ['pumpkin', 'cabbage', 'pumpkin', 'onion', 'pumpkin', 'cabbage', 'onion', 'onion'];
  spots.forEach((s, i) => {
    const kind = kinds[i];
    const geo = new THREE.SphereGeometry(s[2], 40, 28);
    const p = geo.attributes.position;
    for (let v = 0; v < p.count; v++) {
      let vx = p.getX(v), vy = p.getY(v), vz = p.getZ(v);
      const ang = Math.atan2(vz, vx), r = s[2];
      if (kind === 'pumpkin') {                     /* ribs, and a squat body */
        const rib = 1 - .07 * Math.pow(Math.abs(Math.cos(ang * 4)), .6);
        vx *= rib; vz *= rib; vy *= .66;
        if (vy > 0) vy -= .12 * r * Math.exp(-((vx * vx + vz * vz) / (r * r)) * 6);
      } else if (kind === 'cabbage') {              /* lumpy leaves */
        const d = 1 + .08 * fbm(n, vx * 2.2 + i * 7, vz * 2.2 + vy * 2, 3, 2.2, .5);
        vx *= d; vy *= d * .9; vz *= d;
      } else {                                       /* an onion draws up to a point */
        if (vy > 0) { const k = 1 - .45 * Math.pow(vy / r, 2); vx *= k; vz *= k; vy *= 1.2; }
      }
      p.setXYZ(v, vx, vy, vz);
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mats[kind]);
    const lift = kind === 'pumpkin' ? .66 : (kind === 'onion' ? 1 : .9);
    m.position.set(s[0], s[2] * lift * .98, s[1]);
    m.rotation.set((rnd() - .5) * .2, rnd() * TAU, (rnd() - .5) * .2);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    if (kind === 'pumpkin') {
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(s[2] * .07, s[2] * .1, s[2] * .3, 8), stemM);
      stem.position.set(s[0], s[2] * (lift * .98 + .62), s[1]); stem.rotation.z = .25;
      scene.add(stem);
    }
  });
}
