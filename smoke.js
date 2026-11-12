import * as THREE from "three";
import { SimplexNoise } from "three/addons/math/SimplexNoise.js";
import { CONFIG } from "./config.js";

const MAX_PARTICLES = 2000;
const MAX_HEIGHT = 4.5;

export class SmokeSystem {
  constructor(scene) {
    this.emitterPosition = new THREE.Vector3();
    this.randomState = 0x51a7;
    this.noise = new SimplexNoise({ random: () => this.random() });
    this.time = 0;
    this.density = 0;
    this.windStrength = 0;
    this.positions = new Float32Array(MAX_PARTICLES * 3);
    this.velocities = new Float32Array(MAX_PARTICLES * 3);
    this.seeds = Float32Array.from({ length: MAX_PARTICLES }, () =>
      this.random(),
    );
    this.sizes = new Float32Array(MAX_PARTICLES);
    this.opacities = new Float32Array(MAX_PARTICLES);
    this.ages = new Float32Array(MAX_PARTICLES);
    this.lifetimes = new Float32Array(MAX_PARTICLES);
    this.spawnHeights = new Float32Array(MAX_PARTICLES);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.positions, 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    this.geometry.setAttribute(
      "particleSize",
      new THREE.BufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage),
    );
    this.geometry.setAttribute(
      "particleOpacity",
      new THREE.BufferAttribute(this.opacities, 1).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    this.geometry.setAttribute(
      "particleSeed",
      new THREE.BufferAttribute(this.seeds, 1),
    );
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        viewportHeight: { value: 1 },
        time: { value: 0 },
        smokeColor: { value: new THREE.Color(0xbcc3cc) },
      },
      vertexShader: `
                uniform float viewportHeight;
                attribute float particleSize;
                attribute float particleOpacity;
                attribute float particleSeed;
                varying float opacity;
                varying float seed;
                varying float expansion;
                void main() {
                    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
                    float depth = projectionMatrix[2][3] == -1.0 ? max(0.01, -viewPosition.z) : 1.0;
                    gl_PointSize = max(1.0, particleSize * viewportHeight * projectionMatrix[1][1] / (2.0 * depth));
                    gl_Position = projectionMatrix * viewPosition;
                    opacity = particleOpacity;
                    seed = particleSeed;
                    expansion = clamp((particleSize - 0.12) / 1.25, 0.0, 1.0);
                }
            `,
      fragmentShader: `
                uniform vec3 smokeColor;
                uniform float time;
                varying float opacity;
                varying float seed;
                varying float expansion;

                float hash(vec2 p) {
                    vec3 q = fract(vec3(p.xyx) * 0.1031);
                    q += dot(q, q.yzx + 33.33);
                    return fract((q.x + q.y) * q.z);
                }
                float noise(vec2 p) {
                    vec2 cell = floor(p);
                    vec2 f = fract(p);
                    f = f * f * (3.0 - 2.0 * f);
                    return mix(mix(hash(cell), hash(cell + vec2(1.0, 0.0)), f.x),
                        mix(hash(cell + vec2(0.0, 1.0)), hash(cell + 1.0), f.x), f.y);
                }
                float fbm(vec2 p) {
                    return noise(p) * 0.57 + noise(p * 2.03 + 7.1) * 0.29
                        + noise(p * 4.07 + 17.3) * 0.14;
                }
                void main() {
                    if (opacity < 0.0001) discard;
                    vec2 uv = gl_PointCoord - 0.5;
                    float edge = 1.0 - smoothstep(0.32, 0.5, max(abs(uv.x), abs(uv.y)));
                    float angle = seed * 6.283185 + time * (seed - 0.5) * 0.12;
                    uv = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * uv;
                    // Advected, warped density breaks the circular point silhouette without glowing blending.
                    vec2 field = uv * 4.0 + seed * 23.0 - vec2(0.0, time * 0.16);
                    vec2 warp = vec2(noise(field + 3.7), noise(field + 19.1)) - 0.5;
                    float density = fbm(field + warp * 1.3);
                    vec2 shape = uv + warp * (0.08 + expansion * 0.13);
                    float envelope = exp(-dot(shape * vec2(1.25, 0.85), shape * vec2(1.25, 0.85)) * 12.0);
                    float wisps = smoothstep(0.22, 0.78, density);
                    float alpha = opacity * envelope * edge * mix(0.25, 1.4, wisps);
                    if (alpha < 0.001) discard;
                    gl_FragColor = vec4(smokeColor * mix(0.8, 1.08, density), alpha);
                    #include <tonemapping_fragment>
                    #include <colorspace_fragment>
                }
            `,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    // Particle positions are world coordinates; move only the emitter, not this object.
    this.points.frustumCulled = false;
    const viewport = new THREE.Vector2();
    this.points.onBeforeRender = (renderer) => {
      this.material.uniforms.viewportHeight.value =
        renderer.getDrawingBufferSize(viewport).y;
    };
    this.setSmokeDensity(CONFIG.smokeDensity);
    this.setWindStrength(CONFIG.windStrength);
    scene.add(this.points);
  }

  random() {
    this.randomState =
      (Math.imul(this.randomState, 1664525) + 1013904223) >>> 0;
    return this.randomState / 4294967296;
  }

  resetParticle(index, delay = 0) {
    const offset = index * 3;
    this.positions[offset] = this.emitterPosition.x;
    this.positions[offset + 1] = this.emitterPosition.y;
    this.positions[offset + 2] = this.emitterPosition.z;
    this.spawnHeights[index] = this.emitterPosition.y;
    const angle = this.seeds[index] * Math.PI * 2;
    this.velocities[offset] = Math.cos(angle) * 0.025;
    this.velocities[offset + 1] = 0.55;
    this.velocities[offset + 2] = Math.sin(angle) * 0.025;
    this.ages[index] = -delay;
    this.lifetimes[index] = 4 + this.random() * 3;
    this.sizes[index] = 0.12;
    this.opacities[index] = 0;
  }

  update(deltaTime) {
    if (!Number.isFinite(deltaTime) || deltaTime <= 0) return;
    // ponytail: cap background-tab gaps at 100 ms; use substeps if real-time catch-up is needed.
    const dt = Math.min(deltaTime, 0.1);
    this.time += dt;
    this.material.uniforms.time.value = this.time;
    const response = 1 - Math.exp(-dt * 3);
    const epsilon = 0.08;
    for (let i = 0; i < this.density; i++) {
      const previousAge = this.ages[i];
      this.ages[i] += dt;
      if (this.ages[i] < 0) continue;
      if (previousAge < 0) {
        this.resetParticle(i);
        continue;
      }

      const offset = i * 3;
      const x = this.positions[offset];
      const y = this.positions[offset + 1];
      const z = this.positions[offset + 2];
      const progress = this.ages[i] / this.lifetimes[i];
      if (progress >= 1 || y - this.spawnHeights[i] >= MAX_HEIGHT) {
        this.resetParticle(i);
        continue;
      }

      const height = Math.max(0, y - this.spawnHeights[i]);
      const turbulence =
        0.025 + THREE.MathUtils.smoothstep(height, 0.25, 1.8) * 0.28;
      const phase = this.time * 0.22;
      const nx = x * 1.3;
      const ny = y * 1.3 - phase;
      const nz = z * 1.3;
      // Curl of two evolving Simplex potentials: coherent rolls, not unrelated sideways jitter.
      const curlX =
        (this.noise.noise(nx, ny + epsilon) -
          this.noise.noise(nx, ny - epsilon)) /
        (2 * epsilon);
      const curlZ =
        (this.noise.noise(nz + 31, ny + epsilon) -
          this.noise.noise(nz + 31, ny - epsilon)) /
        (2 * epsilon);
      const curlY =
        -(
          this.noise.noise(nx + epsilon, ny) -
          this.noise.noise(nx - epsilon, ny) +
          this.noise.noise(nz + 31 + epsilon, ny) -
          this.noise.noise(nz + 31 - epsilon, ny)
        ) /
        (2 * epsilon);
      const spread = Math.sin(this.seeds[i] * Math.PI * 2 + phase) * 0.06;
      const targetX = this.windStrength + curlX * turbulence + spread;
      const targetY = Math.max(0.25, 0.65 + curlY * turbulence * 0.35);
      const targetZ =
        curlZ * turbulence +
        Math.cos(this.seeds[i] * Math.PI * 2 + phase) * 0.06;
      this.velocities[offset] += (targetX - this.velocities[offset]) * response;
      this.velocities[offset + 1] +=
        (targetY - this.velocities[offset + 1]) * response;
      this.velocities[offset + 2] +=
        (targetZ - this.velocities[offset + 2]) * response;
      this.positions[offset] += this.velocities[offset] * dt;
      this.positions[offset + 1] += this.velocities[offset + 1] * dt;
      this.positions[offset + 2] += this.velocities[offset + 2] * dt;
      this.sizes[i] = 0.12 + progress ** 0.85 * 1.25;
      this.opacities[i] =
        0.09 * Math.min(this.ages[i] / 0.15, 1) * (1 - progress) ** 1.4;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.particleSize.needsUpdate = true;
    this.geometry.attributes.particleOpacity.needsUpdate = true;
  }

  // Density is an active particle count, clamped to 0–2000.
  setSmokeDensity(val) {
    if (!Number.isFinite(val)) return;
    const density = Math.round(THREE.MathUtils.clamp(val, 0, MAX_PARTICLES));
    for (let i = this.density; i < density; i++) {
      this.resetParticle(i, this.random() * 6);
    }
    this.density = density;
    this.geometry.setDrawRange(0, density);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.particleSize.needsUpdate = true;
    this.geometry.attributes.particleOpacity.needsUpdate = true;
  }

  // Signed wind along world X, in scene units per second.
  setWindStrength(val) {
    if (Number.isFinite(val))
      this.windStrength = THREE.MathUtils.clamp(val, -3, 3);
  }

  // Pass the ember's world position; existing smoke remains where it was emitted.
  updateEmitterPosition(pos) {
    if (
      !pos ||
      !Number.isFinite(pos.x) ||
      !Number.isFinite(pos.y) ||
      !Number.isFinite(pos.z)
    )
      return;
    this.emitterPosition.copy(pos);
  }

  dispose() {
    this.points.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}