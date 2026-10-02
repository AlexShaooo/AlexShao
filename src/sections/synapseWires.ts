/**
 * Organic dendrite wires connecting a cell body soma to nearby neurons.
 * Each wire originates tangent to the soma surface and carries animated
 * signal pulses when neurons fire nearby.
 * Uses ShaderMaterial with per-vertex fade to blend into the rim-shaded soma.
 */
import * as THREE from 'three';
import type { Network } from '../network';
import { getColors, GLOW_SPREAD, SOMA_RADIUS } from '../renderer/visual';

// ---------------------------------------------------------------------------
// Wire Parameters
// ---------------------------------------------------------------------------

const WIRE_COUNT            = 4;
const WIRE_TUBE_SEGMENTS    = 20;   // lengthwise subdivisions per wire
const WIRE_RADIAL_SEGMENTS  = 40;   // cross-section vertices
const WIRE_RADIUS_AT_NEURON = SOMA_RADIUS; // radius at the neuron end
const WIRE_TAPER_POWER      = 3.0;  // exponent controlling taper curve
const WIRE_OPACITY          = 0.3;
const WIRE_CURVE_AMP        = 0.04; // organic waviness amplitude (fraction of length)
const WIRE_RIM_POWER        = 3.0;  // Fresnel rim sharpness (separate from soma)
const WIRE_HOVER_FADE_SOMA   = 0.6;  // hover gold intensity at soma end (t=0)
const WIRE_HOVER_FADE_NEURON = 1.0;  // hover gold intensity at neuron end (t=1)

// Signal animation
const SIGNAL_FIRE_THRESHOLD = 0.05;
const SIGNAL_COOLDOWN       = 0.6;  // seconds between fires per wire

// Colors
const initColors = getColors();
const BASE_COLOR = new THREE.Color(initColors.filamentBase);
const GLOW_COLOR = new THREE.Color(initColors.filamentGlow);

window.addEventListener('theme-change', () => {
  const c = getColors();
  BASE_COLOR.set(c.filamentBase);
  GLOW_COLOR.set(c.filamentGlow);
});

// ---------------------------------------------------------------------------
// Wire Shaders
// ---------------------------------------------------------------------------

const wireVertexShader = /* glsl */ `
attribute float aFade;
attribute float aT;
attribute vec3  aTubeNormal;
varying vec3  vColor;
varying float vFade;
varying float vT;
varying vec3  vNormal;
varying vec3  vViewPos;

void main() {
  vColor  = color;
  vFade   = aFade;
  vT      = aT;
  vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
  vViewPos = mvPos.xyz;
  vNormal  = normalMatrix * aTubeNormal;
  gl_Position = projectionMatrix * mvPos;
}
`;

const wireFragmentShader = /* glsl */ `
uniform float uOpacity;
uniform float uRimPower;
uniform float uRimPowerNeuron;
uniform float uBaseOpacity;
varying vec3  vColor;
varying float vFade;
varying float vT;
varying vec3  vNormal;
varying vec3  vViewPos;

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(-vViewPos);

  // Interpolate rim power: soma end (t=0) uses uRimPower, neuron end (t=1) uses uRimPowerNeuron
  float rimPower = mix(uRimPower, uRimPowerNeuron, vT);

  // Fresnel rim: 1 at silhouette edges, 0 where normal faces camera
  float rim = 1.0 - abs(dot(N, V));
  rim = pow(rim, rimPower);

  float alpha = rim * uBaseOpacity * vFade * uOpacity;
  alpha = clamp(alpha, 0.0, 0.8);

  gl_FragColor = vec4(vColor, alpha);
}
`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WireSignal {
  wireIdx: number;
  t: number; // 0 = at neuron, 1 = at soma (signal travels inward)
}

export interface WirePulse {
  wireIdx: number;
  intensity: number;
}

export interface SynapseWireHandle {
  update(dt: number, avgActivation: number): void;
  setOpacity(opacity: number): void;
  setHovered(hovered: boolean, dt: number): void;
  mesh: THREE.Mesh;
  getActiveWirePulses(): WirePulse[];
  readonly neuronIndices: number[];  // network neuron indices connected to this soma
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findNearestNeurons(
  cx: number, cy: number, cz: number,
  positions: Float32Array,
  neuronCount: number,
  count: number,
): number[] {
  const dists: { idx: number; d: number }[] = [];
  for (let i = 0; i < neuronCount; i++) {
    const dx = positions[i * 3] - cx;
    const dy = positions[i * 3 + 1] - cy;
    const dz = positions[i * 3 + 2] - cz;
    dists.push({ idx: i, d: dx * dx + dy * dy + dz * dz });
  }
  dists.sort((a, b) => a.d - b.d);
  return dists.slice(0, count).map((d) => d.idx);
}

// ---------------------------------------------------------------------------
// Curve builder (organic waviness along straight path)
// ---------------------------------------------------------------------------

const _dir = new THREE.Vector3();
const _p1  = new THREE.Vector3();
const _p2  = new THREE.Vector3();
const _up  = new THREE.Vector3(0, 1, 0);
const _right = new THREE.Vector3(1, 0, 0);

function writeCurvePoints(
  src: THREE.Vector3, dst: THREE.Vector3,
  out: Float32Array, offset: number,
): void {
  _dir.subVectors(dst, src);
  const len = _dir.length();
  _dir.normalize();

  if (Math.abs(_dir.y) < 0.9) {
    _p1.crossVectors(_dir, _up).normalize();
  } else {
    _p1.crossVectors(_dir, _right).normalize();
  }
  _p2.crossVectors(_dir, _p1).normalize();

  const amp = len * WIRE_CURVE_AMP;
  const phase1 = Math.random() * Math.PI * 2;
  const phase2 = Math.random() * Math.PI * 2;
  const freq = 1.2 + Math.random() * 1.0;

  for (let i = 0; i <= WIRE_TUBE_SEGMENTS; i++) {
    const t = i / WIRE_TUBE_SEGMENTS;
    const envelope = Math.sin(t * Math.PI);
    const wave1 = Math.sin(t * freq * Math.PI + phase1) * amp * envelope;
    const wave2 = Math.sin(t * freq * 1.3 * Math.PI + phase2) * amp * 0.6 * envelope;

    const idx = offset + i * 3;
    out[idx]     = src.x + (dst.x - src.x) * t + _p1.x * wave1 + _p2.x * wave2;
    out[idx + 1] = src.y + (dst.y - src.y) * t + _p1.y * wave1 + _p2.y * wave2;
    out[idx + 2] = src.z + (dst.z - src.z) * t + _p1.z * wave1 + _p2.z * wave2;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface WireConfig {
  count?: number;
  opacity?: number;
  rimPower?: number;
  taperPower?: number;
}

export function createSynapseWires(
  somaCenter: THREE.Vector3,
  somaRadius: number,
  network: Network,
  scene: THREE.Scene,
  wireCfg?: WireConfig,
): SynapseWireHandle {
  const wireCount_  = wireCfg?.count      ?? WIRE_COUNT;
  const wireOpacity = wireCfg?.opacity    ?? WIRE_OPACITY;
  const wireRim     = wireCfg?.rimPower   ?? WIRE_RIM_POWER;
  const wireTaper   = wireCfg?.taperPower ?? WIRE_TAPER_POWER;

  const { positions, neuronCount, config } = network;

  // Find nearest neurons to the soma center
  const nearestIndices = findNearestNeurons(
    somaCenter.x, somaCenter.y, somaCenter.z,
    positions, neuronCount, wireCount_,
  );

  const ppc = WIRE_TUBE_SEGMENTS + 1; // points per curve
  const vpc = ppc * WIRE_RADIAL_SEGMENTS;
  const trisPerWire = WIRE_TUBE_SEGMENTS * WIRE_RADIAL_SEGMENTS * 2;
  const wireCount = nearestIndices.length;

  // Build paths: soma center → neuron
  const pathData = new Float32Array(wireCount * ppc * 3);
  const srcV = new THREE.Vector3();
  const dstV = new THREE.Vector3();

  for (let w = 0; w < wireCount; w++) {
    const ni = nearestIndices[w];
    dstV.set(positions[ni * 3], positions[ni * 3 + 1], positions[ni * 3 + 2]);
    srcV.copy(somaCenter);
    writeCurvePoints(srcV, dstV, pathData, w * ppc * 3);
  }

  // Build tube geometry
  const totalVerts = wireCount * vpc;
  const totalIndices = wireCount * trisPerWire * 3;
  const vertPos = new Float32Array(totalVerts * 3);
  const vertCol = new Float32Array(totalVerts * 3);
  const vertNrm = new Float32Array(totalVerts * 3); // tube surface normals
  const vertFade = new Float32Array(totalVerts); // per-vertex fade: 0 inside soma, 1 outside
  const vertT    = new Float32Array(totalVerts); // parametric t: 0 at soma, 1 at neuron
  const indices = new Uint32Array(totalIndices);

  const tangent  = new THREE.Vector3();
  const normal   = new THREE.Vector3();
  const binormal = new THREE.Vector3();
  const prevNormal = new THREE.Vector3();
  const pt = new THREE.Vector3();
  const _upF = new THREE.Vector3(0, 1, 0);
  const _rightF = new THREE.Vector3(1, 0, 0);

  for (let w = 0; w < wireCount; w++) {
    const pathBase = w * ppc * 3;
    const vertBase = w * vpc;
    const idxBase  = w * trisPerWire * 3;

    for (let i = 0; i < ppc; i++) {
      const pi = pathBase + i * 3;
      pt.set(pathData[pi], pathData[pi + 1], pathData[pi + 2]);

      if (i < ppc - 1) {
        tangent.set(
          pathData[pi + 3] - pathData[pi],
          pathData[pi + 4] - pathData[pi + 1],
          pathData[pi + 5] - pathData[pi + 2],
        ).normalize();
      }

      if (i === 0) {
        if (Math.abs(tangent.y) < 0.9) {
          normal.crossVectors(tangent, _upF).normalize();
        } else {
          normal.crossVectors(tangent, _rightF).normalize();
        }
      } else {
        const dot = prevNormal.dot(tangent);
        normal.copy(prevNormal).addScaledVector(tangent, -dot);
        const len = normal.length();
        if (len > 1e-6) normal.divideScalar(len);
      }
      binormal.crossVectors(tangent, normal).normalize();
      prevNormal.copy(normal);

      // Radius taper: wide at soma (t=0), thin at neuron (t=1)
      const t = i / WIRE_TUBE_SEGMENTS;
      const taper = Math.pow(1 - t, wireTaper);
      const radius = WIRE_RADIUS_AT_NEURON + (somaRadius - WIRE_RADIUS_AT_NEURON) * taper;

      for (let j = 0; j < WIRE_RADIAL_SEGMENTS; j++) {
        const angle = (j / WIRE_RADIAL_SEGMENTS) * Math.PI * 2;
        const ca = Math.cos(angle);
        const sa = Math.sin(angle);
        const vi = vertBase + i * WIRE_RADIAL_SEGMENTS + j;
        const vi3 = vi * 3;

        // Tube surface normal: radial direction from centerline
        const nx = normal.x * ca + binormal.x * sa;
        const ny = normal.y * ca + binormal.y * sa;
        const nz = normal.z * ca + binormal.z * sa;

        const vx = pt.x + nx * radius;
        const vy = pt.y + ny * radius;
        const vz = pt.z + nz * radius;

        vertPos[vi3]     = vx;
        vertPos[vi3 + 1] = vy;
        vertPos[vi3 + 2] = vz;

        vertNrm[vi3]     = nx;
        vertNrm[vi3 + 1] = ny;
        vertNrm[vi3 + 2] = nz;

        vertCol[vi3]     = BASE_COLOR.r;
        vertCol[vi3 + 1] = BASE_COLOR.g;
        vertCol[vi3 + 2] = BASE_COLOR.b;

        // Fade based on distance from soma center:
        // 0 inside sphere, ramp to 1 over a short transition band outside
        const dx = vx - somaCenter.x;
        const dy = vy - somaCenter.y;
        const dz = vz - somaCenter.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        const dist = Math.sqrt(distSq);
        // Smooth ramp: 0 at somaRadius, 1 at somaRadius * 1.3
        const fadeStart = somaRadius * 0.9;
        const fadeEnd   = somaRadius * 1.4;
        vertFade[vi] = Math.min(1, Math.max(0, (dist - fadeStart) / (fadeEnd - fadeStart)));
        vertT[vi] = t;
      }
    }

    // Triangle indices
    let idx = idxBase;
    for (let i = 0; i < WIRE_TUBE_SEGMENTS; i++) {
      for (let j = 0; j < WIRE_RADIAL_SEGMENTS; j++) {
        const a = vertBase + i * WIRE_RADIAL_SEGMENTS + j;
        const b = vertBase + i * WIRE_RADIAL_SEGMENTS + (j + 1) % WIRE_RADIAL_SEGMENTS;
        const c = vertBase + (i + 1) * WIRE_RADIAL_SEGMENTS + j;
        const d = vertBase + (i + 1) * WIRE_RADIAL_SEGMENTS + (j + 1) % WIRE_RADIAL_SEGMENTS;

        indices[idx++] = a;
        indices[idx++] = b;
        indices[idx++] = c;
        indices[idx++] = b;
        indices[idx++] = d;
        indices[idx++] = c;
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(vertPos, 3));
  const colorAttr = new THREE.BufferAttribute(vertCol, 3);
  geo.setAttribute('color', colorAttr);
  geo.setAttribute('aTubeNormal', new THREE.BufferAttribute(vertNrm, 3));
  geo.setAttribute('aFade', new THREE.BufferAttribute(vertFade, 1));
  geo.setAttribute('aT', new THREE.BufferAttribute(vertT, 1));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));

  const uniforms = {
    uOpacity:        { value: 1.0 },
    uBaseOpacity:    { value: wireOpacity },
    uRimPower:       { value: wireRim },
    uRimPowerNeuron: { value: 0.0 },  // softer/thicker rim at neuron end to match synapses
  };

  const mat = new THREE.ShaderMaterial({
    vertexShader: wireVertexShader,
    fragmentShader: wireFragmentShader,
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
    vertexColors: true,
  });

  const mesh = new THREE.Mesh(geo, mat);
  scene.add(mesh);

  // --- Signal state ---
  const signals: WireSignal[] = [];
  const wireCooldowns = new Float32Array(wireCount);
  let hoverBlend = 0;

  function update(dt: number, avgActivation: number): void {
    // Advance cooldowns
    for (let i = 0; i < wireCount; i++) {
      if (wireCooldowns[i] > 0) wireCooldowns[i] -= dt;
    }

    // Fire new signals when activation is high (only when not hovered)
    if (hoverBlend < 0.5 && avgActivation > SIGNAL_FIRE_THRESHOLD) {
      for (let w = 0; w < wireCount; w++) {
        if (wireCooldowns[w] <= 0 && Math.random() < avgActivation * 2 * dt) {
          signals.push({ wireIdx: w, t: 0 });
          wireCooldowns[w] = SIGNAL_COOLDOWN;
        }
      }
    }

    // Advance and remove dead signals
    for (let i = signals.length - 1; i >= 0; i--) {
      signals[i].t += config.signalSpeed * dt;
      if (signals[i].t > config.signalEnd) {
        signals.splice(i, 1);
      }
    }

    // Reset colors to base
    for (let v = 0; v < totalVerts * 3; v += 3) {
      vertCol[v]     = BASE_COLOR.r;
      vertCol[v + 1] = BASE_COLOR.g;
      vertCol[v + 2] = BASE_COLOR.b;
    }

    if (hoverBlend > 0.01) {
      // Hover mode: solid gold on all wires, fading from soma (t=0) outward
      for (let w = 0; w < wireCount; w++) {
        const vBase = w * vpc;
        for (let i = 0; i < ppc; i++) {
          const t = i / WIRE_TUBE_SEGMENTS;
          // Fade intensity: subtle near soma (t=0), lighter at neuron (t=1)
          const fade = WIRE_HOVER_FADE_SOMA + (WIRE_HOVER_FADE_NEURON - WIRE_HOVER_FADE_SOMA) * t;
          const intensity = fade * hoverBlend;
          for (let j = 0; j < WIRE_RADIAL_SEGMENTS; j++) {
            const vi = (vBase + i * WIRE_RADIAL_SEGMENTS + j) * 3;
            vertCol[vi]     = BASE_COLOR.r + (GLOW_COLOR.r - BASE_COLOR.r) * intensity;
            vertCol[vi + 1] = BASE_COLOR.g + (GLOW_COLOR.g - BASE_COLOR.g) * intensity;
            vertCol[vi + 2] = BASE_COLOR.b + (GLOW_COLOR.b - BASE_COLOR.b) * intensity;
          }
        }
      }
    }

    // Apply glow from active signals (layered on top of hover)
    for (const sig of signals) {
      const vBase = sig.wireIdx * vpc;
      const sourceRamp = Math.min(1, sig.t / config.sourceRamp);
      const destFade = sig.t > 1.0 ? Math.max(0, 1 - (sig.t - 1.0) / config.destFade) : 1.0;

      for (let i = 0; i < ppc; i++) {
        const t = i / WIRE_TUBE_SEGMENTS;
        // Flip: path t=0 is soma, t=1 is neuron; signal travels inward (neuron→soma)
        const effectiveSigT = 1.0 - Math.min(sig.t, 1.0);
        const dist = t - effectiveSigT;
        let intensity: number;
        if (dist > 0) {
          intensity = Math.max(0, 1 - dist / (GLOW_SPREAD * 0.5));
        } else {
          intensity = Math.max(0, 1 + dist / (GLOW_SPREAD * 1.5));
        }
        intensity *= sourceRamp * destFade;

        for (let j = 0; j < WIRE_RADIAL_SEGMENTS; j++) {
          const vi = (vBase + i * WIRE_RADIAL_SEGMENTS + j) * 3;
          vertCol[vi]     = Math.max(vertCol[vi],     BASE_COLOR.r + (GLOW_COLOR.r - BASE_COLOR.r) * intensity);
          vertCol[vi + 1] = Math.max(vertCol[vi + 1], BASE_COLOR.g + (GLOW_COLOR.g - BASE_COLOR.g) * intensity);
          vertCol[vi + 2] = Math.max(vertCol[vi + 2], BASE_COLOR.b + (GLOW_COLOR.b - BASE_COLOR.b) * intensity);
        }
      }
    }

    colorAttr.needsUpdate = true;
  }

  function setOpacity(opacity: number): void {
    uniforms.uOpacity.value = Math.max(opacity, 0.3);
  }

  function setHovered(hovered: boolean, dt: number): void {
    const target = hovered ? 1 : 0;
    const speed = 2.0;
    hoverBlend += (target - hoverBlend) * Math.min(1, speed * dt);
  }

  function getActiveWirePulses(): WirePulse[] {
    const perWire = new Float32Array(wireCount);
    for (const sig of signals) {
      if (sig.t > 0.5) {
        const intensity = Math.max(0, 1 - Math.abs(sig.t - 1.0) / 0.4);
        perWire[sig.wireIdx] = Math.max(perWire[sig.wireIdx], intensity);
      }
    }
    const result: WirePulse[] = [];
    for (let w = 0; w < wireCount; w++) {
      if (perWire[w] > 0) {
        result.push({ wireIdx: w, intensity: perWire[w] });
      }
    }
    return result;
  }

  return { update, setOpacity, setHovered, mesh, getActiveWirePulses, neuronIndices: nearestIndices };
}
