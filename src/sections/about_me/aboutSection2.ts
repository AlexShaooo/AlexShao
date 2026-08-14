/**
 * About Layer 2 — Interests & Hobbies.
 * 3D group is empty; content is rendered via the HTML about overlay.
 */
import type { SectionDef } from '../sectionConfig';

export const aboutSection2: SectionDef = {
  id: 'about-2',
  navId: 'about',
  cellBodies: [
    { radius: 7, x: 55, y: 30, zOffset: 55 },
    { radius: 5, x: -50, y: -35, zOffset: 65 },
  ],
  buildContent(_group) {
    // Content rendered via HTML overlay (aboutOverlay.ts)
  },
};
