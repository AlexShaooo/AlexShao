/**
 * Unified visual configuration for the renderer.
 * Tweak all sizes, opacities, colors, and geometry detail here.
 */
import { getBrightness } from '../theme';

// ---------------------------------------------------------------------------
// Color palettes
// ---------------------------------------------------------------------------

export interface Palette {
  background:   number;
  envMap:       number;
  neuronDim:    number;
  neuronActive: number;
  somaDim:      number;
  somaActive:   number;
  filamentBase: number;
  filamentGlow: number;
}

// Gold accent — constant across all brightness levels
const GOLD = 0xd4b86a;
const DARK_GOLD = 0x8b6a3c;
const VERY_DARK_GOLD = 0x5a3c1c; 

// --- Option A: Golden Hour — peach cream, amber pulses ---
const LIGHT_PALETTE: Palette = {
  background:   0xf0e6d4,   // peach cream
  envMap:       DARK_GOLD, 
  neuronDim:    0xd8cfbf,   // warm sand (subtle)
  neuronActive: VERY_DARK_GOLD,
  somaDim:      0xe3d9c7,   // 5% darker than bg
  somaActive:   VERY_DARK_GOLD,
  filamentBase: 0xe3d9c7,   // 5% darker than bg
  filamentGlow: VERY_DARK_GOLD,
};

const DARK_PALETTE: Palette = {
  background:   0x121210,
  envMap:       0x100f0d,   // ~background * 0.9
  neuronDim:    0x3a3830,
  neuronActive: GOLD,
  somaDim:      0x1e1d1a,
  somaActive:   GOLD,
  filamentBase: 0x1e1d1a,
  filamentGlow: GOLD,
};

/** Lerp a single 0xRRGGBB color. */
function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bv = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bv;
}

/** Returns interpolated palette based on current brightness (0=dark, 1=light). */
export function getColors(): Palette {
  const t = getBrightness();
  return {
    background:   lerpColor(DARK_PALETTE.background,   LIGHT_PALETTE.background,   t),
    envMap:       lerpColor(DARK_PALETTE.envMap,       LIGHT_PALETTE.envMap,       t),
    neuronDim:    lerpColor(DARK_PALETTE.neuronDim,    LIGHT_PALETTE.neuronDim,    t),
    neuronActive: lerpColor(DARK_PALETTE.neuronActive, LIGHT_PALETTE.neuronActive, t),
    somaDim:      lerpColor(DARK_PALETTE.somaDim,      LIGHT_PALETTE.somaDim,      t),
    somaActive:   lerpColor(DARK_PALETTE.somaActive,   LIGHT_PALETTE.somaActive,   t),
    filamentBase: lerpColor(DARK_PALETTE.filamentBase, LIGHT_PALETTE.filamentBase, t),
    filamentGlow: lerpColor(DARK_PALETTE.filamentGlow, LIGHT_PALETTE.filamentGlow, t),
  };
}

// ---------------------------------------------------------------------------
// Fog
// ---------------------------------------------------------------------------

export const FOG_NEAR = 50;
export const FOG_FAR  = 400;

// ---------------------------------------------------------------------------
// Neuron geometry
// ---------------------------------------------------------------------------

export const NEURON_RADIUS   = 0.25;  // core sphere
export const NEURON_SEGMENTS = 6;     // longitude
export const NEURON_RINGS    = 4;     // latitude

// ---------------------------------------------------------------------------
// Soma geometry (transparent outer sphere)
// ---------------------------------------------------------------------------

export const SOMA_RADIUS   = NEURON_RADIUS * 2.5;  // slightly larger than neuron core
export const SOMA_SEGMENTS = 8;
export const SOMA_RINGS    = 6;
export const SOMA_OPACITY  = 0.3;

// ---------------------------------------------------------------------------
// Filament (tube) geometry
// ---------------------------------------------------------------------------

export const TUBE_SEGMENTS    = 14;    // lengthwise subdivisions per connection
export const RADIAL_SEGMENTS  = 5;     // cross-section vertices
export const TUBE_MAX_RADIUS  = SOMA_RADIUS;  // radius at endpoints — matches soma sphere
export const TUBE_MIN_RADIUS  = NEURON_RADIUS * 0.5;  // radius at waist (mid-connection)
export const TUBE_TAPER_POWER = 6;    // exponent for cos^n taper (higher = sharper pinch)
export const TUBE_OPACITY     = 0.3;

// ---------------------------------------------------------------------------
// Signal glow
// ---------------------------------------------------------------------------

export const GLOW_SPREAD = 1.5;  // how wide the glow is in t-space (0-1)
