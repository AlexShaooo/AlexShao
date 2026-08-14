/**
 * About Layer 3 — Thank You / Gratitude.
 * 3D group is empty; content is rendered via the HTML about overlay.
 */
import type { SectionDef } from '../sectionConfig';

export const aboutSection3: SectionDef = {
  id: 'about-3',
  navId: 'about',
  cellBodies: [
    { radius: 6, x: -55, y: 35, zOffset: 50 },
    { radius: 5, x: 60, y: -30, zOffset: 60 },
  ],
  buildContent(_group) {
    // Content rendered via HTML overlay (aboutOverlay.ts)
  },
};
