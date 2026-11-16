/**
 * Canvas-to-texture utilities for rendering styled text onto 3D planes.
 * All textures are rendered once at init time — no per-frame cost.
 */
import * as THREE from 'three';
import { getMode } from '../theme';

const FONT_FAMILY = "'JetBrains Mono', monospace";

// ---------------------------------------------------------------------------
// Theme-aware color helpers (read at call time, not module load)
// ---------------------------------------------------------------------------

export function themeTextColor(): string {
  return getMode() === 'dark' ? '#d5d0c8' : '#0e0e0e';
}
export function themeSubtleColor(): string {
  return getMode() === 'dark' ? '#8a8578' : '#555544';
}
export function themeBodyColor(): string {
  return getMode() === 'dark' ? '#a09888' : '#2a2a2a';
}
export function themeMutedColor(): string {
  return getMode() === 'dark' ? '#7a7568' : '#444433';
}
export function themeLinkColor(): string {
  return getMode() === 'dark' ? '#b0a890' : '#333333';
}
export function themeCardBg(): string {
  return getMode() === 'dark' ? 'rgba(30, 29, 26, 0.72)' : 'rgba(235, 230, 220, 0.72)';
}
export function themeHeadingAltColor(): string {
  return getMode() === 'dark' ? '#9a9585' : '#6a6555';
}
export function themeItemColor(): string {
  return getMode() === 'dark' ? '#c0b8a8' : '#1e1e1e';
}
export function themeTagColor(): string {
  return getMode() === 'dark' ? '#7a7568' : '#5a5a4a';
}
export function themeSeparatorColor(): string {
  return getMode() === 'dark' ? 'rgba(100, 95, 80, 0.25)' : 'rgba(80, 75, 60, 0.3)';
}
const PX_PER_UNIT = 128; // canvas pixels per world unit — controls sharpness
const BASE_PX_PER_UNIT = 64; // original baseline — all hardcoded px values were authored for this
const S = PX_PER_UNIT / BASE_PX_PER_UNIT; // scale factor for pixel values

// ---------------------------------------------------------------------------
// General text plane
// ---------------------------------------------------------------------------

export interface TextPlaneOpts {
  text: string | string[];
  width: number;           // world units
  height: number;          // world units
  fontSize?: number;       // canvas px (default: 28)
  color?: string;          // text color (default: '#1a1a1a')
  bgColor?: string;        // background (default: transparent)
  textAlign?: CanvasTextAlign;
  lineHeight?: number;     // multiplier (default: 1.6)
  padding?: number;        // canvas px (default: 32)
  opacity?: number;        // material base opacity (default: 1)
  autoFit?: boolean;       // auto-calculate fontSize to fill the plane (default: false)
}

export function createTextPlane(opts: TextPlaneOpts): THREE.Mesh {
  const {
    text,
    width,
    height,
    fontSize = 28,
    color = '#1a1a1a',
    bgColor,
    textAlign = 'center',
    lineHeight = 1.6,
    padding = 32,
    opacity = 1,
    autoFit = false,
  } = opts;

  const cw = Math.round(width * PX_PER_UNIT);
  const ch = Math.round(height * PX_PER_UNIT);
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d')!;

  // Background
  if (bgColor) {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, cw, ch);
  }

  const pad = padding * S;
  const lines = Array.isArray(text) ? text : text.split('\n');

  // Auto-fit: compute the largest font size that fits all lines in the canvas
  let fs: number;
  if (autoFit) {
    const availH = ch - 2 * pad;
    const availW = cw - 2 * pad;
    // Start from height constraint
    fs = availH / (lines.length * lineHeight);
    // Check width constraint — measure widest line and scale down if needed
    ctx.font = `${fs}px ${FONT_FAMILY}`;
    const nonEmpty = lines.filter(l => l.length > 0);
    if (nonEmpty.length > 0) {
      const maxLineW = Math.max(...nonEmpty.map(l => ctx.measureText(l).width));
      if (maxLineW > availW) {
        fs *= availW / maxLineW;
      }
    }
  } else {
    fs = fontSize * S;
  }
  ctx.fillStyle = color;
  ctx.font = `${fs}px ${FONT_FAMILY}`;
  ctx.textAlign = textAlign;
  ctx.textBaseline = 'top';

  const x = textAlign === 'center' ? cw / 2 : textAlign === 'right' ? cw - pad : pad;
  const totalTextHeight = lines.length * fs * lineHeight;
  let y = (ch - totalTextHeight) / 2;

  for (const line of lines) {
    ctx.fillText(line, x, y);
    y += fs * lineHeight;
  }

  return buildMesh(canvas, width, height, opacity);
}

// ---------------------------------------------------------------------------
// Link plane (icon-ish label + text)
// ---------------------------------------------------------------------------

export interface LinkPlaneOpts {
  label: string;
  href: string;
  width: number;
  height: number;
  fontSize?: number;
  color?: string;
  hoverColor?: string;
  /** SVG path data strings to draw as an icon above the label */
  iconPaths?: string[];
  /** Viewbox size of the SVG icon (default 24) */
  iconViewBox?: number;
}

// Pre-defined SVG path data for social icons (from Lucide icon set)
export const ICON_GITHUB = [
  'M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4',
  'M9 18c-4.51 2-5-2-7-2',
];
export const ICON_LINKEDIN = [
  'M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z',
  'M2 9h4v12H2z',
  'M4 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
];
export const ICON_EMAIL = [
  'M2 6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6z',
  'M22 7l-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7',
];
export const ICON_INSTAGRAM = [
  'M2 6a4 4 0 0 1 4-4h12a4 4 0 0 1 4 4v12a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V6z',
  'M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z',
  'M17.5 6.5h.01',
];

export function createLinkPlane(opts: LinkPlaneOpts): THREE.Mesh {
  const {
    label,
    href,
    width,
    height,
    fontSize = 22,
    color = '#555555',
    iconPaths,
    iconViewBox = 24,
  } = opts;

  const cw = Math.round(width * PX_PER_UNIT);
  const ch = Math.round(height * PX_PER_UNIT);
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d')!;

  const fs = fontSize * S;

  if (iconPaths && iconPaths.length > 0) {
    // Layout: icon centered in top portion, label below
    const iconSize = fs * 2.5;
    const gap = fs * 0.5;
    const totalH = iconSize + gap + fs;
    const topY = (ch - totalH) / 2 - fs * 2;

    // Draw SVG icon paths
    const scale = iconSize / iconViewBox;
    const iconX = (cw - iconSize) / 2;
    ctx.save();
    ctx.translate(iconX, topY);
    ctx.scale(scale, scale);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3.0 / scale;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.fillStyle = 'none';
    for (const d of iconPaths) {
      const path = new Path2D(d);
      ctx.stroke(path);
    }
    ctx.restore();

    // Label text below icon
    ctx.fillStyle = color;
    ctx.font = `${fs}px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(label, cw / 2, topY + iconSize + gap);
  } else {
    // Fallback: centered text with underline
    ctx.fillStyle = color;
    ctx.font = `${fs}px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cw / 2, ch / 2);

    const metrics = ctx.measureText(label);
    const underY = ch / 2 + fs * 0.45;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5 * S;
    ctx.beginPath();
    ctx.moveTo((cw - metrics.width) / 2, underY);
    ctx.lineTo((cw + metrics.width) / 2, underY);
    ctx.stroke();
  }

  const mesh = buildMesh(canvas, width, height, 1);
  mesh.userData.href = href;
  mesh.userData.interactive = true;
  return mesh;
}

// ---------------------------------------------------------------------------
// Project card
// ---------------------------------------------------------------------------

export interface CardPlaneOpts {
  title: string;
  description: string;
  tags?: string[];
  width: number;
  height: number;
  href?: string;
}

export function createCardPlane(opts: CardPlaneOpts): THREE.Mesh {
  const { title, description, tags = [], width, height, href } = opts;

  const cw = Math.round(width * PX_PER_UNIT);
  const ch = Math.round(height * PX_PER_UNIT);
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d')!;

  const pad = 40 * S;

  // Subtle card background — no border
  ctx.fillStyle = themeCardBg();
  roundRect(ctx, 8 * S, 8 * S, cw - 16 * S, ch - 16 * S, 16 * S);
  ctx.fill();

  // Title
  ctx.fillStyle = themeTextColor();
  ctx.font = `500 ${28 * S}px ${FONT_FAMILY}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(title, pad, pad + 4 * S);

  // Description — word wrap
  ctx.fillStyle = themeBodyColor();
  ctx.font = `${16 * S}px ${FONT_FAMILY}`;
  const descLines = wrapText(ctx, description, cw - pad * 2);
  let dy = pad + 52 * S;
  for (const line of descLines) {
    ctx.fillText(line, pad, dy);
    dy += 24 * S;
  }

  // Tags
  if (tags.length > 0) {
    ctx.font = `${13 * S}px ${FONT_FAMILY}`;
    ctx.fillStyle = themeTagColor();
    const tagStr = tags.join('  ·  ');
    ctx.fillText(tagStr, pad, ch - pad - 8 * S);
  }

  const mesh = buildMesh(canvas, width, height, 1);
  if (href) {
    mesh.userData.href = href;
    mesh.userData.interactive = true;
  }
  return mesh;
}

// ---------------------------------------------------------------------------
// Skill label
// ---------------------------------------------------------------------------

export function createSkillLabel(
  label: string,
  width: number,
  height: number,
  fontSize = 18,
  color = '#444444',
): THREE.Mesh {
  const cw = Math.round(width * PX_PER_UNIT);
  const ch = Math.round(height * PX_PER_UNIT);
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d')!;

  const fs = fontSize * S;
  ctx.fillStyle = color;
  ctx.font = `${fs}px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, cw / 2, ch / 2);

  return buildMesh(canvas, width, height, 1);
}

// ---------------------------------------------------------------------------
// Skill grid (columned list with category headers and dot icons)
// ---------------------------------------------------------------------------

export interface SkillCategory {
  heading: string;
  items: string[];
}

export function createSkillGridPlane(
  categories: SkillCategory[],
  width: number,
  height: number,
): THREE.Mesh {
  const cw = Math.round(width * PX_PER_UNIT);
  const ch = Math.round(height * PX_PER_UNIT);
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d')!;

  const cols = categories.length;
  const colWidth = cw / cols;
  const padX = 28 * S;
  const startY = 40 * S;
  const headingSize = 15 * S;
  const itemSize = 17 * S;
  const itemLineHeight = 32 * S;
  const dotRadius = 3 * S;

  for (let c = 0; c < cols; c++) {
    const cat = categories[c];
    const x = c * colWidth + padX;

    // Category heading
    ctx.fillStyle = themeHeadingAltColor();
    ctx.font = `${headingSize}px ${FONT_FAMILY}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(cat.heading.toUpperCase(), x, startY);

    // Separator line
    ctx.strokeStyle = themeSeparatorColor();
    ctx.lineWidth = 1 * S;
    ctx.beginPath();
    ctx.moveTo(x, startY + headingSize + 10 * S);
    ctx.lineTo(x + colWidth - padX * 2.5, startY + headingSize + 10 * S);
    ctx.stroke();

    // Items
    let iy = startY + headingSize + 26 * S;
    ctx.font = `${itemSize}px ${FONT_FAMILY}`;
    for (const item of cat.items) {
      // Dot icon
      ctx.fillStyle = 'rgba(200, 185, 122, 0.6)';
      ctx.beginPath();
      ctx.arc(x + dotRadius, iy + itemSize * 0.4, dotRadius, 0, Math.PI * 2);
      ctx.fill();

      // Label
      ctx.fillStyle = themeItemColor();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(item, x + dotRadius * 2 + 12 * S, iy);
      iy += itemLineHeight;
    }
  }

  return buildMesh(canvas, width, height, 1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildMesh(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  opacity: number,
): THREE.Mesh {
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const geo = new THREE.PlaneGeometry(width, height);
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2;
  return mesh;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}
