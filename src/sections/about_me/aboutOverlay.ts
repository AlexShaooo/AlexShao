/**
 * HTML overlay controller for about layers 2 (interests) and 3 (thank you).
 * Auto-discovers images from subfolders and populates gallery grids.
 * Scroll behavior mirrors the projects overlay: hidden overflow, JS-managed scrolling.
 */
import gsap from 'gsap';
import { registerSectionScrollHandler } from '../../scroll';
import { SECTIONS } from '../sectionConfig';
import { computeBSPLayout } from './justifiedLayout';
import { createAccordionManager, type BaseAccordionSection } from '../accordion';

// ---------------------------------------------------------------------------
// 🔧Edit this list to change the rotating name+photo pairs in the Thank You section
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Auto-discover images via Vite glob
// ---------------------------------------------------------------------------

const interestsArt = import.meta.glob<string>(
  '/images/about_page/about_interests/art/*.{jpeg,jpg,png}',
  { eager: true, query: '?url', import: 'default' },
);
const interestsPhotography = import.meta.glob<string>(
  '/images/about_page/about_interests/photography/*.{jpeg,jpg,png}',
  { eager: true, query: '?url', import: 'default' },
);
const interestsTraveling = import.meta.glob<string>(
  '/images/about_page/about_interests/traveling/*.{jpeg,jpg,png}',
  { eager: true, query: '?url', import: 'default' },
);
const interestsSkiing = import.meta.glob<string>(
  '/images/about_page/about_interests/skiing/*.{jpeg,jpg,png}',
  { eager: true, query: '?url', import: 'default' },
);
const interestsClimbing = import.meta.glob<string>(
  '/images/about_page/about_interests/climbing/*.{jpeg,jpg,png}',
  { eager: true, query: '?url', import: 'default' },
);

const INTEREST_FOLDERS: Record<string, Record<string, string>> = {
  art: interestsArt,
  photography: interestsPhotography,
  traveling: interestsTraveling,
  skiing: interestsSkiing,
  climbing: interestsClimbing,
};

const lifeFamily = import.meta.glob<string>(
  '/images/about_page/about_life/family/*.{jpeg,jpg,JPG,png}',
  { eager: true, query: '?url', import: 'default' },
);
const lifeEveryoneElse = import.meta.glob<string>(
  '/images/about_page/about_life/everyone_else/*.{jpeg,jpg,JPG,png}',
  { eager: true, query: '?url', import: 'default' },
);

const ALL_FOLDERS: Record<string, Record<string, string>> = {
  ...INTEREST_FOLDERS,
  everyone_else: lifeEveryoneElse,
};

// Build name→URL map from family glob for paired rotation
const familyByName: Record<string, string> = {};
for (const [path, url] of Object.entries(lifeFamily)) {
  const stem = path.split('/').pop()!.replace(/\.\w+$/, '');
  familyByName[stem] = url;
}

const THANKYOU_ENTRIES = [
  { name: 'Family',       url: familyByName['thanks_family'] },
  { name: 'Mom',          url: familyByName['thanks_mom'] },
  { name: 'Dad',          url: familyByName['thanks_dad'] },
  { name: 'Sister',       url: familyByName['thanks_sister'] },
  { name: 'Other Sister', url: familyByName['thanks_other_sister'] },
];

function sortedUrls(glob: Record<string, string>): string[] {
  return Object.entries(glob)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, url]) => url);
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

function createImageCard(src: string): HTMLElement {
  const card = document.createElement('div');
  card.className = 'about-card';
  const img = document.createElement('img');
  img.src = src;
  img.decoding = 'async';
  img.alt = '';
  card.appendChild(img);
  return card;
}

/**
 * Load an image and resolve its natural aspect ratio (width / height).
 */
function getAspectRatio(src: string): Promise<number> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth / img.naturalHeight);
    img.onerror = () => resolve(4 / 3); // fallback
    img.src = src;
  });
}

/**
 * Populate a gallery grid using masonry layout.
 * Images are absolutely positioned into columns, respecting natural aspect ratios.
 */
async function populateGrid(overlay: HTMLElement, folder: string, urls: string[]) {
  const grid = overlay.querySelector<HTMLElement>(`.about-gallery-grid[data-folder="${folder}"]`);
  if (!grid || urls.length === 0) return;

  // Create cards immediately (invisible) so reveal animation can find them
  const cards = urls.map(url => {
    const card = createImageCard(url);
    grid.appendChild(card);
    return card;
  });

  // Load aspect ratios in parallel
  const aspects = await Promise.all(urls.map(getAspectRatio));

  // Compute layout once we know the container width
  const applyLayout = () => {
    const containerWidth = grid.clientWidth;
    if (containerWidth <= 0) return;

    const gap = 10;
    const { items, totalHeight } = computeBSPLayout(aspects, containerWidth, gap);

    grid.style.height = `${totalHeight}px`;

    for (const item of items) {
      const card = cards[item.index];
      card.style.position = 'absolute';
      card.style.left = `${item.x}px`;
      card.style.top = `${item.y}px`;
      card.style.width = `${item.width}px`;
      card.style.height = `${item.height}px`;
    }
  };

  // Apply immediately and re-layout on resize
  applyLayout();
  const ro = new ResizeObserver(applyLayout);
  ro.observe(grid);
}

// ---------------------------------------------------------------------------
// Accordion logic (uses shared accordion manager)
// ---------------------------------------------------------------------------

interface AboutAccordionSection extends BaseAccordionSection {
  folder: string;
  gridEl: HTMLElement;
  populated: boolean;
}

/** One manager per overlay (about-2, about-3) — keyed by section id. */
const managers = new Map<string, ReturnType<typeof createAccordionManager<AboutAccordionSection>>>();

function initAccordion(overlay: HTMLElement, inner: HTMLElement, sectionId: string) {
  const manager = createAccordionManager<AboutAccordionSection>(inner, {
    async onBeforeOpen(section) {
      if (!section.populated) {
        const glob = ALL_FOLDERS[section.folder];
        if (glob) await populateGrid(overlay, section.folder, sortedUrls(glob));
        section.populated = true;
      }
    },
    onAfterOpen(section) {
      const cards = section.gridEl.querySelectorAll<HTMLElement>('.about-card');
      gsap.fromTo(cards,
        { opacity: 0, y: SLIDE_PX },
        { opacity: 1, y: 0, duration: REVEAL_DURATION, stagger: STAGGER, ease: 'power2.out', delay: 0.15 },
      );
    },
    onClose(section) {
      const cards = section.gridEl.querySelectorAll<HTMLElement>('.about-card');
      gsap.to(cards, { opacity: 0, y: SLIDE_PX, duration: HIDE_DURATION, ease: 'power2.in' });
    },
    onReset(section) {
      const cards = section.gridEl.querySelectorAll<HTMLElement>('.about-card');
      gsap.set(cards, { opacity: 0, y: SLIDE_PX });
    },
  });

  const sectionEls = overlay.querySelectorAll<HTMLElement>('.about-accordion-section');
  for (const sectionEl of sectionEls) {
    const folder = sectionEl.dataset.folder!;
    const headerEl = sectionEl.querySelector<HTMLElement>('.about-accordion-header')!;
    const contentEl = sectionEl.querySelector<HTMLElement>('.about-accordion-content')!;
    const gridEl = sectionEl.querySelector<HTMLElement>('.about-gallery-grid')!;
    const chevronEl = sectionEl.querySelector<HTMLElement>('.about-accordion-chevron')!;

    const section: AboutAccordionSection = {
      folder, sectionEl, headerEl, contentEl, gridEl, chevronEl,
      populated: false, open: false,
    };

    headerEl.addEventListener('click', () => manager.toggleSection(section));
  }

  managers.set(sectionId, manager);
}

// Re-measure open section height on window resize
window.addEventListener('resize', () => {
  for (const m of managers.values()) m.remeasure();
});

// ---------------------------------------------------------------------------
// Reveal / hide animation
// ---------------------------------------------------------------------------

const DURATION = 4000;
const SLIDE_PX = 30;
const REVEAL_DURATION = 0.3;
const HIDE_DURATION = 0.05;
const STAGGER = 0.025;

interface OverlayState {
  el: HTMLElement;
  inner: HTMLElement;
  revealed: boolean;
  timeline: gsap.core.Timeline | null;
}

const overlays: Map<string, OverlayState> = new Map();

function revealOverlay(id: string) {
  const state = overlays.get(id);
  if (!state || state.revealed) return;
  state.revealed = true;
  state.timeline?.kill();

  state.el.style.opacity = '1';
  state.el.style.pointerEvents = 'auto';

  const animTargets = state.el.querySelectorAll<HTMLElement>(
    '.about-card, .about-gallery-heading, .about-overlay-title, .about-overlay-subtitle, .about-accordion-header, .thankyou-frame'
  );
  const tl = gsap.timeline();
  tl.fromTo(animTargets,
    { opacity: 0, y: SLIDE_PX },
    { opacity: 1, y: 0, duration: REVEAL_DURATION, stagger: STAGGER, ease: 'power2.out' },
  );
  state.timeline = tl;

  if (id === 'about-3') startNameRotation(state.el);
}

function hideOverlay(id: string) {
  const state = overlays.get(id);
  if (!state || !state.revealed) return;
  state.revealed = false;
  state.timeline?.kill();

  if (id === 'about-3') stopNameRotation();
  managers.get(id)?.resetAccordion();

  const animTargets = state.el.querySelectorAll<HTMLElement>(
    '.about-card, .about-gallery-heading, .about-overlay-title, .about-overlay-subtitle, .about-accordion-header, .thankyou-frame'
  );
  const tl = gsap.timeline({
    onComplete: () => {
      state.el.style.opacity = '0';
      state.el.style.pointerEvents = 'none';
      // Reset scroll position for next visit
      state.inner.scrollTop = 0;
    },
  });
  tl.to(animTargets, { opacity: 0, y: SLIDE_PX, duration: HIDE_DURATION, stagger: STAGGER * 0.5, ease: 'power2.in' });
  state.timeline = tl;
}

// ---------------------------------------------------------------------------
// Rotating name animation for the Thank You section
// ---------------------------------------------------------------------------

let nameInterval: ReturnType<typeof setInterval> | null = null;

function startNameRotation(el: HTMLElement) {
  const nameSpan = el.querySelector<HTMLElement>('.thankyou-name');
  const photoImg = el.querySelector<HTMLImageElement>('.thankyou-photo');
  if (!nameSpan || !photoImg || THANKYOU_ENTRIES.length === 0) return;

  // Preload all family images to avoid flash on crossfade
  for (const entry of THANKYOU_ENTRIES) {
    if (entry.url) {
      const preload = new Image();
      preload.src = entry.url;
    }
  }

  let idx = 0;

  function showEntry() {
    const entry = THANKYOU_ENTRIES[idx];
    // Fade out name + photo simultaneously
    gsap.to(nameSpan!, {
      opacity: 0, y: -SLIDE_PX / 2, duration: 0.3, ease: 'power2.in',
      onComplete: () => {
        nameSpan!.textContent = entry.name;
        gsap.fromTo(nameSpan!,
          { opacity: 0, y: SLIDE_PX },
          { opacity: 1, y: 0, duration: REVEAL_DURATION, ease: 'power2.out' },
        );
      },
    });
    gsap.to(photoImg!, {
      opacity: 0, duration: 0.3, ease: 'power2.in',
      onComplete: () => {
        if (entry.url) photoImg!.src = entry.url;
        gsap.to(photoImg!, { opacity: 1, duration: 0.5, ease: 'power2.out' });
      },
    });
    idx = (idx + 1) % THANKYOU_ENTRIES.length;
  }

  // Show first entry immediately (no fade-out)
  const first = THANKYOU_ENTRIES[0];
  nameSpan.textContent = first.name;
  if (first.url) photoImg.src = first.url;
  gsap.fromTo(nameSpan, { opacity: 0, y: SLIDE_PX }, { opacity: 1, y: 0, duration: REVEAL_DURATION, ease: 'power2.out' });
  gsap.fromTo(photoImg, { opacity: 0 }, { opacity: 1, duration: 0.5, ease: 'power2.out' });
  idx = 1;

  nameInterval = setInterval(showEntry, DURATION);
}

function stopNameRotation() {
  if (nameInterval !== null) {
    clearInterval(nameInterval);
    nameInterval = null;
  }
}

/**
 * Creates a continuous scroll handler for an about overlay inner container.
 * Mirrors the projects overlay pattern: applies raw wheel delta, reports boundaries.
 */
function makeContinuousScrollHandler(inner: HTMLElement) {
  return (deltaY: number): 'consumed' | 'at-start' | 'at-end' => {
    const maxScroll = inner.scrollHeight - inner.clientHeight;
    if (maxScroll <= 0) {
      // Content fits without scrolling — pass through to section navigation
      return deltaY < 0 ? 'at-start' : 'at-end';
    }

    if (deltaY < 0 && inner.scrollTop <= 0) return 'at-start';
    if (deltaY > 0 && inner.scrollTop >= maxScroll - 1) return 'at-end';

    inner.scrollTop = Math.max(0, Math.min(maxScroll, inner.scrollTop + deltaY));
    return 'consumed';
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function getSectionIndex(sectionId: string): number {
  return SECTIONS.findIndex(s => s.id === sectionId);
}

export function initAboutOverlays() {
  const interestsEl = document.getElementById('about-interests-overlay');
  const lifeEl = document.getElementById('about-life-overlay');

  if (interestsEl) {
    const inner = interestsEl.querySelector('.about-overlay-inner') as HTMLElement;
    inner.style.height = '100%';
    inner.style.overflowY = 'hidden';

    initAccordion(interestsEl, inner, 'about-2');

    // Hide headings/titles/accordion headers initially (cards hidden via CSS)
    gsap.set(interestsEl.querySelectorAll('.about-accordion-header, .about-overlay-title'), { opacity: 0, y: SLIDE_PX });
    overlays.set('about-2', { el: interestsEl, inner, revealed: false, timeline: null });

    // Register scroll handler so wheel events scroll the inner container
    const idx = getSectionIndex('about-2');
    if (idx >= 0) {
      registerSectionScrollHandler(idx, makeContinuousScrollHandler(inner));
    }
  }

  if (lifeEl) {
    const inner = lifeEl.querySelector('.about-overlay-inner') as HTMLElement;
    inner.style.height = '100%';
    inner.style.overflowY = 'hidden';

    // Friends section uses accordion (family photos cycle in the glass frame)
    initAccordion(lifeEl, inner, 'about-3');

    gsap.set(lifeEl.querySelectorAll('.about-gallery-heading, .about-overlay-title, .about-accordion-header, .thankyou-frame'), { opacity: 0, y: SLIDE_PX });
    overlays.set('about-3', { el: lifeEl, inner, revealed: false, timeline: null });

    const idx = getSectionIndex('about-3');
    if (idx >= 0) {
      registerSectionScrollHandler(idx, makeContinuousScrollHandler(inner));
    }
  }
}

/**
 * Called from the animation loop. Pass the section id ('about-2' or 'about-3')
 * and whether it should be visible.
 */
export function setAboutOverlayVisible(sectionId: string, visible: boolean) {
  if (visible) {
    revealOverlay(sectionId);
  } else {
    hideOverlay(sectionId);
  }
}
