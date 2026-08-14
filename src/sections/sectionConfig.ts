/**
 * Section definitions for the portfolio.
 * Each section defines its content and how it's built into 3D space.
 * Z-positions are computed dynamically by SectionManager based on cylinderLength.
 */
import * as THREE from 'three';
import {
  createTextPlane, createLinkPlane,
  themeTextColor, themeSubtleColor, themeMutedColor, themeLinkColor,
  ICON_GITHUB, ICON_LINKEDIN, ICON_EMAIL, ICON_INSTAGRAM,
} from './canvasTexture';
import type { BlobConfig } from './sectionBlob';
import type { GlassSphereConfig } from '../renderer/glassSphere';
import type { GlassRectangleConfig } from '../renderer/glassRectangle';
import { aboutSection1 } from './about_me/aboutSection1';
import { aboutSection2 } from './about_me/aboutSection2';
import { aboutSection3 } from './about_me/aboutSection3';
import { projectsSection2 } from './projects/projectsSection2';
import { resumeSection } from './resume/resumeSection';

export interface CellBodyConfig {
  x?: number;            // X offset from section center (default 0)
  y?: number;            // Y offset from section center (default 0)
  zOffset?: number;      // Z offset from contentCenter (default radius)
  radius?: number;       // soma sphere radius
  color?: THREE.Color;   // Fresnel rim color
  opacity?: number;      // peak rim opacity
  coreOpacity?: number;  // opacity of white center fill (0 = transparent core, 1 = solid white)
  rimPower?: number;     // Fresnel sharpness
  wireCount?: number;    // synapse wires from this soma
  wireOpacity?: number;  // wire base opacity
  wireRimPower?: number; // wire Fresnel sharpness
  wireTaperPower?: number; // wire radius taper exponent
  deformation?: number;    // pebble deformation amplitude (fraction of radius, 0 = perfect sphere)
}

export interface SectionDef {
  id: string;
  /** Maps to nav link data-section. Defaults to id. Multiple sections can share a navId. */
  navId?: string;
  buildContent: (group: THREE.Group) => void;
  blobConfig?: Partial<BlobConfig>;
  /** Cell body somas. Omit for default single soma; [] for none. */
  cellBodies?: CellBodyConfig[];
  /** Glass sphere overlays. Each creates a transmissive PBR glass sphere. */
  glassSpheres?: GlassSphereConfig[];
  /** Glass rectangle overlays. Each creates a transmissive PBR glass panel. */
  glassRectangles?: GlassRectangleConfig[];
}

// ---------------------------------------------------------------------------
// HOME — name, title, links
// ---------------------------------------------------------------------------

const homeSection: SectionDef = {
  id: 'home',
  cellBodies: [],
  glassSpheres: [
    // // Top — crystal clear, high IOR, no tint
    // { label: 'top', x: 0, y: 12, zOffset: 0, radius: 6, roughness: 0.0, ior: 1.8, thickness: 2.0, tint: 0xffffff, clearcoat: 1.0, clearcoatRoughness: 0.0 },
    // Bottom — frosted, warm gold tint
    { label: 'frosted', x: 0, y: 0, zOffset: 0, radius: 16, roughness: 0.35, ior: 1.5, thickness: 1.0, tint: 0xffffff, clearcoat: 0.5, clearcoatRoughness: 0.2, reflectivity: 0 },
    // // Left — medium frost, cool blue tint
    // { label: 'left', x: -14, y: 0, zOffset: 0, radius: 6, roughness: 0.15, ior: 1.6, thickness: 1.5, tint: 0xffffff, clearcoat: 0.8, clearcoatRoughness: 0.1 },
    // // Right — near-clear, slight rose tint, diamond IOR
    // { label: 'right', x: 14, y: 0, zOffset: 0, radius: 6, roughness: 0.05, ior: 2.0, thickness: 3.0, tint: 0xffffff, clearcoat: 1.0, clearcoatRoughness: 0.0 },
  ],
  buildContent(group) {
    // Name
    const name = createTextPlane({
      text: 'Alex Shao',
      width: 16,
      height: 2,
      fontSize: 76,
      color: themeTextColor(),
    });
    name.userData.revealGroup = 0;
    name.position.set(0, 2, 0);
    group.add(name);

    // Subtitle
    const subtitle = createTextPlane({
      text: 'Researcher @ Symbiokinetics',
      width: 12,
      height: 1,
      fontSize: 36,
      color: themeSubtleColor(),
    });
    subtitle.userData.revealGroup = 0;
    subtitle.position.set(0, 0.6, 0);
    group.add(subtitle);

    // Description
    const desc = createTextPlane({
      text: [
        'Building collaborative robotic platforms in healthcare at Symbiokinetics.',

        'Interested in Real-Time Control, Contact-Rich Manipulation, and Robot Learning.',
        
        'Pure Mathematics from Berkeley.',
        
      ],
      width: 24,
      height: 4,
      fontSize: 24,
      color: themeMutedColor(),
      lineHeight: 1.7,
    });
    desc.userData.revealGroup = 1;
    desc.position.set(0, -1.5, 0);
    group.add(desc);

    // Social links
    const links = [
      { label: 'github', href: 'https://github.com/AlexShaooo', icon: ICON_GITHUB },
      { label: 'linkedin', href: 'https://www.linkedin.com/in/alex-shao-b63ab4274/', icon: ICON_LINKEDIN },
      { label: 'instagram', href: 'https://www.instagram.com/alexwshao/', icon: ICON_INSTAGRAM },
      { label: 'email', href: 'mailto:alex.w.shao@gmail.com', icon: ICON_EMAIL },
    ];
    const linkW = 2.5;
    const linkH = 5.0;
    const linkGap = 1.0;
    const totalW = links.length * linkW + (links.length - 1) * linkGap;
    const startX = -totalW / 2 + linkW / 2;

    for (let i = 0; i < links.length; i++) {
      const link = createLinkPlane({
        label: links[i].label,
        href: links[i].href,
        width: linkW,
        height: linkH,
        fontSize: 16,
        color: themeLinkColor(),
        iconPaths: links[i].icon,
      });
      link.userData.revealGroup = 2;
      link.position.set(startX + i * (linkW + linkGap), -4.5, 0);
      group.add(link);
    }
  },
};

// ---------------------------------------------------------------------------
// PROJECTS — cards in a staggered layout
// ---------------------------------------------------------------------------

const projectsSection: SectionDef = {
  id: 'projects-1',
  navId: 'projects',
  cellBodies: [],
  buildContent(_group) {
    // Projects content is rendered via HTML overlay (projectsOverlay.ts)
    // 3D group intentionally left empty — neural network serves as backdrop
  },
};

// ---------------------------------------------------------------------------
// SKILLS
// ---------------------------------------------------------------------------

const skillsSection: SectionDef = {
  id: 'skills',
  cellBodies: [],
  buildContent(_group) {
    // Skills content is rendered via HTML overlay (skills/skillsOverlay.ts)
  },
};



// ---------------------------------------------------------------------------
// Export all sections in scroll order
// ---------------------------------------------------------------------------

export const SECTIONS: SectionDef[] = [
  homeSection,
  projectsSection,
  projectsSection2,
  skillsSection,
  aboutSection1,
  aboutSection2,
  aboutSection3,
  resumeSection,
];
