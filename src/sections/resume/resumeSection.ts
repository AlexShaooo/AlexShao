/**
 * Resume section — renders the actual PDF via pdf.js; clicking the page downloads it.
 */
import * as THREE from 'three';
import type { SectionDef } from '../sectionConfig';
import { renderPdfToCanvas } from './pdfRenderer';

export const resumeSection: SectionDef = {
  id: 'resume',
  cellBodies: [
  //   { radius: 8, x: 52, y: 32, zOffset: 55, wireCount: 3 },
  //   { radius: 6, x: -48, y: -40, zOffset: 60, wireCount: 2 },
  ],
  glassSpheres: [],
  glassRectangles: [
    { label: 'resume-frame', x: 0, y: 0, zOffset: 0, width: 38, height: 48, roughness: 0.05, ior: 1.15, thickness: 1.0, tint: 0xffffff, clearcoat: 0.5, clearcoatRoughness: 0.1 },
  ],
  buildContent: (() => {
    // Pre-build the resume mesh once; theme switches just re-add it to the group.
    const planeH = 22 * 1.9;
    const planeW = planeH * (8.5 / 11);

    // Rounded rectangle geometry (matching about1 photo style)
    const cornerRadius = 0.5;
    const hw = planeW / 2;
    const hh = planeH / 2;
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
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 2;
    mesh.userData.revealGroup = 1;
    // Clicking anywhere on the rendered PDF downloads it. Only picked up while this
    // section is settled (see sectionManager.getInteractiveMeshes), so it's inert elsewhere.
    mesh.userData.interactive = true;
    mesh.userData.download = `${import.meta.env.BASE_URL}resume.pdf`;
    mesh.position.set(0, 0, -20);

    // Render PDF to canvas texture once
    renderPdfToCanvas(`${import.meta.env.BASE_URL}resume.pdf`).then((canvas) => {
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      mat.map = texture;
      mat.needsUpdate = true;
    });

    return (group: THREE.Group) => {
      group.add(mesh);
    };
  })(),
};
