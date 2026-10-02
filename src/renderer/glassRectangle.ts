/**
 * Modular glass rectangle using Three.js MeshPhysicalMaterial transmission.
 *
 * Provides a physically-based glass panel look (refraction, Fresnel reflections,
 * optional frosting and color tint) with rounded corners.
 *
 * Usage:
 *   const glass = createGlassRectangle({ width: 30, height: 20 });
 *   scene.add(glass.mesh);
 *   // In animation loop:
 *   glass.update(sectionOpacity);
 */
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface GlassRectangleConfig {
  /** Label for identification. */
  label?: string;
  /** X offset from reference position. Default 0. */
  x?: number;
  /** Y offset from reference position. Default 0. */
  y?: number;
  /** Z offset from reference position. Default 0. */
  zOffset?: number;
  /** Panel width. Default 30. */
  width?: number;
  /** Panel height. Default 20. */
  height?: number;
  /** Panel depth (thickness of the slab). Default 0.6. */
  depth?: number;
  /** Corner radius. Default 1.5. */
  cornerRadius?: number;
  /** Corner curve segments. Default 8. */
  cornerSegments?: number;
  /** Index of refraction. Default 1.5. */
  ior?: number;
  /** Transmission amount 0–1. Default 1.0. */
  transmission?: number;
  /** Surface roughness 0–1. Default 0.05. */
  roughness?: number;
  /** Virtual thickness for refraction distortion. Default 0.5. */
  thickness?: number;
  /** Metalness. Default 0. */
  metalness?: number;
  /** Reflectivity fallback (0–1). Default 0. */
  reflectivity?: number;
  /** Glass tint color. Default white. */
  tint?: number | THREE.Color;
  /** Clearcoat layer intensity. Default 1.0. */
  clearcoat?: number;
  /** Clearcoat roughness. Default 0.1. */
  clearcoatRoughness?: number;
  /** Environment map (optional). */
  envMap?: THREE.Texture | null;
  /** Environment map intensity. Default 1.0. */
  envMapIntensity?: number;
  /** Attenuation color. Default white. */
  attenuationColor?: number | THREE.Color;
  /** Attenuation distance. Default Infinity. */
  attenuationDistance?: number;
  /** Render order. Default 10. */
  renderOrder?: number;
}

// ---------------------------------------------------------------------------
// Handle
// ---------------------------------------------------------------------------

export interface GlassRectangleHandle {
  mesh: THREE.Mesh;
  material: THREE.MeshPhysicalMaterial;
  /** Call each frame with section opacity (0–1) to fade in/out. */
  update(opacity: number): void;
  /** Dynamically update the glass tint. */
  setTint(color: number | THREE.Color): void;
  /** Dynamically update roughness. */
  setRoughness(r: number): void;
}

// ---------------------------------------------------------------------------
// Rounded rectangle shape helper
// ---------------------------------------------------------------------------

function createRoundedRectShape(
  w: number,
  h: number,
  r: number,
): THREE.Shape {
  const hw = w / 2;
  const hh = h / 2;
  r = Math.min(r, hw, hh);

  const shape = new THREE.Shape();
  shape.moveTo(-hw + r, -hh);
  shape.lineTo(hw - r, -hh);
  shape.quadraticCurveTo(hw, -hh, hw, -hh + r);
  shape.lineTo(hw, hh - r);
  shape.quadraticCurveTo(hw, hh, hw - r, hh);
  shape.lineTo(-hw + r, hh);
  shape.quadraticCurveTo(-hw, hh, -hw, hh - r);
  shape.lineTo(-hw, -hh + r);
  shape.quadraticCurveTo(-hw, -hh, -hw + r, -hh);

  return shape;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createGlassRectangle(cfg?: GlassRectangleConfig): GlassRectangleHandle {
  const width            = cfg?.width            ?? 30;
  const height           = cfg?.height           ?? 20;
  const depth            = cfg?.depth            ?? 0.6;
  const cornerRadius     = cfg?.cornerRadius     ?? 1.5;
  const cornerSegments   = cfg?.cornerSegments   ?? 8;
  const ior              = cfg?.ior              ?? 1.0;
  const transmission     = cfg?.transmission     ?? 1.0;
  const roughness        = cfg?.roughness        ?? 0.05;
  const thickness        = cfg?.thickness        ?? 0.5;
  const metalness        = cfg?.metalness        ?? 0;
  const reflectivity     = cfg?.reflectivity     ?? 0;
  const clearcoat        = cfg?.clearcoat        ?? 1.0;
  const clearcoatRoughness = cfg?.clearcoatRoughness ?? 0.1;
  const envMap           = cfg?.envMap           ?? null;
  const envMapIntensity  = cfg?.envMapIntensity  ?? 1.0;
  const renderOrder      = cfg?.renderOrder      ?? 10;

  const tintColor = new THREE.Color(
    cfg?.tint instanceof THREE.Color ? cfg.tint : (cfg?.tint ?? 0xffffff),
  );
  const attColor = new THREE.Color(
    cfg?.attenuationColor instanceof THREE.Color
      ? cfg.attenuationColor
      : (cfg?.attenuationColor ?? 0xffffff),
  );
  const attDistance = cfg?.attenuationDistance ?? Infinity;

  // --- Geometry: extruded rounded rectangle ---
  const shape = createRoundedRectShape(width, height, cornerRadius);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: depth * 0.3,
    bevelSize: depth * 0.3,
    bevelOffset: 0,
    bevelSegments: 3,
    curveSegments: cornerSegments,
  });
  // Center the extrusion on Z so the panel is symmetric
  geo.translate(0, 0, -depth / 2);

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
  // Keep transmission at full when visible (reducing it gradually turns glass
  // into opaque white). Cut transmission entirely below a threshold to skip
  // the expensive extra render pass that MeshPhysicalMaterial uses for refraction.
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
