import gsap from 'gsap';
import { registerSectionScrollHandler } from '../scroll';
import { SECTIONS } from './sectionConfig';

// Auto-discover project images via Vite glob
const myProjectImages = import.meta.glob<string>(
  '/images/my_projects/*.{png,jpg,jpeg}',
  { eager: true, query: '?url', import: 'default' },
);
const passionProjectImages = import.meta.glob<string>(
  '/images/passion_projects/*.{png,jpg,jpeg}',
  { eager: true, query: '?url', import: 'default' },
);

function img(path: string): string {
  return myProjectImages[path] ?? passionProjectImages[path] ?? path;
}

export interface ProjectCard {
  title: string;
  image: string;
  imageDark?: string;
  href?: string;
  description?: string;
  affiliation?: string;   // org shown as "@ <affiliation>" on its own overlay line
  year?: number;
}

const topSectionCards: ProjectCard[] = [
  { title: 'Safe Physical Human-Robot Interaction',
    image: img('/images/my_projects/rt_control_project.png'), year: 2026,
    href: 'https://www.linkedin.com/feed/update/urn:li:activity:7493793705053732864/?utm_source=share&utm_medium=member_desktop&rcm=ACoAAEMVFHsBQWEyET2idKaPFuk_OFfqSwWwzyI',
    affiliation: 'Symbiokinetics',
    description: 'Real-time control for safe physical human-robot interaction.' },
  { title: 'Global Robotics Industry Funding Report 2025',
    image: img('/images/my_projects/iab_report.png'), year: 2025,
    href: 'https://www.ieee-ras.org/global-robotics-industry-funding-report-2025/',
    affiliation: 'IEEE RAS',
    description: 'Named contributor to the IEEE RAS Industrial Activities Board’s inaugural robotics funding report.' },
  { title: 'High-Rate Custom Baremetal Firmware',
    image: img('/images/my_projects/STM_project.png'), year: 2025,
    affiliation: 'Symbiokinetics',
    description: 'Baremetal STM32 firmware for realtime data aquisition and streaming at high sample rates.' },
  { title: 'Batched K-Means on GPU',
    image: img('/images/my_projects/kmeans_infographic.png'), year: 2023,
    href: 'https://colab.research.google.com/drive/1Il_OyESH92iVapFas0oTarF74IQcM3sq?usp=sharing',
    affiliation: 'Bongard AI',
    description: 'GPU-accelerated batched K-Means clustering written from scatch using CUDA C and Python for massively parallel computation.' },
  { title: 'Simulating Backdrivability',
    image: img('/images/my_projects/simulation_project.png'), year: 2023,
    affiliation: 'Symbiokinetics',
    description: 'Real-time rigid-body simulation for prototyping compliant control strategies.' },
  { title: 'Pneumatic Soft Robot Manufacturing',
    image: img('/images/my_projects/BML_project.jpeg'), year: 2024,
    affiliation: 'Berkeley BMLab',
    description: 'Developed a repeatable heat-seal process for bonding LDPE pneumatic pouches to pressure valves, eliminating chronic seal failures under repeated strain.' },
  { title: 'Autonomous Sailboat Electronics',
    image: img('/images/my_projects/TAFL_project.jpeg'), year: 2024,
    affiliation: 'Berkeley TAFLab',
    description: 'Designed and assembled the electronics for a fleet of autonomous sailboats: IMU, magnetic encoders, wind vane, radio telemetry, and motor drivers for propulsion, rudder, and sail actuation, all running on an Arduino.' },
];

const bottomSectionCards: ProjectCard[] = [
  { title: 'Contact-Rich Manipulation & Skill Transfer',
    image: img('/images/passion_projects/control_sim.png'), year: 2026,
    description: 'Robot learning for contact-rich manipulation and skill transfer.' },
  { title: 'Handsi',
    image: img('/images/passion_projects/handsi_project.png'), year: 2025,
    href: 'https://github.com/AlexShaooo/handsi',
    description: 'Customizable Desktop App mapping hand gestures to full OS actions: cursor, clicks, scrolling, volume, zoom, copy/paste, tab switching.' },
  { title: 'TDS Publication: Batched K-Means', image: img('/images/passion_projects/kmeans_project.jpg'), year: 2023,
    href: 'https://towardsdatascience.com/batched-k-means-with-python-numba-and-cuda-c-3d4946c587b9/',
    description: 'Towards Data Science publication with 10k+ reads.' },
  { title: 'Project Portfolio (this webpage)', image: img('/images/passion_projects/dark_project.png'), year: 2026,
    href: 'https://github.com/AlexShaooo/AlexShao',
    description: 'Interactive personal website. Runs node simulation with decay based neuron logic. \n\n Try to Toggle the Theme!!!' },
];

// --- Staggered reveal/hide constants ---
const REVEAL_DELAY_MS = 300;
const REVEAL_STAGGER_DELAY = 0.1;
const REVEAL_DURATION = 0.5;
const HIDE_STAGGER_DELAY = 0.05;
const HIDE_DURATION = 0.1;
const SLIDE_PX = 30;

// --- Per-overlay state ---

interface SectionReveal {
  targets: HTMLElement[];
  timeline: gsap.core.Timeline | null;
  revealed: boolean;
}

interface OverlayState {
  el: HTMLElement;
  inner: HTMLElement;
  sectionReveals: SectionReveal[];
  visible: boolean;
  revealDelayTimer: ReturnType<typeof setTimeout> | null;
  awaitingInitialReveal: boolean;
  isInitialReveal: boolean;
}

const overlays: Map<string, OverlayState> = new Map();

/** Build per-element reveal groups for an overlay. */
function buildRevealGroups(state: OverlayState) {
  state.sectionReveals = [];
  for (const section of state.el.querySelectorAll('.projects-section')) {
    const title = section.querySelector('.projects-section-title');
    if (title) {
      state.sectionReveals.push({ targets: [title as HTMLElement], timeline: null, revealed: false });
    }
    const row = section.querySelector('.projects-row');
    if (!row) continue;
    const cards = Array.from(row.querySelectorAll('.project-card')) as HTMLElement[];
    const rowGroups = new Map<number, HTMLElement[]>();
    for (const card of cards) {
      const top = card.offsetTop;
      let key = -1;
      for (const k of rowGroups.keys()) {
        if (Math.abs(k - top) < 4) { key = k; break; }
      }
      if (key === -1) {
        rowGroups.set(top, [card]);
      } else {
        rowGroups.get(key)!.push(card);
      }
    }
    const sortedKeys = [...rowGroups.keys()].sort((a, b) => a - b);
    for (const k of sortedKeys) {
      state.sectionReveals.push({ targets: rowGroups.get(k)!, timeline: null, revealed: false });
    }
  }
}

function revealSection(sr: SectionReveal) {
  if (sr.revealed) return;
  sr.revealed = true;
  if (sr.timeline) sr.timeline.kill();
  sr.timeline = gsap.timeline();
  sr.timeline.set(sr.targets, { opacity: 0, y: SLIDE_PX });
  sr.timeline.to(sr.targets, {
    opacity: 1, y: 0,
    duration: REVEAL_DURATION, ease: 'power2.out',
    stagger: REVEAL_STAGGER_DELAY,
  });
}

function hideSection(sr: SectionReveal): boolean {
  if (!sr.revealed) return false;
  sr.revealed = false;
  if (sr.timeline) sr.timeline.kill();
  const reversed = [...sr.targets].reverse();
  sr.timeline = gsap.timeline();
  sr.timeline.to(reversed, {
    opacity: 0, y: -SLIDE_PX,
    duration: HIDE_DURATION, ease: 'power2.in',
    stagger: HIDE_STAGGER_DELAY,
  });
  return true;
}

function checkScrollReveals(state: OverlayState) {
  if (!state.visible || state.awaitingInitialReveal) return;
  const innerRect = state.inner.getBoundingClientRect();
  const viewTop = innerRect.top;
  const viewBottom = innerRect.bottom;
  const animateZone = (viewBottom - viewTop) * 0.4;

  const toInstant: SectionReveal[] = [];
  const toAnimate: SectionReveal[] = [];

  for (const sr of state.sectionReveals) {
    if (sr.revealed || sr.targets.length === 0) continue;
    const elRect = sr.targets[0].getBoundingClientRect();
    if (elRect.top + elRect.height / 2 > viewBottom) continue;
    if (elRect.bottom < viewTop) {
      toInstant.push(sr);
    } else if (state.isInitialReveal || elRect.top >= viewBottom - animateZone) {
      toAnimate.push(sr);
    } else {
      toInstant.push(sr);
    }
  }

  for (const sr of toInstant) {
    sr.revealed = true;
    if (sr.timeline) sr.timeline.kill();
    gsap.set(sr.targets, { opacity: 1, y: 0 });
  }

  if (toAnimate.length === 0) return;

  if (toAnimate.length === 1) {
    revealSection(toAnimate[0]);
    return;
  }

  const allTargets: HTMLElement[] = [];
  for (const sr of toAnimate) {
    sr.revealed = true;
    if (sr.timeline) sr.timeline.kill();
    for (const t of sr.targets) allTargets.push(t);
  }

  const tl = gsap.timeline();
  tl.set(allTargets, { opacity: 0, y: SLIDE_PX });
  tl.to(allTargets, {
    opacity: 1, y: 0,
    duration: REVEAL_DURATION, ease: 'power2.out',
    stagger: REVEAL_STAGGER_DELAY,
  });

  for (const sr of toAnimate) {
    sr.timeline = tl;
  }
}

function revealIn(state: OverlayState) {
  if (state.visible) return;
  state.visible = true;

  state.el.style.opacity = '1';
  state.el.style.pointerEvents = 'auto';

  // Reset scroll position
  state.inner.scrollTop = 0;

  // Delay card reveals so the camera settles before content appears
  state.awaitingInitialReveal = true;
  if (state.revealDelayTimer) clearTimeout(state.revealDelayTimer);
  state.revealDelayTimer = setTimeout(() => {
    state.awaitingInitialReveal = false;
    if (!state.visible) return;
    state.isInitialReveal = true;
    checkScrollReveals(state);
    state.isInitialReveal = false;
  }, REVEAL_DELAY_MS);
}

function revealOut(state: OverlayState) {
  if (!state.visible) return;
  state.visible = false;

  state.awaitingInitialReveal = false;
  if (state.revealDelayTimer) { clearTimeout(state.revealDelayTimer); state.revealDelayTimer = null; }

  let lastTimeline: gsap.core.Timeline | null = null;
  for (const sr of state.sectionReveals) {
    hideSection(sr);
    if (sr.timeline) lastTimeline = sr.timeline;
  }

  if (lastTimeline) {
    lastTimeline.eventCallback('onComplete', () => {
      if (!state.visible) {
        state.el.style.opacity = '0';
        state.el.style.pointerEvents = 'none';
        state.inner.scrollTop = 0;
      }
    });
  } else {
    state.el.style.opacity = '0';
    state.el.style.pointerEvents = 'none';
  }
}

const GITHUB_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></svg>';
const EXTERNAL_LINK_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';

function createCard(data: ProjectCard): HTMLElement {
  const card = document.createElement('div');
  card.className = 'project-card';
  if (data.description || data.title || data.affiliation) card.classList.add('has-description');
  if (!data.image) card.classList.add('no-image');

  const imgWrapper = document.createElement('div');
  imgWrapper.className = 'project-card-img';
  if (data.image) {
    imgWrapper.style.backgroundImage = `url(${data.image})`;
  }

  if (data.imageDark) {
    const updateImg = () => {
      const isDark = document.documentElement.dataset.theme !== 'light';
      imgWrapper.style.backgroundImage = `url(${isDark ? data.imageDark : data.image})`;
    };
    updateImg();
    window.addEventListener('theme-change', updateImg);
  }

  if (data.title || data.description || data.affiliation) {
    const overlay = document.createElement('div');
    overlay.className = 'project-card-overlay';
    if (data.title) {
      const t = document.createElement('span');
      t.className = 'project-card-overlay-title';
      t.textContent = data.title;
      overlay.appendChild(t);
    }
    if (data.description) {
      const p = document.createElement('p');
      p.textContent = data.description;
      overlay.appendChild(p);
    }
    if (data.affiliation) {
      const affil = document.createElement('span');
      affil.className = 'project-card-overlay-affil';
      affil.textContent = `@ ${data.affiliation}`;
      overlay.appendChild(affil);
    }
    imgWrapper.appendChild(overlay);
  }

  card.appendChild(imgWrapper);

  const footer = document.createElement('div');
  footer.className = 'project-card-footer';

  if (data.title) {
    const h3 = document.createElement('h3');
    h3.textContent = data.title;
    footer.appendChild(h3);
  }

  if (data.year) {
    const year = document.createElement('span');
    year.className = 'project-card-year';
    year.textContent = String(data.year);
    footer.appendChild(year);
  }

  if (data.href) {
    card.style.cursor = 'pointer';
    card.addEventListener('click', () => {
      window.open(data.href, '_blank', 'noopener');
    });

    const link = document.createElement('a');
    link.className = 'project-card-link';
    link.href = data.href;
    link.target = '_blank';
    link.rel = 'noopener';
    link.innerHTML = data.href.includes('github.com') ? GITHUB_ICON : EXTERNAL_LINK_ICON;
    link.addEventListener('click', (e) => e.stopPropagation());
    footer.appendChild(link);
  }

  card.appendChild(footer);

  return card;
}

/**
 * On touch devices, reveal a tile's description only while the tile sits near the
 * vertical center of the viewport, so the background image stays visible for the
 * rest of the scroll. Toggles `.in-view`, which CSS consumes under `(hover: none)`.
 * The band (30% of the tile's own height around center) keeps the overlay off for
 * roughly half of each tile's travel.
 */
function updateCenterReveal(state: OverlayState): void {
  const innerRect = state.inner.getBoundingClientRect();
  const viewMid = innerRect.top + innerRect.height / 2;
  for (const card of state.inner.querySelectorAll<HTMLElement>('.project-card')) {
    const rect = card.getBoundingClientRect();
    const cardMid = rect.top + rect.height / 2;
    const nearCenter = Math.abs(cardMid - viewMid) < rect.height * 0.6;
    card.classList.toggle('in-view', nearCenter);
  }
}

/** Continuous scroll handler for an overlay's inner container. */
function makeContinuousScrollHandler(state: OverlayState) {
  return (deltaY: number): 'consumed' | 'at-start' | 'at-end' => {
    const inner = state.inner;
    const maxScroll = inner.scrollHeight - inner.clientHeight;
    if (maxScroll <= 0) {
      return deltaY < 0 ? 'at-start' : 'at-end';
    }

    if (deltaY < 0 && inner.scrollTop <= 0) return 'at-start';
    if (deltaY > 0 && inner.scrollTop >= maxScroll - 1) return 'at-end';

    inner.scrollTop = Math.max(0, Math.min(maxScroll, inner.scrollTop + deltaY));
    checkScrollReveals(state);
    updateCenterReveal(state);
    return 'consumed';
  };
}

function getSectionIndex(sectionId: string): number {
  return SECTIONS.findIndex(s => s.id === sectionId);
}

function initOverlay(
  elementId: string,
  sectionId: string,
  cards: ProjectCard[],
  rowClass: string,
) {
  const el = document.getElementById(elementId);
  if (!el) return;

  const row = el.querySelector(`.${rowClass}`);
  if (row) {
    for (const data of cards) {
      row.appendChild(createCard(data));
    }
  }

  const inner = el.querySelector('.projects-inner') as HTMLElement;
  if (!inner) return;

  inner.style.height = '100%';
  inner.style.overflowY = 'hidden';

  // Hide all cards and titles initially
  for (const section of el.querySelectorAll('.projects-section')) {
    const title = section.querySelector('.projects-section-title') as HTMLElement | null;
    if (title) gsap.set(title, { opacity: 0, y: SLIDE_PX });
    const cardEls = section.querySelectorAll('.project-card');
    gsap.set(cardEls, { opacity: 0, y: SLIDE_PX });
  }

  const state: OverlayState = {
    el,
    inner,
    sectionReveals: [],
    visible: false,
    revealDelayTimer: null,
    awaitingInitialReveal: false,
    isInitialReveal: false,
  };

  requestAnimationFrame(() => {
    buildRevealGroups(state);
    inner.scrollTop = 0;
    updateCenterReveal(state);
  });

  // Register continuous scroll handler
  const idx = getSectionIndex(sectionId);
  if (idx >= 0) {
    registerSectionScrollHandler(idx, makeContinuousScrollHandler(state));
  }

  window.addEventListener('resize', () => {
    buildRevealGroups(state);
  });

  overlays.set(sectionId, state);
}

export function initProjectsOverlay() {
  initOverlay('projects-overlay', 'projects-1', topSectionCards, 'projects-row-top');
  initOverlay('projects-passion-overlay', 'projects-2', bottomSectionCards, 'projects-row-bottom');
}

export function setProjectsOverlayVisible(sectionId: string, visible: boolean) {
  const state = overlays.get(sectionId);
  if (!state) return;
  if (visible) {
    revealIn(state);
  } else {
    revealOut(state);
  }
}
