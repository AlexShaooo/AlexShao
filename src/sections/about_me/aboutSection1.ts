/**
 * About Layer 1 — Personal intro: main photo + bio text + collage of additional photos.
 */
import type { SectionDef } from '../sectionConfig';
import type { GlassRectangleConfig } from '../../renderer/glassRectangle';
import {
  createTextPlane,
  themeTextColor, themeBodyColor,
} from '../canvasTexture';
import { createPhotoPlane } from '../photoPlane';
import { extractImageUrls } from './photoCollage';

// Auto-discover images from about_me folder
const imageGlob = import.meta.glob<string>(
  '/images/about_page/about_me/*.{jpeg,jpg,png}',
  { eager: true, query: '?url', import: 'default' },
);
const allImages = extractImageUrls(imageGlob);

// Main glass rectangle for the featured photo + bio
const mainGlassConfig: GlassRectangleConfig = {
  label: 'about1-main',
  x: 0,
  y: 0,
  zOffset: 0,
  width: 38,
  height: 22,
  roughness: 0.35,
  ior: 1.5,
  thickness: 1.0,
  tint: 0xffffff,
  clearcoat: 0.5,
  clearcoatRoughness: 0.2,
};

export const aboutSection1: SectionDef = {
  id: 'about-1',
  navId: 'about',
  cellBodies: [
    { radius: 8, x: -60, y: 40, zOffset: 50 },
    { radius: 6, x: 66, y: -36, zOffset: 60 },
  ],
  glassSpheres: [],
  glassRectangles: [mainGlassConfig],
  buildContent(group) {
    const header = createTextPlane({
      text: 'About',
      width: 10,
      height: 6,
      fontSize: 36,
      color: themeTextColor(),
    });
    header.userData.revealGroup = 0;
    header.position.set(0, 8, 0);
    group.add(header);

    // Featured photo — height-constrained within glass rect
    const maxW = mainGlassConfig.width! * 0.9;
    const maxH = mainGlassConfig.height! * 0.9;
    const srcAspect = 724 / 1086;
    const photoH = Math.min(maxH, maxW / srcAspect);
    const photoW = photoH * srcAspect;

    // Use first image as the main photo (alex1.jpeg sorts first)
    const mainSrc = allImages.find(u => u.includes('alex1')) ?? allImages[0];
    if (mainSrc) {
      const photoMesh = createPhotoPlane({
        src: mainSrc,
        width: photoW,
        height: photoH,
        cornerRadius: 0.5,
      });
      photoMesh.userData.revealGroup = 1;
      photoMesh.position.set(-9.5, 0, -11);
      group.add(photoMesh);

      // Bio text on the right side
      const gap = 1;
      const photoRight = photoMesh.position.x + photoW / 2;
      const rectRight = mainGlassConfig.width! * 0.9 / 2;
      const bioW = rectRight - photoRight - gap;
      const bioH = maxH;
      const bioCenterX = photoRight + gap + bioW / 2;

      const bio = createTextPlane({
        text: [
          "In sixth grade, I spent two months deriving pi by",
          "hand because my teacher's explanation felt incomplete.",
          "That refusal to take theory on faith became my",
          "standard.",
          '',
          "I'm studying Pure Mathematics at UC Berkeley, which",
          'shapes how I approach problems: rigorous, first-',
          'principles reasoning over hand-wavy approximations.',
          '',
          'I left mid-degree to join Symbiokinetics as a founding',
          'researcher. I work on real-time control, safe human-robot',
          'interaction, and contact-rich manipulation: the space',
          'where clean theory collides with messy physical reality,',
          'and where microseconds matter.',
          '',
          'Outside of work, I consume too much hard hojicha and',
          'sci-fi, or attempt to learn Russian. My favorite book',
          'and series are Hail Mary and the Foundation,',
          'respectively.',
        ],
        width: bioW,
        height: bioH,
        color: themeBodyColor(),
        lineHeight: 1.7,
        autoFit: true,
      });
      bio.userData.revealGroup = 1;
      bio.position.set(bioCenterX, photoMesh.position.y, photoMesh.position.z);
      group.add(bio);
    }
  },
};
