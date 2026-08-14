/**
 * Theme state manager.
 * Toggle button drives an animated brightness transition (0 = dark, 1 = light).
 * CSS theme flips at 0.5 for text/nav styling.
 */

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'theme-mode';
const TRANSITION_DURATION = 800; // ms

let targetBrightness = resolveInitial() === 'dark' ? 0 : 1;
let currentBrightness = targetBrightness;
let animating = false;
let animStart = 0;
let animFrom = 0;

function resolveInitial(): ThemeMode {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return 'dark';
}

function applyBrightness(b: number): void {
  currentBrightness = b;
  document.documentElement.dataset.theme = b >= 0.5 ? 'light' : 'dark';
  window.dispatchEvent(new CustomEvent('theme-change', { detail: b }));
}

// Apply on load (instant, no animation)
applyBrightness(currentBrightness);

function animationTick() {
  if (!animating) return;
  const elapsed = performance.now() - animStart;
  const t = Math.min(1, elapsed / TRANSITION_DURATION);
  // Smooth ease-in-out
  const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const b = animFrom + (targetBrightness - animFrom) * eased;
  applyBrightness(b);
  if (t < 1) {
    requestAnimationFrame(animationTick);
  } else {
    animating = false;
    applyBrightness(targetBrightness);
  }
}

export function getBrightness(): number {
  return currentBrightness;
}

export function getMode(): ThemeMode {
  return targetBrightness >= 0.5 ? 'light' : 'dark';
}

export function toggleMode(): void {
  const newMode: ThemeMode = targetBrightness >= 0.5 ? 'dark' : 'light';
  targetBrightness = newMode === 'dark' ? 0 : 1;
  localStorage.setItem(STORAGE_KEY, newMode);
  animFrom = currentBrightness;
  animStart = performance.now();
  animating = true;
  requestAnimationFrame(animationTick);
}

export function setMode(mode: ThemeMode): void {
  targetBrightness = mode === 'dark' ? 0 : 1;
  localStorage.setItem(STORAGE_KEY, mode);
  animFrom = currentBrightness;
  animStart = performance.now();
  animating = true;
  requestAnimationFrame(animationTick);
}
