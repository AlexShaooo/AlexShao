/**
 * Biological tube-like connections (axons) between neurons.
 * Each tube bulges near the neuron somas and narrows in the middle.
 * Merged into a single BufferGeometry for one draw call.
 */
import * as THREE from 'three';
import type { Network, Signal } from '../network';
import {
  getColors,
  TUBE_SEGMENTS, RADIAL_SEGMENTS,
  TUBE_MAX_RADIUS, TUBE_MIN_RADIUS, TUBE_TAPER_POWER, TUBE_OPACITY,
  GLOW_SPREAD,
} from './visual';

const initColors = getColors();
const BASE_COLOR = new THREE.Color(initColors.filamentBase);
const GLOW_COLOR = new THREE.Color(initColors.filamentGlow);

export function buildFilaments(
  network: Network,
  scene: THREE.Scene,
): { updateSignals: (signals: Signal[]) => void } {
  const { connectionCount, connectionSrc, connectionDst, positions, config } = network;
  const ppc = TUBE_SEGMENTS + 1;             // points per curve
  const vpc = ppc * RADIAL_SEGMENTS;         // vertices per connection
  const trisPerConn = TUBE_SEGMENTS * RADIAL_SEGMENTS * 2;

  // --- Build curved paths ---
  const pathData = new Float32Array(connectionCount * ppc * 3);
  const srcV = new THREE.Vector3();
  const dstV = new THREE.Vector3();

  for (let c = 0; c < connectionCount; c++) {
    const si = connectionSrc[c];
    const di = connectionDst[c];
    srcV.set(positions[si * 3], positions[si * 3 + 1], positions[si * 3 + 2]);
    dstV.set(positions[di * 3], positions[di * 3 + 1], positions[di * 3 + 2]);
    writeCurvePoints(srcV, dstV, pathData, c * ppc * 3);
  }

  // --- Build merged tube geometry ---
  const totalVerts = connectionCount * vpc;
  const totalIndices = connectionCount * trisPerConn * 3;
  const vertPos = new Float32Array(totalVerts * 3);
  const vertCol = new Float32Array(totalVerts * 3);
  const indices = new Uint32Array(totalIndices);

  const tangent = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const binormal = new THREE.Vector3();
  const prevNormal = new THREE.Vector3();
  const pt = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 1, 0);
  const _right = new THREE.Vector3(1, 0, 0);

  for (let c = 0; c < connectionCount; c++) {
    const pathBase = c * ppc * 3;
    const vertBase = c * vpc;
    const idxBase = c * trisPerConn * 3;

    for (let i = 0; i < ppc; i++) {
      const pi = pathBase + i * 3;
      pt.set(pathData[pi], pathData[pi + 1], pathData[pi + 2]);

      // Tangent: forward difference (reuse last for final point)
      if (i < ppc - 1) {
        tangent.set(
          pathData[pi + 3] - pathData[pi],
          pathData[pi + 4] - pathData[pi + 1],
          pathData[pi + 5] - pathData[pi + 2],
        ).normalize();
      }

      // Normal frame with continuity (minimally-rotating frame)
      if (i === 0) {
        if (Math.abs(tangent.y) < 0.9) {
          normal.crossVectors(tangent, _up).normalize();
        } else {
          normal.crossVectors(tangent, _right).normalize();
        }
      } else {
        const dot = prevNormal.dot(tangent);
        normal.copy(prevNormal).addScaledVector(tangent, -dot);
        const len = normal.length();
        if (len > 1e-6) normal.divideScalar(len);
      }
      binormal.crossVectors(tangent, normal).normalize();
      prevNormal.copy(normal);

      // Radius profile: bulges at endpoints, narrow in the middle
      // cos²(t·π) → 1 at t=0 and t=1, 0 at t=0.5
      const t = i / TUBE_SEGMENTS;
      const cosV = Math.cos(t * Math.PI);
      const c4 = Math.pow(cosV * cosV, TUBE_TAPER_POWER / 2); // cos^n taper
      const radius = TUBE_MIN_RADIUS + (TUBE_MAX_RADIUS - TUBE_MIN_RADIUS) * c4;

      // Ring of vertices
      for (let j = 0; j < RADIAL_SEGMENTS; j++) {
        const angle = (j / RADIAL_SEGMENTS) * Math.PI * 2;
        const ca = Math.cos(angle);
        const sa = Math.sin(angle);
        const vi = (vertBase + i * RADIAL_SEGMENTS + j) * 3;

        vertPos[vi] = pt.x + (normal.x * ca + binormal.x * sa) * radius;
        vertPos[vi + 1] = pt.y + (normal.y * ca + binormal.y * sa) * radius;
        vertPos[vi + 2] = pt.z + (normal.z * ca + binormal.z * sa) * radius;

        vertCol[vi] = BASE_COLOR.r;
        vertCol[vi + 1] = BASE_COLOR.g;
        vertCol[vi + 2] = BASE_COLOR.b;
      }
    }

    // Triangle indices connecting adjacent rings
    let idx = idxBase;
    for (let i = 0; i < TUBE_SEGMENTS; i++) {
      for (let j = 0; j < RADIAL_SEGMENTS; j++) {
        const a = vertBase + i * RADIAL_SEGMENTS + j;
        const b = vertBase + i * RADIAL_SEGMENTS + (j + 1) % RADIAL_SEGMENTS;
        const c2 = vertBase + (i + 1) * RADIAL_SEGMENTS + j;
        const d = vertBase + (i + 1) * RADIAL_SEGMENTS + (j + 1) % RADIAL_SEGMENTS;

        indices[idx++] = a;
        indices[idx++] = b;
        indices[idx++] = c2;
        indices[idx++] = b;
        indices[idx++] = d;
        indices[idx++] = c2;
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(vertPos, 3));
  const colorAttr = new THREE.BufferAttribute(vertCol, 3);
  geo.setAttribute('color', colorAttr);
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  // geo.computeVertexNormals();

  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: TUBE_OPACITY,
    side: THREE.DoubleSide,
    fog: true,
    depthWrite: false,
  });

  const tubeMesh = new THREE.Mesh(geo, mat);
  tubeMesh.renderOrder = -1;
  scene.add(tubeMesh);

  // --- Theme change ---
  window.addEventListener('theme-change', () => {
    const c = getColors();
    BASE_COLOR.set(c.filamentBase);
    GLOW_COLOR.set(c.filamentGlow);
  });

  // --- Signal glow state ---
  const connGlow = new Float32Array(connectionCount);
  const connActive = new Uint8Array(connectionCount);
  const connReversed = new Uint8Array(connectionCount); // 1 if signal travels dst→src

  function updateSignals(signals: Signal[]): void {
    connActive.fill(0);

    for (const sig of signals) {
      connActive[sig.connIdx] = 1;
      if (sig.t > connGlow[sig.connIdx]) {
        connGlow[sig.connIdx] = sig.t;
        // Signal is reversed if the firing neuron is the connection's dst end
        connReversed[sig.connIdx] = (sig.srcNeuron === connectionDst[sig.connIdx]) ? 1 : 0;
      }
    }

    for (let c = 0; c < connectionCount; c++) {
      const vBase = c * vpc;

      if (!connActive[c]) {
        for (let v = 0; v < vpc; v++) {
          const idx = (vBase + v) * 3;
          vertCol[idx] = BASE_COLOR.r;
          vertCol[idx + 1] = BASE_COLOR.g;
          vertCol[idx + 2] = BASE_COLOR.b;
        }
        connGlow[c] = 0;
        continue;
      }

      const sigT = connGlow[c];
      // Smooth ramp at source: glow eases in as signal departs
      const sourceRamp = Math.min(1, sigT / config.sourceRamp);
      // Smooth fade at destination: glow fades out as signal passes t=1.0
      const destFade = sigT > 1.0 ? Math.max(0, 1 - (sigT - 1.0) / config.destFade) : 1.0;

      // Color each ring: glow at signal head + trail behind it
      const reversed = connReversed[c];
      for (let i = 0; i < ppc; i++) {
        // If reversed, flip the parametric position so glow travels dst→src
        const t = reversed ? 1.0 - i / TUBE_SEGMENTS : i / TUBE_SEGMENTS;
        // Clamp sigT to 1.0 for position calc so glow stays at the end during fade-out
        const effectiveSigT = Math.min(sigT, 1.0);
        const dist = t - effectiveSigT;
        // Glow ahead of signal (narrow) + trail behind (wider, fading)
        let intensity: number;
        if (dist > 0) {
          intensity = Math.max(0, 1 - dist / (GLOW_SPREAD * 0.5));
        } else {
          intensity = Math.max(0, 1 + dist / (GLOW_SPREAD * 1.5));
        }
        intensity *= sourceRamp * destFade;

        for (let j = 0; j < RADIAL_SEGMENTS; j++) {
          const idx = (vBase + i * RADIAL_SEGMENTS + j) * 3;
          vertCol[idx] = BASE_COLOR.r + (GLOW_COLOR.r - BASE_COLOR.r) * intensity;
          vertCol[idx + 1] = BASE_COLOR.g + (GLOW_COLOR.g - BASE_COLOR.g) * intensity;
          vertCol[idx + 2] = BASE_COLOR.b + (GLOW_COLOR.b - BASE_COLOR.b) * intensity;
        }
      }

      connGlow[c] = 0;
    }

    mat.opacity = TUBE_OPACITY;
    colorAttr.needsUpdate = true;
  }

  return { updateSignals };
}

// ---------------------------------------------------------------------------
// Curve construction — organic wavy paths
// ---------------------------------------------------------------------------

const _dir = new THREE.Vector3();
const _p1 = new THREE.Vector3();
const _p2 = new THREE.Vector3();
const _upC = new THREE.Vector3(0, 1, 0);
const _rightC = new THREE.Vector3(1, 0, 0);

function writeCurvePoints(
  src: THREE.Vector3,
  dst: THREE.Vector3,
  out: Float32Array,
  offset: number,
): void {
  _dir.subVectors(dst, src);
  const len = _dir.length();
  _dir.normalize();

  if (Math.abs(_dir.y) < 0.9) {
    _p1.crossVectors(_dir, _upC).normalize();
  } else {
    _p1.crossVectors(_dir, _rightC).normalize();
  }
  _p2.crossVectors(_dir, _p1).normalize();

  const amp = len * 0.035;
  const phase1 = Math.random() * Math.PI * 2;
  const phase2 = Math.random() * Math.PI * 2;
  const freq = 1.5 + Math.random() * 1.5;

  for (let i = 0; i <= TUBE_SEGMENTS; i++) {
    const t = i / TUBE_SEGMENTS;
    const envelope = Math.sin(t * Math.PI); // tapers to zero at endpoints
    const wave1 = Math.sin(t * freq * Math.PI + phase1) * amp * envelope;
    const wave2 = Math.sin(t * freq * 1.3 * Math.PI + phase2) * amp * 0.6 * envelope;

    const idx = offset + i * 3;
    out[idx] = src.x + (dst.x - src.x) * t + _p1.x * wave1 + _p2.x * wave2;
    out[idx + 1] = src.y + (dst.y - src.y) * t + _p1.y * wave1 + _p2.y * wave2;
    out[idx + 2] = src.z + (dst.z - src.z) * t + _p1.z * wave1 + _p2.z * wave2;
  }
}
