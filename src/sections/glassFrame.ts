/**
 * Thin pill-style border frame with rounded corners and golden edges.
 * Matches the nav pill aesthetic: 1px solid, border-radius, golden tint.
 */
import * as THREE from 'three';
import { getMode } from '../theme';

const BORDER_WIDTH = 0.3;
const CORNER_RADIUS = 1.2;
const PADDING = 1.5; // extra space around content bounding box

/**
 * Build a rounded-rect path.
 */
function roundedRectPath(
  path: THREE.Path | THREE.Shape,
  w: number,
  h: number,
  r: number,
): void {
  const hw = w / 2;
  const hh = h / 2;
  r = Math.min(r, hw, hh);
  path.moveTo(-hw + r, -hh);
  path.lineTo(hw - r, -hh);
  path.quadraticCurveTo(hw, -hh, hw, -hh + r);
  path.lineTo(hw, hh - r);
  path.quadraticCurveTo(hw, hh, hw - r, hh);
  path.lineTo(-hw + r, hh);
  path.quadraticCurveTo(-hw, hh, -hw, hh - r);
  path.lineTo(-hw, -hh + r);
  path.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
}

export interface GlassFrame {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  updateTheme(): void;
}

/**
 * Compute content bounding box from a group (excluding backplane meshes).
 * Returns { width, height, centerY } for the frame to wrap around.
 */
export function computeContentBounds(group: THREE.Group): { width: number; height: number; centerY: number } {
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  const box = new THREE.Box3();

  group.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || mesh.userData._isBackplane) return;
    if (!mesh.geometry) return;
    mesh.geometry.computeBoundingBox();
    if (!mesh.geometry.boundingBox) return;
    box.copy(mesh.geometry.boundingBox);
    // Account for mesh position within group
    const x = mesh.position.x;
    const y = mesh.position.y;
    minX = Math.min(minX, box.min.x + x);
    maxX = Math.max(maxX, box.max.x + x);
    minY = Math.min(minY, box.min.y + y);
    maxY = Math.max(maxY, box.max.y + y);
  });

  if (minX === Infinity) return { width: 10, height: 8, centerY: 0 };

  const width = maxX - minX + PADDING * 2;
  const height = maxY - minY + PADDING * 2;
  const centerY = (minY + maxY) / 2;
  return { width, height, centerY };
}

export function createGlassFrame(
  width: number,
  height: number,
): GlassFrame {
  // Outer rounded rect
  const outer = new THREE.Shape();
  roundedRectPath(outer, width, height, CORNER_RADIUS);

  // Inner hole (inset by BORDER_WIDTH)
  const inner = new THREE.Path();
  roundedRectPath(
    inner,
    width - BORDER_WIDTH * 2,
    height - BORDER_WIDTH * 2,
    Math.max(0.2, CORNER_RADIUS - BORDER_WIDTH),
  );
  outer.holes.push(inner);

  const geo = new THREE.ShapeGeometry(outer, 8);

  // Golden border matching nav pill aesthetic
  const material = new THREE.MeshBasicMaterial({
    color: 0xb8a070, // warm gold, slightly muted
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });

  const mesh = new THREE.Mesh(geo, material);

  function updateTheme(): void {
    const isDark = getMode() === 'dark';
    material.color.set(isDark ? 0xc9b080 : 0x504020);
    material.opacity = isDark ? 0.45 : 0.35;
  }

  return { mesh, material, updateTheme };
}
