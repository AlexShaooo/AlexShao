/**
 * Creates a rounded-rectangle photo mesh with UV-based cropping.
 * Crops from both edges equally to fit the display aspect ratio,
 * preserving original image quality.
 */
import * as THREE from 'three';

export interface PhotoPlaneConfig {
  /** Image URL to load. */
  src: string;
  /** Display width in world units. */
  width: number;
  /** Display height in world units. */
  height: number;
  /** Corner radius for rounded rect. Default 0.5. */
  cornerRadius?: number;
}

/**
 * Build a rounded-rectangle photo mesh that UV-crops the source image
 * from both edges equally to match the display aspect ratio.
 */
export function createPhotoPlane(cfg: PhotoPlaneConfig): THREE.Mesh {
  const { src, width, height } = cfg;
  const cornerRadius = cfg.cornerRadius ?? 0.5;
  const displayAspect = width / height;

  // Load texture with UV cropping on load
  const loader = new THREE.TextureLoader();
  const texture = loader.load(src, (tex) => {
    const img = tex.image as HTMLImageElement;
    const imgAspect = img.naturalWidth / img.naturalHeight;
    if (imgAspect > displayAspect) {
      // Image wider than display: crop left/right equally
      const scale = displayAspect / imgAspect;
      tex.repeat.set(scale, 1);
      tex.offset.set((1 - scale) / 2, 0);
    } else {
      // Image taller than display: crop top/bottom equally
      const scale = imgAspect / displayAspect;
      tex.repeat.set(1, scale);
      tex.offset.set(0, (1 - scale) / 2);
    }
  });
  texture.colorSpace = THREE.SRGBColorSpace;

  // Rounded rectangle shape
  const hw = width / 2;
  const hh = height / 2;
  const r = Math.min(cornerRadius, hw, hh);
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
  const geo = new THREE.ShapeGeometry(shape, 8);

  // Remap UVs from shape coords to 0–1 range
  const uvAttr = geo.attributes.uv;
  for (let i = 0; i < uvAttr.count; i++) {
    uvAttr.setX(i, (uvAttr.getX(i) + hw) / (2 * hw));
    uvAttr.setY(i, (uvAttr.getY(i) + hh) / (2 * hh));
  }

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });

  return new THREE.Mesh(geo, material);
}
