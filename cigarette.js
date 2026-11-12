import * as THREE from 'three';

export const CIGARETTE = Object.freeze({
  radius: 0.4,
  rodEnd: 5.7,
  filterLength: 2.7,
  totalLength: 8.4,
});

function hash3(x, y, z) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const fade = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const u = fade(x - xi), v = fade(y - yi), w = fade(z - zi);
  const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), u), lerp(c(0, 1, 0), c(1, 1, 0), u), v),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), u), lerp(c(0, 1, 1), c(1, 1, 1), u), v),
    w
  );
}

function fbm3(x, y, z, octaves = 4) {
  let amp = 0.5, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise3(x * freq, y * freq, z * freq);
    norm += amp;
    freq *= 2;
    amp *= 0.5;
  }
  return sum / norm;
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function makeCanvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  return c;
}

function toTexture(canvas, { srgb = true, repeat = null } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

const EMBER_STOPS = [
  [0.0, [20, 15, 12]],
  [0.3, [60, 20, 15]],
  [0.5, [180, 40, 10]],
  [0.7, [240, 90, 20]],
  [0.9, [255, 160, 40]],
  [1.0, [255, 220, 100]],
];
function emberColor(t) {
  t = clamp(t, 0, 0.9999);
  for (let i = 0; i < EMBER_STOPS.length - 1; i++) {
    const [t0, c0] = EMBER_STOPS[i];
    const [t1, c1] = EMBER_STOPS[i + 1];
    if (t >= t0 && t <= t1) {
      const k = (t - t0) / (t1 - t0);
      return [lerp(c0[0], c1[0], k), lerp(c0[1], c1[1], k), lerp(c0[2], c1[2], k)];
    }
  }
  return EMBER_STOPS[EMBER_STOPS.length - 1][1];
}

function makeEmberTexture() {
  const S = 256;
  return makeCanvas(S, S, (ctx) => {
    const img = ctx.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const nx = (x / S) * 2 - 1;
        const ny = (y / S) * 2 - 1;
        const r = Math.hypot(nx, ny);
        let t = fbm3(nx * 4, ny * 4, 1.7, 4);
        t += (0.6 - r) * 0.4;
        const crack = Math.abs(fbm3(nx * 8, ny * 8, 5.3, 3) - 0.5);
        if (crack < 0.04) t *= 0.3;
        t += (Math.random() - 0.5) * 0.1;
        let [R, G, B] = emberColor(t);
        const i = (y * S + x) * 4;
        img.data[i] = R; img.data[i + 1] = G; img.data[i + 2] = B; img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });
}

function makePaperTexture() {
  return makeCanvas(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#f4f2ee';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 2200; i++) {
      const x = Math.random() * w;
      const g = 150 + Math.random() * 80;
      ctx.strokeStyle = `rgba(${g},${g},${g - 6},${0.03 + Math.random() * 0.06})`;
      ctx.lineWidth = 0.6 + Math.random() * 0.8;
      ctx.beginPath();
      ctx.moveTo(x, Math.random() * h);
      ctx.lineTo(x + (Math.random() - 0.5) * 2, Math.random() * h);
      ctx.stroke();
    }
    for (let i = 0; i < 1500; i++) {
      ctx.fillStyle = `rgba(120,115,105,${Math.random() * 0.07})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1);
    }
    ctx.fillStyle = 'rgba(140,135,125,0.22)';
    ctx.fillRect(2, 0, 1.5, h);
  });
}

function makeBurnRingTexture() {
  return makeCanvas(128, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0.0, '#0a0a0a');
    g.addColorStop(0.2, '#1f1108');
    g.addColorStop(0.5, '#6b4322');
    g.addColorStop(1.0, '#f4f2ee');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 1000; i++) {
      ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.15})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
    }
  });
}

function makeFilterTexture() {
  return makeCanvas(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#d98d3f';
    ctx.fillRect(0, 0, w, h);
    const cols = ['#b5651d', '#f0b36a', '#8a4a14', '#e8a257', '#c9782a'];
    for (let i = 0; i < 5000; i++) {
      ctx.globalAlpha = 0.25 + Math.random() * 0.4;
      ctx.fillStyle = cols[(Math.random() * cols.length) | 0];
      ctx.beginPath();
      ctx.ellipse(Math.random() * w, Math.random() * h, 0.6 + Math.random() * 2.2, 0.5 + Math.random() * 1.6, Math.random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  });
}

function makeFilterEndTexture() {
  return makeCanvas(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#efe3cc';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 1800; i++) {
      const a = Math.random() * Math.PI * 2;
      const L = 2 + Math.random() * 7;
      const x = Math.random() * w, y = Math.random() * h;
      ctx.strokeStyle = `rgba(${150 + Math.random() * 60},${120 + Math.random() * 50},${80 + Math.random() * 40},${0.1 + Math.random() * 0.25})`;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L);
      ctx.stroke();
    }
  });
}

function makeGlowTexture() {
  return makeCanvas(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,160,50,1)');
    g.addColorStop(0.3, 'rgba(255,80,15,0.6)');
    g.addColorStop(0.6, 'rgba(255,30,5,0.15)');
    g.addColorStop(1, 'rgba(255,10,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

// ----------------------------------------------------------------------------
// Dựng hình học
// ----------------------------------------------------------------------------
function buildEmberCap(R) {
  const geo = new THREE.RingGeometry(0.0001, R, 48, 12);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const r = Math.hypot(x, y) / R;
    const n = fbm3(x * 8, y * 8, 0.5, 3);
    const hill = (1 - r) * 0.08;
    const bumps = (n - 0.5) * 0.05;
    pos.setZ(i, -(hill + bumps));
  }
  geo.rotateX(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

export function createCigarette() {
  const C = CIGARETTE;
  const R = C.radius;
  const group = new THREE.Group();
  group.name = 'Cigarette';

  const body = new THREE.Group();
  body.rotation.z = -Math.PI / 2; 
  group.add(body);

  // 1. THAN HỒNG 
  const emberTex = toTexture(makeEmberTexture());
  const emberMat = new THREE.MeshStandardMaterial({
    map: emberTex,
    emissiveMap: emberTex,
    emissive: new THREE.Color(1.0, 0.4, 0.1),
    emissiveIntensity: 1.5,
    roughness: 0.9,
    metalness: 0,
  });

  const emberCap = new THREE.Mesh(buildEmberCap(R * 0.98), emberMat);
  emberCap.position.y = 0;
  emberCap.name = 'EmberCap';
  body.add(emberCap);

  const emberSideLength = 0.25;
  const emberSide = new THREE.Mesh(
    new THREE.CylinderGeometry(R * 0.98, R * 0.98, emberSideLength, 40, 1, true),
    emberMat
  );
  emberSide.position.y = -emberSideLength / 2;
  emberSide.name = 'EmberSide';
  body.add(emberSide);

  // 2. VÒNG GIẤY CHÁY XÉM GỒ GHỀ (Burn Ring)
  const ringLength = 0.35;
  const ringGeo = new THREE.CylinderGeometry(R * 1.01, R * 1.01, ringLength, 48, 12, true);
  const pos = ringGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const ny = (y + ringLength / 2) / ringLength; 
    if (ny > 0.4) {
      const n = fbm3(x * 12, y * 12, z * 12, 3);
      const shrink = n * 0.22 * ((ny - 0.4) / 0.6);
      pos.setY(i, y - shrink);
      const curl = n * 0.1 * ((ny - 0.4) / 0.6);
      pos.setX(i, x * (1 - curl));
      pos.setZ(i, z * (1 - curl));
    }
  }
  ringGeo.computeVertexNormals();

  const ringMat = new THREE.MeshStandardMaterial({
    map: toTexture(makeBurnRingTexture()),
    roughness: 0.9,
    side: THREE.DoubleSide
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.y = 0.05 - ringLength / 2;
  ring.name = 'BurnRing';
  body.add(ring);

  // 3. THÂN GIẤY TRẮNG
  const paperTop = ring.position.y - ringLength / 2;
  const paperLen = C.rodEnd - (-paperTop);
  const paperTex = toTexture(makePaperTexture());
  const paper = new THREE.Mesh(
    new THREE.CylinderGeometry(R, R, paperLen, 40, 1, true),
    new THREE.MeshStandardMaterial({
      map: paperTex, bumpMap: paperTex, bumpScale: 0.3, roughness: 0.9, metalness: 0
    })
  );
  paper.position.y = paperTop - paperLen / 2;
  paper.name = 'Paper';
  body.add(paper);

  // 4. ĐẦU LỌC 
  const filterTop = -C.rodEnd;
  const filterCap = new THREE.MeshStandardMaterial({ map: toTexture(makeFilterEndTexture()), roughness: 1 });
  const filterSide = new THREE.MeshStandardMaterial({ map: toTexture(makeFilterTexture()), roughness: 0.6 });
  const filter = new THREE.Mesh(
    new THREE.CylinderGeometry(R * 1.005, R * 1.005, C.filterLength, 40, 1, false),
    [filterSide, filterSide, filterCap]
  );
  filter.position.y = filterTop - C.filterLength / 2;
  filter.name = 'Filter';
  body.add(filter);

  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(R * 1.015, R * 1.015, 0.25, 40, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xe8e5de, roughness: 0.7 })
  );
  band.position.y = filterTop - 0.125;
  band.name = 'FilterBand';
  body.add(band);

  // 5. ÁNH SÁNG & QUẦNG SÁNG 
  const light = new THREE.PointLight(0xff4500, 3, 5, 2);
  light.position.set(0.2, 0.1, 0);
  light.name = 'EmberLight';
  group.add(light);

  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: toTexture(makeGlowTexture()),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    })
  );
  glow.position.set(0.05, 0, 0);
  glow.scale.setScalar(1.4);
  glow.name = 'EmberGlow';
  group.add(glow);

  const state = { glow: 1, t: Math.random() * 100 };
  const warm = new THREE.Color(1.0, 0.35, 0.05);
  const hot = new THREE.Color(1.0, 0.65, 0.2);
  const tmp = new THREE.Color();

  group.setGlowIntensity = (value) => {
    state.glow = clamp(Number(value) || 0, 0, 3);
  };

  group.update = (dt = 1 / 60) => {
    state.t += dt;
    const t = state.t;

    const slow = fbm3(t * 1.2, 0.5, 0, 2);
    const fast = noise3(t * 8.0, 3.3, 0);
    const f = 0.65 + 0.4 * slow + 0.15 * (fast - 0.5) + 0.1 * Math.sin(t * 2.0);
    const k = state.glow * f;

    tmp.copy(warm).lerp(hot, clamp((f - 0.6) / 0.6, 0, 1));
    emberMat.emissive.copy(tmp);
    emberMat.emissiveIntensity = 1.6 * k;

    light.color.copy(tmp);
    light.intensity = 2.5 * k;

    glow.material.opacity = clamp(0.5 * k, 0, 1);
    glow.scale.setScalar(1.4 * (0.8 + 0.2 * f) * (0.5 + 0.5 * Math.min(state.glow, 1.5)));
  };

  group.update(0);
  return group;
}

export function setGlowIntensity(cigarette, value) {
  cigarette.setGlowIntensity(value);
}