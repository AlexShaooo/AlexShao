/**
 * Neuron cell body (soma) — sphere with Fresnel rim shading.
 * Edges (cell membrane) are visible; center is transparent.
 * Created before synapse wires so wires can originate from its surface.
 */
import * as THREE from 'three';
import { getColors } from '../renderer/visual';
import { getMode } from '../theme';
import type { CellBodyConfig } from './sectionConfig';

// ---------------------------------------------------------------------------
// Cell Body Soma Parameters
// ---------------------------------------------------------------------------

export const CELL_SOMA_RADIUS   = 16.0;
const initColors = getColors();
const CELL_BACKGROUND_COLOR = new THREE.Color(initColors.somaDim);
const CELL_SOMA_COLOR    = new THREE.Color(initColors.filamentBase);
const CELL_HOVER_COLOR   = new THREE.Color(initColors.filamentGlow); // gold rim on hover
const CELL_SOMA_OPACITY  = 0.8;   // peak opacity at rim edge
const CELL_SOMA_CORE_OPACITY = 0.0; // opacity of the white center fill
const CELL_SOMA_DEFORMATION  = 0.05; // pebble deformation (fraction of radius)
export const CELL_SOMA_RIM_POWER = 3.0;   // sharpness of rim falloff (higher = thinner rim)
const CELL_SOMA_SEGMENTS = 50;
const CELL_SOMA_RINGS    = 50;

// ---------------------------------------------------------------------------
// Shaders
// ---------------------------------------------------------------------------

const vertexShader = /* glsl */ `
varying vec3 vNormal;
varying vec3 vViewPos;

void main() {
  vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
  vViewPos = mvPos.xyz;
  vNormal = normalMatrix * normal;
  gl_Position = projectionMatrix * mvPos;
}
`;

const fragmentShader = /* glsl */ `
uniform vec3  uColor;
uniform vec3  uCoreColor;
uniform float uBaseOpacity;
uniform float uCoreOpacity;
uniform float uRimPower;
uniform float uSectionOpacity;

varying vec3 vNormal;
varying vec3 vViewPos;

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(-vViewPos);

  // Fresnel rim: 1 at edges, 0 at center
  float rim = 1.0 - abs(dot(N, V));
  rim = pow(rim, uRimPower);

  // Blend core color → colored rim
  vec3 col = mix(uCoreColor, uColor, rim);

  // Alpha: solid white core + stronger rim edge
  float alpha = max(uCoreOpacity, rim * uBaseOpacity) * uSectionOpacity;
  alpha = clamp(alpha, 0.0, 1.0);

  gl_FragColor = vec4(col, alpha);
}
`;

// ---------------------------------------------------------------------------
// Handle
// ---------------------------------------------------------------------------

export interface CellBodyHandle {
  update(opacity: number): void;
  setHovered(hovered: boolean, dt: number): void;
  updateTheme(): void;
  mesh: THREE.Mesh;
  radius: number;
}

export function createCellBody(sectionZ: number, cfg?: CellBodyConfig): CellBodyHandle {
  const radius   = cfg?.radius   ?? CELL_SOMA_RADIUS;
  const color    = cfg?.color    ?? CELL_SOMA_COLOR;
  const opacity  = cfg?.opacity  ?? CELL_SOMA_OPACITY;
  const rimPower = cfg?.rimPower ?? CELL_SOMA_RIM_POWER;
  const x        = cfg?.x        ?? 0;
  const y        = cfg?.y        ?? 0;
  const zOffset  = cfg?.zOffset  ?? radius;

  const deformation = cfg?.deformation ?? CELL_SOMA_DEFORMATION;

  const geo = new THREE.SphereGeometry(
    radius,
    CELL_SOMA_SEGMENTS,
    CELL_SOMA_RINGS,
  );

  // Pebble deformation: perturb vertices outward with smooth sine-sum noise
  if (deformation > 0) {
    const posAttr = geo.attributes.position;
    const nrmAttr = geo.attributes.normal;
    const amp = radius * deformation;

    // 5 random sine-wave octaves for organic lumps
    const octaves: { fx: number; fy: number; fz: number; px: number; py: number; pz: number; w: number }[] = [];
    for (let k = 0; k < 5; k++) {
      octaves.push({
        fx: 1.5 + Math.random() * 3,
        fy: 1.5 + Math.random() * 3,
        fz: 1.5 + Math.random() * 3,
        px: Math.random() * Math.PI * 2,
        py: Math.random() * Math.PI * 2,
        pz: Math.random() * Math.PI * 2,
        w: 1 / (k + 1), // lower octaves have more weight
      });
    }
    const totalWeight = octaves.reduce((s, o) => s + o.w, 0);

    for (let i = 0; i < posAttr.count; i++) {
      const nx = nrmAttr.getX(i);
      const ny = nrmAttr.getY(i);
      const nz = nrmAttr.getZ(i);

      // Sum sine waves using the unit normal as input direction
      let noise = 0;
      for (const o of octaves) {
        const v = Math.sin(nx * o.fx + o.px)
                * Math.sin(ny * o.fy + o.py)
                * Math.sin(nz * o.fz + o.pz);
        noise += v * o.w;
      }
      noise /= totalWeight;

      // Map from [-1,1] to [0,1] — always push outward (>= radius)
      const bump = (noise * 0.5 + 0.5) * amp;

      posAttr.setXYZ(i,
        posAttr.getX(i) + nx * bump,
        posAttr.getY(i) + ny * bump,
        posAttr.getZ(i) + nz * bump,
      );
    }
    geo.computeVertexNormals();
  }

  const coreOpacity = cfg?.coreOpacity ?? CELL_SOMA_CORE_OPACITY;

  const uniforms = {
    uColor:          { value: color.clone() },
    uCoreColor:      { value: new THREE.Color(CELL_BACKGROUND_COLOR) },
    uBaseOpacity:    { value: opacity },
    uCoreOpacity:    { value: coreOpacity },
    uRimPower:       { value: rimPower },
    uSectionOpacity: { value: 1.0 },
  };

  const mat = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, sectionZ + zOffset);
  mesh.renderOrder = 1;

  const baseColor = color.clone();
  const currentColor = color.clone();
  let hoverBlend = 0;

  function update(sectionOpacity: number): void {
    uniforms.uSectionOpacity.value = sectionOpacity;
    mesh.visible = sectionOpacity > 0.001;
  }

  function setHovered(hovered: boolean, dt: number): void {
    const target = hovered ? 1 : 0;
    const speed = 6.0; // transition speed
    hoverBlend += (target - hoverBlend) * Math.min(1, speed * dt);
    currentColor.copy(baseColor).lerp(CELL_HOVER_COLOR, hoverBlend);
    uniforms.uColor.value.copy(currentColor);
  }

  function updateTheme(): void {
    const c = getColors();
    const isDark = getMode() === 'dark';
    CELL_BACKGROUND_COLOR.set(c.somaDim);
    CELL_SOMA_COLOR.set(c.filamentBase);
    CELL_HOVER_COLOR.set(c.filamentGlow);
    baseColor.copy(CELL_SOMA_COLOR);
    currentColor.copy(CELL_SOMA_COLOR);
    uniforms.uColor.value.copy(CELL_SOMA_COLOR);
    uniforms.uCoreColor.value.copy(CELL_BACKGROUND_COLOR);
  }

  return { update, setHovered, updateTheme, mesh, radius };
}
