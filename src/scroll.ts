import gsap from 'gsap';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';

gsap.registerPlugin(ScrollToPlugin);

let sectionZs: number[] = [];
let sectionSnaps: number[] = [];
let breakpoints: { scroll: number; z: number }[] = [];
let maxScroll = 0;
let spacer: HTMLDivElement | null = null;
let isAnimating = false;
let currentTween: gsap.core.Tween | null = null;

// Delta accumulation to tame trackpad momentum
let accumulatedDelta = 0;
let wheelIdleTimer: ReturnType<typeof setTimeout> | null = null;
const SCROLL_THRESHOLD = 200;  // accumulated px before triggering a section change
const IDLE_RESET_MS = 300;     // reset accumulator after this idle gap
const WHEEL_HANDLER_IDLE_MS = 10;  // reset gesture tracking after this idle gap
let wheelHandlerIdleTimer: ReturnType<typeof setTimeout> | null = null;
let wheelFirstHandlerResult: 'consumed' | 'at-start' | 'at-end' | null = null;
let wheelStartedAtBoundary = false;

// --- Generic per-section continuous scroll handlers ---
const sectionScrollHandlers = new Map<number, (deltaY: number) => 'consumed' | 'at-start' | 'at-end'>();
let boundaryDelta = 0;
let boundaryDir: 'at-start' | 'at-end' | null = null;
const BOUNDARY_EXIT_THRESHOLD = 300;

/**
 * Register a continuous scroll handler for a given section index.
 * When the user is on that section, wheel events are routed to this handler.
 */
export function registerSectionScrollHandler(
  sectionIndex: number,
  handler: (deltaY: number) => 'consumed' | 'at-start' | 'at-end',
): void {
  sectionScrollHandlers.set(sectionIndex, handler);
}

function computeLayout() {
  const vh = window.innerHeight;

  document.documentElement.style.setProperty('--app-vh', `${vh}px`);

  const n = sectionZs.length;

  const totalHeight = n * vh;
  if (spacer) spacer.style.height = `${totalHeight}px`;
  maxScroll = totalHeight - vh;

  const starts: number[] = [];
  for (let i = 0; i < n; i++) {
    starts.push(i * vh);
  }

  sectionSnaps = starts.map((s) => Math.min(s, maxScroll));

  breakpoints = [];
  for (let i = 0; i < n; i++) {
    breakpoints.push({ scroll: starts[i], z: sectionZs[i] });
  }
}

export function initScroll(sectionZList: number[]) {
  sectionZs = sectionZList;

  history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);

  spacer = document.createElement('div');
  spacer.id = 'scroll-spacer';
  document.body.appendChild(spacer);
  computeLayout();

  window.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (isAnimating) return;

    // Reset handler gesture tracking after idle gap (separate from accumulator)
    if (wheelHandlerIdleTimer) clearTimeout(wheelHandlerIdleTimer);
    wheelHandlerIdleTimer = setTimeout(() => { wheelFirstHandlerResult = null; wheelStartedAtBoundary = false; }, WHEEL_HANDLER_IDLE_MS);

    const current = getCurrentSectionIndex();

    // Per-section continuous scroll handlers (projects overlays, about overlays, etc.)
    const sectionHandler = sectionScrollHandlers.get(current);
    if (sectionHandler) {
      const result = sectionHandler(e.deltaY);
      // Record first result of this wheel gesture (resets after idle gap)
      if (wheelFirstHandlerResult === null) {
        wheelFirstHandlerResult = result;
        wheelStartedAtBoundary = result !== 'consumed';
      }
      if (result === 'consumed') {
        boundaryDelta = 0;
        boundaryDir = null;
        return;
      }
      // Only allow section switch if gesture started at boundary
      if (!wheelStartedAtBoundary) return;
      if (boundaryDir !== result) {
        boundaryDir = result;
        boundaryDelta = 0;
      }
      boundaryDelta += Math.abs(e.deltaY);
      if (boundaryDelta >= BOUNDARY_EXIT_THRESHOLD) {
        boundaryDelta = 0;
        boundaryDir = null;
        const dir = result === 'at-end' ? 1 : -1;
        scrollToSection(current + dir);
      }
      return;
    }

    // Reset accumulator after idle gap
    if (wheelIdleTimer) clearTimeout(wheelIdleTimer);
    wheelIdleTimer = setTimeout(() => { accumulatedDelta = 0; }, IDLE_RESET_MS);

    accumulatedDelta += e.deltaY;

    if (Math.abs(accumulatedDelta) >= SCROLL_THRESHOLD) {
      const dir = accumulatedDelta > 0 ? 1 : -1;
      accumulatedDelta = 0;
      navigateDirection(dir);
    }
  }, { passive: false });

  // --- Touch support for mobile ---
  let touchStartY = 0;
  let touchOriginY = 0;  // never reset mid-gesture — tracks total swipe distance
  let touchStartX = 0;
  let isTouchActive = false;
  let touchLastBoundaryResult: 'at-start' | 'at-end' | null = null;
  let touchBoundaryStartY: number | null = null;
  let touchStartedAtBoundary = false;
  let touchFirstHandlerResult: 'consumed' | 'at-start' | 'at-end' | null = null;

  window.addEventListener('touchstart', (e) => {
    if (isAnimating) return;
    touchStartY = e.touches[0].clientY;
    touchOriginY = e.touches[0].clientY;
    touchStartX = e.touches[0].clientX;
    isTouchActive = true;
    touchLastBoundaryResult = null;
    touchBoundaryStartY = null;
    boundaryDelta = 0;
    boundaryDir = null;
    touchStartedAtBoundary = false;
    touchFirstHandlerResult = null;
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (!isTouchActive || isAnimating) return;

    const touchY = e.touches[0].clientY;
    const touchX = e.touches[0].clientX;
    const diffX = touchStartX - touchX;
    const diffY = touchOriginY - touchY;  // total gesture distance

    // Ignore horizontal swipes
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffY) < 10) return;

    const current = getCurrentSectionIndex();

    // Route to per-section scroll handler (project overlays, about, skills)
    const sectionHandler = sectionScrollHandlers.get(current);
    if (sectionHandler) {
      const deltaY = touchStartY - touchY;
      touchStartY = touchY;

      const result = sectionHandler(deltaY);
      // Record the very first handler result of this gesture
      if (touchFirstHandlerResult === null) {
        touchFirstHandlerResult = result;
        touchStartedAtBoundary = result !== 'consumed';
      }
      if (result === 'consumed') {
        touchLastBoundaryResult = null;
        touchBoundaryStartY = null;
        boundaryDelta = 0;
        boundaryDir = null;
        return;
      }
      // At boundary — track for exit
      if (touchLastBoundaryResult === null) {
        touchBoundaryStartY = touchY;
      }
      touchLastBoundaryResult = result;
      if (boundaryDir !== result) {
        boundaryDir = result;
        boundaryDelta = 0;
      }
      return;
    }

    // Non-handler section: handled on touchend
  }, { passive: false });

  const TOUCH_SECTION_THRESHOLD = 50;
  const TOUCH_BOUNDARY_EXIT_THRESHOLD = 75;

  window.addEventListener('touchend', (e) => {
    if (!isTouchActive) return;
    isTouchActive = false;

    if (isAnimating) return;

    const touchEndY = e.changedTouches[0].clientY;
    const totalDiff = touchOriginY - touchEndY;  // positive = swipe up
    const current = getCurrentSectionIndex();

    // For sections with handlers: only switch if gesture started at boundary
    if (sectionScrollHandlers.has(current)) {
      const boundaryDiff = touchBoundaryStartY !== null ? touchBoundaryStartY - touchEndY : 0;
      if (touchStartedAtBoundary && touchLastBoundaryResult && Math.abs(boundaryDiff) >= TOUCH_BOUNDARY_EXIT_THRESHOLD) {
        const dir = touchLastBoundaryResult === 'at-end' ? 1 : -1;
        boundaryDelta = 0;
        boundaryDir = null;
        touchLastBoundaryResult = null;
        scrollToSection(current + dir);
      }
      touchLastBoundaryResult = null;
      return;
    }

    // Normal section navigation
    if (Math.abs(totalDiff) >= TOUCH_SECTION_THRESHOLD) {
      const dir = totalDiff > 0 ? 1 : -1;
      navigateDirection(dir as 1 | -1);
    }
  }, { passive: true });

  window.addEventListener('resize', () => {
    const idx = getCurrentSectionIndex();
    computeLayout();
    window.scrollTo(0, sectionSnaps[idx]);
  });
}

export function navigateDirection(dir: 1 | -1) {
  if (isAnimating) return;
  const current = getCurrentSectionIndex();
  scrollToSection(current + dir);
}

export function getScrollZ(): number {
  if (maxScroll <= 0 || breakpoints.length === 0) return sectionZs[0] ?? 0;
  const sy = Math.min(maxScroll, Math.max(0, window.scrollY));

  for (let i = 0; i < breakpoints.length - 1; i++) {
    const a = breakpoints[i];
    const b = breakpoints[i + 1];
    if (sy >= a.scroll && sy <= b.scroll) {
      const range = b.scroll - a.scroll;
      if (range === 0) return a.z;
      const t = (sy - a.scroll) / range;
      return a.z + t * (b.z - a.z);
    }
  }
  return breakpoints[breakpoints.length - 1].z;
}

let isMultiJump = false;
let jumpOrigin = -1;
let jumpTarget = -1;
let overrideZ: number | null = null;
const zTweenObj = { z: 0 };

export function scrollToSection(index: number) {
  index = Math.max(0, Math.min(sectionZs.length - 1, index));
  const scrollTarget = sectionSnaps[index];

  jumpOrigin = getCurrentSectionIndex();

  // Already at the target section — nothing to animate
  if (index === jumpOrigin) return;

  if (currentTween) currentTween.kill();

  jumpTarget = index;
  isMultiJump = Math.abs(index - jumpOrigin) > 1;
  isAnimating = true;

  // Safety: reset isAnimating after 2s in case onComplete never fires
  const safetyTimer = setTimeout(() => {
    if (isAnimating) {
      isAnimating = false;
      isMultiJump = false;
      jumpOrigin = -1;
      jumpTarget = -1;
      currentTween = null;
    }
  }, 2000);

  if (isMultiJump) {
    zTweenObj.z = getScrollZ();
    overrideZ = zTweenObj.z;
    const targetZ = sectionZs[index];
    currentTween = gsap.to(zTweenObj, {
      z: targetZ,
      duration: 0.8,
      ease: 'power2.inOut',
      onUpdate: () => { overrideZ = zTweenObj.z; },
      onComplete: () => {
        clearTimeout(safetyTimer);
        overrideZ = null;
        window.scrollTo(0, scrollTarget);
        isAnimating = false;
        isMultiJump = false;
        jumpOrigin = -1;
        jumpTarget = -1;
        currentTween = null;
      },
    });
  } else {
    currentTween = gsap.to(window, {
      scrollTo: scrollTarget,
      duration: 0.8,
      ease: 'power2.inOut',
      onComplete: () => { clearTimeout(safetyTimer); isAnimating = false; isMultiJump = false; jumpOrigin = -1; jumpTarget = -1; currentTween = null; },
    });
  }
}

export function getEffectiveZ(): number {
  return overrideZ !== null ? overrideZ : getScrollZ();
}

export function isScrollAnimating(): boolean {
  return isAnimating;
}

export function isMultiSectionScrolling(): boolean {
  return isAnimating && isMultiJump;
}

export function getJumpOrigin(): number {
  return jumpOrigin;
}

export function getJumpTarget(): number {
  return jumpTarget;
}

export function getCurrentSectionIndex(): number {
  const currentZ = getScrollZ();
  let closest = 0;
  let minDist = Infinity;
  for (let i = 0; i < sectionZs.length; i++) {
    const d = Math.abs(currentZ - sectionZs[i]);
    if (d < minDist) {
      minDist = d;
      closest = i;
    }
  }
  return closest;
}
