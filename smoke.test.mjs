// Run: node --experimental-vm-modules smoke.test.mjs (requires CDN access).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule } from 'node:vm';

const modules = new Map();
async function loadModule(url) {
    if (modules.has(url)) return modules.get(url);
    const source = url.startsWith('https:')
        ? await fetch(url).then(response => {
            if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
            return response.text();
        })
        : await readFile(new URL(url), 'utf8');
    const module = new SourceTextModule(source, { identifier: url });
    modules.set(url, module);
    await module.link((specifier, parent) => loadModule(
        specifier === 'three' ? 'https://unpkg.com/three@0.160.0/build/three.module.js'
            : specifier.startsWith('three/addons/')
                ? specifier.replace('three/addons/', 'https://unpkg.com/three@0.160.0/examples/jsm/')
                : new URL(specifier, parent.identifier).href
    ));
    return module;
}

const module = await loadModule(new URL('./smoke.js', import.meta.url).href);
await module.evaluate();
const { SmokeSystem } = module.namespace;
const THREE = modules.get('https://unpkg.com/three@0.160.0/build/three.module.js').namespace;
const scene = new THREE.Scene();
const smoke = new SmokeSystem(scene);
assert.equal(scene.children[0], smoke.points);
assert.deepEqual(smoke.emitterPosition.toArray(), [0, 0, 0]);
assert.equal(smoke.geometry.drawRange.count, 500);
assert.equal(smoke.material.depthWrite, false);
assert.equal(smoke.material.blending, THREE.NormalBlending);
assert.equal(smoke.geometry.attributes.particleSeed.array, smoke.seeds);
assert.ok(smoke.seeds.every(value => value >= 0 && value < 1));
const twin = new SmokeSystem(new THREE.Scene());
assert.deepEqual(smoke.seeds, twin.seeds);
for (let frame = 0; frame < 120; frame++) {
    smoke.update(1 / 60);
    twin.update(1 / 60);
}
assert.deepEqual(smoke.positions, twin.positions);
assert.deepEqual(smoke.velocities, twin.velocities);
assert.equal(smoke.material.uniforms.time.value, smoke.time);
twin.dispose();
const positions = smoke.positions;
const velocities = smoke.velocities;

smoke.setSmokeDensity(1);
smoke.resetParticle(0);
assert.deepEqual(Array.from(positions.slice(0, 3)), [0, 0, 0]);
smoke.update(0.1);
assert.ok(positions[1] > 0);
assert.ok(smoke.sizes[0] > 0.12);
assert.ok(smoke.opacities[0] > 0);
const previousPosition = Array.from(positions.slice(0, 3));
const emitter = new THREE.Vector3(3, 2, -1);
smoke.updateEmitterPosition(emitter);
emitter.set(9, 9, 9);
assert.deepEqual(smoke.emitterPosition.toArray(), [3, 2, -1]);
assert.deepEqual(Array.from(positions.slice(0, 3)), previousPosition);

smoke.ages[0] = smoke.lifetimes[0];
smoke.update(0.01);
assert.deepEqual(Array.from(positions.slice(0, 3)), [3, 2, -1]);
assert.equal(smoke.opacities[0], 0);
positions[1] = 7;
smoke.update(0.01);
assert.deepEqual(Array.from(positions.slice(0, 3)), [3, 2, -1]);
smoke.resetParticle(0, 0.05);
smoke.updateEmitterPosition({ x: -2, y: 4, z: 1 });
smoke.update(0.1);
assert.deepEqual(Array.from(positions.slice(0, 3)), [-2, 4, 1]);

smoke.resetParticle(0);
smoke.ages[0] = smoke.lifetimes[0] * 0.5;
smoke.update(0.01);
const middleOpacity = smoke.opacities[0];
const middleSize = smoke.sizes[0];
smoke.ages[0] = smoke.lifetimes[0] * 0.9;
smoke.update(0.01);
assert.ok(smoke.opacities[0] < middleOpacity);
assert.ok(smoke.sizes[0] > middleSize);
smoke.resetParticle(0);
smoke.setWindStrength(3);
const oldX = positions[0];
for (let i = 0; i < 10; i++) smoke.update(0.1);
assert.ok(positions[0] > oldX);
smoke.setWindStrength(-3);
const windyX = positions[0];
for (let i = 0; i < 10; i++) smoke.update(0.1);
assert.ok(positions[0] < windyX);

for (const invalid of [NaN, Infinity, -Infinity, '10', null]) {
    const time = smoke.time;
    smoke.update(invalid);
    assert.equal(smoke.time, time);
    smoke.setSmokeDensity(invalid);
    assert.equal(smoke.density, 1);
    smoke.setWindStrength(invalid);
    assert.equal(smoke.windStrength, -3);
}
smoke.updateEmitterPosition({ x: NaN, y: 0, z: 0 });
assert.deepEqual(smoke.emitterPosition.toArray(), [-2, 4, 1]);
smoke.setSmokeDensity(-1);
assert.equal(smoke.geometry.drawRange.count, 0);
smoke.setSmokeDensity(1e9);
assert.equal(smoke.geometry.drawRange.count, 2000);
smoke.setWindStrength(1e9);
assert.equal(smoke.windStrength, 3);
for (let i = 0; i < 1200; i++) smoke.update(1 / 60);
assert.equal(smoke.positions, positions);
assert.equal(smoke.velocities, velocities);
assert.ok(positions.every(Number.isFinite));
assert.ok(velocities.every(Number.isFinite));
assert.ok(smoke.opacities.every(value => value >= 0 && value <= 0.09));
smoke.points.onBeforeRender({ getDrawingBufferSize: target => target.set(1600, 1200) });
assert.equal(smoke.material.uniforms.viewportHeight.value, 1200);
let disposed = 0;
smoke.geometry.addEventListener('dispose', () => disposed++);
smoke.material.addEventListener('dispose', () => disposed++);
smoke.dispose();
assert.equal(scene.children.length, 0);
assert.equal(disposed, 2);
console.log('SmokeSystem: all checks passed.');
