/**
 * Photo collage layout utility for about sub-sections.
 * Given a list of image URLs, creates a grid of photoPlane meshes
 * and returns matching glassRectangle configs sized to each photo.
 */
import * as THREE from 'three';
import { createPhotoPlane } from '../photoPlane';
import type { GlassRectangleConfig } from '../../renderer/glassRectangle';

export interface CollageResult {
  meshes: THREE.Mesh[];
  glassConfigs: GlassRectangleConfig[];
}

/**
 * Build a photo collage within a bounding area.
 * Photos are laid out in a grid, each wrapped with a glass rectangle.
 *
 * @param imageUrls - Array of image src URLs
 * @param boundW - Total bounding width in world units
 * @param boundH - Total bounding height in world units
 * @param cols - Number of columns (auto-calculated if omitted)
 * @param revealGroup - revealGroup index to assign to meshes
 */
export function buildPhotoCollage(
  imageUrls: string[],
  boundW: number,
  boundH: number,
  cols?: number,
  revealGroup = 1,
): CollageResult {
  const n = imageUrls.length;
  if (n === 0) return { meshes: [], glassConfigs: [] };

  // Determine grid dimensions
  const numCols = cols ?? Math.ceil(Math.sqrt(n));
  const numRows = Math.ceil(n / numCols);

  // Cell sizing with gaps
  const gap = 1.2;
  const cellW = (boundW - gap * (numCols - 1)) / numCols;
  const cellH = (boundH - gap * (numRows - 1)) / numRows;

  // Photo slightly smaller than glass rect for padding
  const photoW = cellW * 0.88;
  const photoH = cellH * 0.88;

  const meshes: THREE.Mesh[] = [];
  const glassConfigs: GlassRectangleConfig[] = [];

  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / numCols);
    const col = i % numCols;

    // Center the grid within the bounding area
    const x = -boundW / 2 + cellW / 2 + col * (cellW + gap);
    const y = boundH / 2 - cellH / 2 - row * (cellH + gap);

    // Photo mesh
    const photo = createPhotoPlane({
      src: imageUrls[i],
      width: photoW,
      height: photoH,
      cornerRadius: 0.4,
    });
    photo.userData.revealGroup = revealGroup;
    photo.position.set(x, y, -0.5); // Slightly in front of glass
    meshes.push(photo);

    // Matching glass rectangle config
    glassConfigs.push({
      label: `collage-${i}`,
      x,
      y,
      zOffset: 0,
      width: cellW,
      height: cellH,
      roughness: 0.35,
      ior: 1.5,
      thickness: 1.0,
      tint: 0xffffff,
      clearcoat: 0.5,
      clearcoatRoughness: 0.2,
    });
  }

  return { meshes, glassConfigs };
}

/**
 * Auto-discover images from a Vite glob result.
 * Pass the result of import.meta.glob(..., { eager: true, query: '?url', import: 'default' }).
 * Returns resolved URLs sorted alphabetically by original path.
 */
export function extractImageUrls(globResult: Record<string, string>): string[] {
  // Sort by key (file path) for deterministic order, return resolved URLs
  return Object.entries(globResult)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, url]) => url);
}
