/**
 * Circular blob background for sections.
 * Pure circle with hard outer contour (cell membrane style) and fast inward fade.
 * Always-visible mode only — wire tubes handle the organic dendrite merge.
 */
import * as THREE from 'three';
import { getColors } from '../renderer/visual';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface BlobConfig {
  color: THREE.Color;
  baseOpacity: number;        // peak alpha at outer contour
  radius: number;             // blob radius in aspect-corrected space
  width: number;              // plane width
  height: number;             // plane height
  zOffset: number;            // local Z offset (positive = behind content)
}

const DEFAULTS: BlobConfig = {
  color: new THREE.Color(getColors().filamentBase),
  baseOpacity: 0.35,
  radius: 1.0,
  width: 32,
  height: 22,
  zOffset: 0.5,
};

// ---------------------------------------------------------------------------
// Handle
// ---------------------------------------------------------------------------

export interface SectionBlobHandle {
  update(sectionOpacity: number): void;
  updateTheme(): void;
  mesh: THREE.Mesh;
}

// ---------------------------------------------------------------------------
// Shader source
// ---------------------------------------------------------------------------

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = /* glsl */ `
uniform float uRadius;
uniform float uAspect;
uniform float uBaseOpacity;
uniform vec3  uColor;
uniform float uSectionOpacity;

varying vec2 vUv;

void main() {
  // Aspect-corrected centered coords
  vec2 c = (vUv - 0.5) * 2.0;
  c.x *= uAspect;

  // Circle SDF (negative = inside)
  float sdf = length(c) - uRadius;

  // Hard step at the boundary
  float outerMask = step(sdf, 0.0);

  // Fast exponential fade going inward (sdf is negative inside, so -sdf is depth)
  float innerFade = exp(sdf * 100.0);

  float contour = outerMask * innerFade;

  float alpha = contour * uBaseOpacity * uSectionOpacity;
  alpha = clamp(alpha, 0.0, 0.6);

  gl_FragColor = vec4(uColor, alpha);
}
`;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createSectionBlob(cfg: Partial<BlobConfig> = {}): SectionBlobHandle {
  const config: BlobConfig = { ...DEFAULTS, ...cfg };
  config.color = config.color.clone();

  const aspect = config.width / config.height;

  const geo = new THREE.PlaneGeometry(config.width, config.height);

  const uniforms = {
    uRadius:          { value: config.radius },
    uAspect:          { value: aspect },
    uBaseOpacity:     { value: config.baseOpacity },
    uColor:           { value: config.color },
    uSectionOpacity:  { value: 1.0 },
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
  mesh.renderOrder = -1;
  mesh.position.z = -config.zOffset;
  mesh.userData._isBlobPlane = true;

  function update(sectionOpacity: number): void {
    uniforms.uSectionOpacity.value = sectionOpacity;
    mesh.visible = sectionOpacity > 0.001;
  }

  function updateTheme(): void {
    uniforms.uColor.value.set(getColors().filamentBase);
  }

  return { update, updateTheme, mesh };
}
