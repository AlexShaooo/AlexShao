/**
 * Modular glass sphere using Three.js MeshPhysicalMaterial transmission.
 *
 * Provides a physically-based glass look (refraction, Fresnel reflections,
 * optional frosting and color tint) that can be dropped into any scene.
 *
 * Usage:
 *   const glass = createGlassSphere({ radius: 16, tint: 0xc9a84c });
 *   scene.add(glass.mesh);
 *   // In animation loop:
 *   glass.update(sectionOpacity);
 */
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface GlassSphereConfig {
  /** Label for identification (e.g. 'top', 'bottom'). */
  label?: string;
  /** X offset from reference position. Default 0. */
  x?: number;
  /** Y offset from reference position. Default 0. */
  y?: number;
  /** Z offset from reference position. Default 0. */
  zOffset?: number;
  /** Sphere radius. Default 16. */
  radius?: number;
  /** Geometry detail (width/height segments). Default 64. */
  segments?: number;
  /** Index of refraction. 1.0 = air, 1.33 = water, 1.5 = glass, 2.4 = diamond. Default 1.5. */
  ior?: number;
  /** Transmission amount 0–1. 1 = fully transparent glass. Default 1.0. */
  transmission?: number;
  /** Surface roughness 0–1. 0 = crystal clear, ~0.2 = frosted. Default 0.05. */
  roughness?: number;
  /** Virtual thickness for refraction distortion. Default 0.5. */
  thickness?: number;
  /** Metalness. Keep low for glass (0). Default 0. */
  metalness?: number;
  /** Reflectivity fallback (0–1). Default 0.5. */
  reflectivity?: number;
  /** Glass tint color. Default white (no tint). */
  tint?: number | THREE.Color;
  /** Clearcoat layer intensity 0–1. Adds an extra specular layer. Default 1.0. */
  clearcoat?: number;
  /** Clearcoat roughness. Default 0.1. */
  clearcoatRoughness?: number;
  /** Environment map for reflections (optional but recommended). */
  envMap?: THREE.Texture | null;
  /** Environment map intensity. Default 1.0. */
  envMapIntensity?: number;
  /** Attenuation color — color light turns as it passes through. Default white. */
  attenuationColor?: number | THREE.Color;
  /** Attenuation distance — how far light travels before full absorption. Default Infinity. */
  attenuationDistance?: number;
  /** Whether to apply pebble-style vertex deformation. Default false. */
  deform?: boolean;
  /** Deformation amplitude as fraction of radius. Default 0.05. */
  deformAmount?: number;
  /** Render order. Default 10. */
  renderOrder?: number;
}

// ---------------------------------------------------------------------------
// Handle
// ---------------------------------------------------------------------------

export interface GlassSphereHandle {
  mesh: THREE.Mesh;
  material: THREE.MeshPhysicalMaterial;
  /** Call each frame with section opacity (0–1) to fade in/out. */
  update(opacity: number): void;
  /** Dynamically update the glass tint. */
  setTint(color: number | THREE.Color): void;
  /** Dynamically update roughness (e.g. for frosting on hover). */
  setRoughness(r: number): void;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createGlassSphere(cfg?: GlassSphereConfig): GlassSphereHandle {
  const radius             = cfg?.radius             ?? 16;
  const segments           = cfg?.segments           ?? 64;
  const ior                = cfg?.ior                ?? 1.0;
  const transmission       = cfg?.transmission       ?? 1.0;
  const roughness          = cfg?.roughness          ?? 0.05;
  const thickness          = cfg?.thickness          ?? 0.5;
  const metalness          = cfg?.metalness          ?? 0;
  const reflectivity       = cfg?.reflectivity       ?? 0;
  const clearcoat          = cfg?.clearcoat          ?? 1.0;
  const clearcoatRoughness = cfg?.clearcoatRoughness ?? 0.1;
  const envMap             = cfg?.envMap             ?? null;
  const envMapIntensity    = cfg?.envMapIntensity    ?? 1.0;
  const renderOrder        = cfg?.renderOrder        ?? 10;
  const deform             = cfg?.deform             ?? false;
  const deformAmount       = cfg?.deformAmount       ?? 0.05;

  const tintColor = new THREE.Color(
    cfg?.tint instanceof THREE.Color ? cfg.tint : (cfg?.tint ?? 0xffffff),
  );
  const attColor = new THREE.Color(
    cfg?.attenuationColor instanceof THREE.Color
      ? cfg.attenuationColor
      : (cfg?.attenuationColor ?? 0xffffff),
  );
  const attDistance = cfg?.attenuationDistance ?? Infinity;

  // --- Geometry ---
  const geo = new THREE.SphereGeometry(radius, segments, segments);

  if (deform) {
    const posAttr = geo.attributes.position;
    const nrmAttr = geo.attributes.normal;
    const amp = radius * deformAmount;

    const octaves: { fx: number; fy: number; fz: number; px: number; py: number; pz: number; w: number }[] = [];
    for (let k = 0; k < 5; k++) {
      octaves.push({
        fx: 1.5 + Math.random() * 3,
        fy: 1.5 + Math.random() * 3,
        fz: 1.5 + Math.random() * 3,
        px: Math.random() * Math.PI * 2,
        py: Math.random() * Math.PI * 2,
        pz: Math.random() * Math.PI * 2,
        w: 1 / (k + 1),
      });
    }
    const totalWeight = octaves.reduce((s, o) => s + o.w, 0);

    for (let i = 0; i < posAttr.count; i++) {
      const nx = nrmAttr.getX(i);
      const ny = nrmAttr.getY(i);
      const nz = nrmAttr.getZ(i);
      let noise = 0;
      for (const o of octaves) {
        noise += Math.sin(nx * o.fx + o.px)
               * Math.sin(ny * o.fy + o.py)
               * Math.sin(nz * o.fz + o.pz) * o.w;
      }
      noise /= totalWeight;
      const bump = (noise * 0.5 + 0.5) * amp;
      posAttr.setXYZ(i,
        posAttr.getX(i) + nx * bump,
        posAttr.getY(i) + ny * bump,
        posAttr.getZ(i) + nz * bump,
      );
    }
    geo.computeVertexNormals();
  }

  // --- Material ---
  const material = new THREE.MeshPhysicalMaterial({
    color: tintColor,
    transmission,
    roughness,
    metalness,
    ior,
    thickness,
    reflectivity,
    clearcoat,
    clearcoatRoughness,
    envMap,
    envMapIntensity,
    attenuationColor: attColor,
    attenuationDistance: attDistance,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  // --- Mesh ---
  const mesh = new THREE.Mesh(geo, material);
  mesh.renderOrder = renderOrder;

  // --- Opacity tracking ---
  // Cut transmission entirely when not visible to skip the expensive
  // refraction render pass that MeshPhysicalMaterial triggers.
  function update(sectionOpacity: number): void {
    const visible = sectionOpacity > 0.02;
    mesh.visible = visible;
    if (!visible) {
      material.transmission = 0;
      return;
    }
    material.transmission = transmission;
    material.opacity = sectionOpacity;
  }

  function setTint(color: number | THREE.Color): void {
    material.color.set(color as any);
  }

  function setRoughness(r: number): void {
    material.roughness = r;
  }

  return { mesh, material, update, setTint, setRoughness };
}
