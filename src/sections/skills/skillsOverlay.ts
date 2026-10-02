/**
 * HTML overlay controller for the Skills section.
 * Accordion per category, domain-themed cards (terminal / register / training).
 * Three-tiered interaction: appear (typewriter) → hover (preview) → click (expand).
 */
import gsap from 'gsap';
import { registerSectionScrollHandler } from '../../scroll';
import { SECTIONS } from '../sectionConfig';
import { SKILL_CATEGORIES, type SkillItem, type CategoryTheme } from './skillsData';
import { buildSkillCard, buildRegisterHeader } from './skillCardBuilders';
import { typewrite, type TypewriterHandle } from './typewriter';
import { createAccordionManager, type BaseAccordionSection } from '../accordion';

// ---------------------------------------------------------------------------
// Animation constants
// ---------------------------------------------------------------------------

const SLIDE_PX = 30;
const REVEAL_DURATION = 0.3;
const HIDE_DURATION = 0.05;
const STAGGER = 0.025;
const TYPEWRITER_CHAR_MS = 35;
const TYPEWRITER_STAGGER_MS = 80;  // delay between card typewriters on accordion open
const BIT_SCAN_DELAY_MS = 30;     // delay between each bit lighting up on hover

// ---------------------------------------------------------------------------
// State tracking
// ---------------------------------------------------------------------------

/** All active typewriter handles — cancelled on section close / overlay hide */
let activeTypewriters: TypewriterHandle[] = [];

/** Currently expanded card (click-to-expand). One at a time globally. */
let expandedCard: {
  cardEl: HTMLElement;
  expandEl: HTMLElement;
  sectionIdx: number;
} | null = null;

/** Active bit-scan animation timeouts (for register hover) */
let bitScanTimeouts: ReturnType<typeof setTimeout>[] = [];

/** Active training count-up animation frame */
let trainingAnimFrame: number | null = null;

/** Per-card typewriter from accordion open — allows targeted cancellation on hover */
const cardOpenTypewriters = new WeakMap<HTMLElement, TypewriterHandle>();

// ---------------------------------------------------------------------------
// Accordion state (uses shared accordion manager)
// ---------------------------------------------------------------------------

interface SkillsAccordionSection extends BaseAccordionSection {
  catId: string;
  theme: CategoryTheme;
  cardsContainer: HTMLElement;
  cards: { el: HTMLElement; skill: SkillItem }[];
}

let skillsManager: ReturnType<typeof createAccordionManager<SkillsAccordionSection>> | null = null;
let sectionCount = 0;

// ---------------------------------------------------------------------------
// Build DOM from data
// ---------------------------------------------------------------------------

function buildSkillsDOM(container: HTMLElement): void {
  for (const cat of SKILL_CATEGORIES) {
    const section = document.createElement('div');
    section.className = 'skills-accordion-section';
    section.dataset.category = cat.id;

    // Header
    const header = document.createElement('button');
    header.className = 'skills-accordion-header';
    const heading = document.createElement('h3');
    heading.className = 'skills-accordion-heading';
    heading.textContent = cat.label;
    const chevron = document.createElement('span');
    chevron.className = 'skills-accordion-chevron';
    chevron.innerHTML = '&#x276F;';
    header.appendChild(heading);
    header.appendChild(chevron);
    section.appendChild(header);

    // Content wrapper
    const content = document.createElement('div');
    content.className = 'skills-accordion-content';

    const cardsContainer = document.createElement('div');
    cardsContainer.className = 'skills-cards';
    cardsContainer.dataset.theme = cat.theme;

    // Register theme: add table header row
    if (cat.theme === 'register') {
      cardsContainer.appendChild(buildRegisterHeader());
    }

    // Build cards
    const cards: { el: HTMLElement; skill: SkillItem }[] = [];
    for (const skill of cat.skills) {
      const cardEl = buildSkillCard(skill, cat.theme);
      cardsContainer.appendChild(cardEl);
      cards.push({ el: cardEl, skill });
    }

    content.appendChild(cardsContainer);
    section.appendChild(content);
    container.appendChild(section);

    // Store reference for accordion logic (populated in initAccordion)
    section._cards = cards;
    section._theme = cat.theme;
  }
}

// Extend HTMLElement for temporary storage during build
declare global {
  interface HTMLElement {
    _cards?: { el: HTMLElement; skill: SkillItem }[];
    _theme?: CategoryTheme;
  }
}

// ---------------------------------------------------------------------------
// Accordion logic (uses shared accordion manager)
// ---------------------------------------------------------------------------

/** Shared cleanup for close + reset: cancel typewriters, collapse card, reset card state. */
function cleanupCards(section: SkillsAccordionSection): void {
  cancelAllTypewriters();
  if (expandedCard) collapseExpandedCard(false);

  for (const { el } of section.cards) {
    gsap.set(el, { opacity: 0, y: SLIDE_PX });
    const nameEl = el.querySelector<HTMLElement>('.skill-typed-name');
    if (nameEl) nameEl.textContent = '';
    el.querySelectorAll('.skill-bit').forEach((b: Element) => b.classList.remove('scanning'));
  }

  const headerRow = section.cardsContainer.querySelector<HTMLElement>('.skill-register-header-row');
  if (headerRow) gsap.set(headerRow, { opacity: 0 });
}

function initAccordion(overlay: HTMLElement, inner: HTMLElement): void {
  skillsManager = createAccordionManager<SkillsAccordionSection>(inner, {
    onAfterOpen(section) {
      const cardEls = section.cards.map((c: { el: HTMLElement }) => c.el);

      if (section.theme === 'terminal') {
        cardEls.forEach((el: HTMLElement, i: number) => {
          gsap.set(el, { opacity: 1, y: 0 });
          const nameEl = el.querySelector<HTMLElement>('.skill-typed-name');
          if (nameEl) {
            const skill = section.cards[i].skill;
            const displayText = skill.years ? `${skill.name}\t${skill.years}` : skill.name;
            const timeout = setTimeout(() => {
              const handle = typewrite(nameEl, displayText, TYPEWRITER_CHAR_MS);
              activeTypewriters.push(handle);
              cardOpenTypewriters.set(el, handle);
            }, i * TYPEWRITER_STAGGER_MS + 150);
            bitScanTimeouts.push(timeout);
          }
        });
      } else if (section.theme === 'plain') {
        // Plain theme: appear instantly, no animation
        gsap.set(cardEls, { opacity: 1, y: 0 });
      } else {
        gsap.fromTo(cardEls,
          { opacity: 0, y: SLIDE_PX },
          { opacity: 1, y: 0, duration: REVEAL_DURATION, stagger: STAGGER, ease: 'power2.out', delay: 0.15 },
        );
      }

      const headerRow = section.cardsContainer.querySelector<HTMLElement>('.skill-register-header-row');
      if (headerRow) {
        gsap.fromTo(headerRow, { opacity: 0 }, { opacity: 1, duration: 0.3, delay: 0.1 });
      }
    },
    onClose: cleanupCards,
    onReset: cleanupCards,
  });

  const sectionEls = overlay.querySelectorAll<HTMLElement>('.skills-accordion-section');

  for (const sectionEl of sectionEls) {
    const catId = sectionEl.dataset.category!;
    const headerEl = sectionEl.querySelector<HTMLElement>('.skills-accordion-header')!;
    const contentEl = sectionEl.querySelector<HTMLElement>('.skills-accordion-content')!;
    const cardsContainer = sectionEl.querySelector<HTMLElement>('.skills-cards')!;
    const chevronEl = sectionEl.querySelector<HTMLElement>('.skills-accordion-chevron')!;
    const theme = sectionEl._theme ?? 'terminal';
    const cards = sectionEl._cards ?? [];

    delete sectionEl._cards;
    delete sectionEl._theme;

    const section: SkillsAccordionSection = {
      catId, theme, sectionEl, headerEl, contentEl, cardsContainer, chevronEl, cards, open: false,
    };

    headerEl.addEventListener('click', () => skillsManager!.toggleSection(section));

    for (const { el, skill } of cards) {
      attachHoverHandler(el, skill, theme);
      attachClickHandler(el, skill, theme, sectionCount);
    }

    sectionCount++;
  }
}

window.addEventListener('resize', () => {
  skillsManager?.remeasure();
});

// ---------------------------------------------------------------------------
// Hover handlers (per-theme)
// ---------------------------------------------------------------------------

function attachHoverHandler(cardEl: HTMLElement, skill: SkillItem, theme: CategoryTheme): void {
  let hoverTypewriters: TypewriterHandle[] = [];
  let hovering = false;
  let enterTimer: ReturnType<typeof setTimeout> | null = null;
  let cudaTimeouts: ReturnType<typeof setTimeout>[] = [];

  const restoreText = skill.years ? `${skill.name}\t${skill.years}` : skill.name;

  cardEl.addEventListener('mouseenter', () => {
    hovering = true;

    if (theme === 'terminal') {
      const nameEl = cardEl.querySelector<HTMLElement>('.skill-typed-name');
      if (nameEl && skill.hoverLine) {
        // Cancel previous hover state for this card only
        for (const tw of hoverTypewriters) tw.cancel();
        hoverTypewriters = [];
        for (const t of cudaTimeouts) clearTimeout(t);
        cudaTimeouts = [];
        if (enterTimer) { clearTimeout(enterTimer); enterTimer = null; }
        gsap.killTweensOf(nameEl);
        nameEl.style.opacity = '1';
        const openTw = cardOpenTypewriters.get(cardEl);
        if (openTw) { openTw.cancel(); cardOpenTypewriters.delete(cardEl); }

        if (skill.parallelPrint) {
          // CUDA: 4 threads each write a contiguous chunk simultaneously
          nameEl.textContent = '';
          const text = skill.hoverLine;
          const charSpans: HTMLElement[] = [];
          for (const ch of text) {
            const span = document.createElement('span');
            span.textContent = ch;
            span.style.opacity = '0';
            span.style.transition = 'opacity 0.06s';
            nameEl.appendChild(span);
            charSpans.push(span);
          }

          // Each thread writes its chunk at 1/4 normal speed (100ms vs 25ms)
          const THREADS = 4;
          const CHAR_DELAY = 100;
          const chunkSize = Math.ceil(charSpans.length / THREADS);
          for (let thread = 0; thread < THREADS; thread++) {
            const start = chunkSize * thread;
            const end = Math.min(start + chunkSize, charSpans.length);
            for (let i = start; i < end; i++) {
              const delay = (i - start) * CHAR_DELAY;
              const s = charSpans[i];
              const t = setTimeout(() => { s.style.opacity = '1'; }, delay);
              cudaTimeouts.push(t);
            }
          }
        } else {
          const handle = typewrite(nameEl, skill.hoverLine, 25);
          hoverTypewriters.push(handle);
          activeTypewriters.push(handle);
          // After typing completes, "press enter" → animated fade return
          handle.done.then(() => {
            if (!hovering) return;
            enterTimer = setTimeout(() => {
              if (!hovering) return;
              gsap.to(nameEl, {
                opacity: 0,
                duration: 0.12,
                onComplete: () => {
                  if (!hovering) return;
                  nameEl.textContent = restoreText;
                  gsap.to(nameEl, { opacity: 1, duration: 0.15 });
                },
              });
            }, 400);
          });
        }
      }
    } else if (theme === 'training') {
      animateTrainingCountUp(cardEl);
    }
  });

  cardEl.addEventListener('mouseleave', () => {
    hovering = false;

    if (theme === 'terminal') {
      for (const tw of hoverTypewriters) tw.cancel();
      hoverTypewriters = [];
      for (const t of cudaTimeouts) clearTimeout(t);
      cudaTimeouts = [];
      if (enterTimer) { clearTimeout(enterTimer); enterTimer = null; }
      const nameEl = cardEl.querySelector<HTMLElement>('.skill-typed-name');
      if (nameEl) {
        gsap.killTweensOf(nameEl);
        nameEl.style.opacity = '1';
        nameEl.textContent = restoreText;
      }
    } else if (theme === 'training') {
      if (trainingAnimFrame) {
        cancelAnimationFrame(trainingAnimFrame);
        trainingAnimFrame = null;
      }
      resetTrainingMetric(cardEl);
    }
  });
}

// ---------------------------------------------------------------------------
// Training count-up animation
// ---------------------------------------------------------------------------

function animateTrainingCountUp(cardEl: HTMLElement): void {
  const metric = cardEl.querySelector<HTMLElement>('.skill-training-metric');
  if (!metric) return;

  const date = metric.dataset.date ?? '01/01/2020';
  const targetLoss = parseFloat(metric.dataset.loss ?? '0');
  const targetProf = parseFloat(metric.dataset.prof ?? '0');

  const startTime = performance.now();
  const duration = 600; // ms

  function step(now: number) {
    const t = Math.max(0, Math.min(1, (now - startTime) / duration));
    const ease = t * (2 - t); // ease-out quadratic
    const loss = (targetLoss * (1 + (1 - ease) * 3)).toFixed(4); // loss starts high, converges
    const prof = (targetProf * ease).toFixed(2);
    metric!.textContent = `Date: ${date} | loss: ${loss} | proficiency: ${prof}`;
    if (t < 1) {
      trainingAnimFrame = requestAnimationFrame(step);
    }
  }

  // Start from zeros
  metric.textContent = `Date: ${date} | loss: 0.0000 | proficiency: 0.00`;
  trainingAnimFrame = requestAnimationFrame(step);
}

function resetTrainingMetric(cardEl: HTMLElement): void {
  const metric = cardEl.querySelector<HTMLElement>('.skill-training-metric');
  if (!metric) return;
  const date = metric.dataset.date ?? '01/01/2020';
  const loss = metric.dataset.loss ?? '0';
  const prof = metric.dataset.prof ?? '0';
  metric.textContent = `Date: ${date} | loss: ${loss} | proficiency: ${prof}`;
}

// ---------------------------------------------------------------------------
// Click-to-expand
// ---------------------------------------------------------------------------

function attachClickHandler(cardEl: HTMLElement, skill: SkillItem, theme: CategoryTheme, sectionIdx: number): void {
  cardEl.addEventListener('click', (e) => {
    e.stopPropagation();

    const expandEl = cardEl.querySelector<HTMLElement>('.skill-expand');
    if (!expandEl) return;

    // Toggle: if this card is already expanded, collapse it
    if (expandedCard?.cardEl === cardEl) {
      collapseExpandedCard(true);
      return;
    }

    // Collapse any other expanded card first
    if (expandedCard) {
      collapseExpandedCard(true);
    }

    // Expand this card
    expandedCard = { cardEl, expandEl, sectionIdx };
    cardEl.classList.add('expanded');

    gsap.set(expandEl, { height: 'auto' });
    const autoHeight = expandEl.scrollHeight;
    gsap.fromTo(expandEl, { height: 0 }, { height: autoHeight, duration: 0.4, ease: 'power2.out' });

    // Reveal expand lines
    const lines = expandEl.querySelectorAll<HTMLElement>('.skill-expand-line');
    if (theme === 'terminal' && skill.parallelPrint) {
      // Parallel: all lines appear simultaneously, chars revealed in thread chunks
      const THREADS = 4;
      const CHAR_DELAY = 60;
      lines.forEach((line, i) => {
        const text = line.textContent ?? '';
        line.textContent = '';
        gsap.set(line, { opacity: 1 });
        const charSpans: HTMLElement[] = [];
        for (const ch of text) {
          const span = document.createElement('span');
          span.textContent = ch;
          span.style.opacity = '0';
          span.style.transition = 'opacity 0.06s';
          line.appendChild(span);
          charSpans.push(span);
        }
        const chunkSize = Math.ceil(charSpans.length / THREADS);
        for (let thread = 0; thread < THREADS; thread++) {
          const start = chunkSize * thread;
          const end = Math.min(start + chunkSize, charSpans.length);
          for (let j = start; j < end; j++) {
            const delay = (j - start) * CHAR_DELAY + i * 40;
            const t = setTimeout(() => { charSpans[j].style.opacity = '1'; }, delay);
            bitScanTimeouts.push(t);
          }
        }
      });
    } else if (theme === 'terminal') {
      // Fast sequential typewriter
      let delay = 60;
      lines.forEach((line) => {
        const text = line.textContent ?? '';
        line.textContent = '';
        const t = setTimeout(() => {
          gsap.set(line, { opacity: 1 });
          const handle = typewrite(line, text, 8);
          activeTypewriters.push(handle);
        }, delay);
        bitScanTimeouts.push(t);
        delay += text.length * 8 + 20;
      });
    } else if (theme === 'plain') {
      // Plain theme: show expand lines instantly, no animation
      gsap.set(lines, { opacity: 1 });
    } else {
      // Register / Training: fade in with stagger
      gsap.fromTo(lines, { opacity: 0 }, { opacity: 1, stagger: 0.08, duration: 0.3, ease: 'power2.out', delay: 0.1 });
    }

    // Recalc accordion height
    recalcAccordionHeight();
  });
}

function collapseExpandedCard(animate: boolean): void {
  if (!expandedCard) return;
  const { cardEl, expandEl } = expandedCard;

  cardEl.classList.remove('expanded');

  if (animate) {
    gsap.to(expandEl, { height: 0, duration: 0.3, ease: 'power2.in' });
  } else {
    gsap.set(expandEl, { height: 0 });
  }

  // Reset expand lines
  const lines = expandEl.querySelectorAll<HTMLElement>('.skill-expand-line');
  lines.forEach(line => {
    gsap.set(line, { opacity: 0 });
  });

  expandedCard = null;

  if (animate) recalcAccordionHeight();
}

function recalcAccordionHeight(): void {
  skillsManager?.remeasure();
}

// ---------------------------------------------------------------------------
// Cleanup utilities
// ---------------------------------------------------------------------------

function cancelAllTypewriters(): void {
  for (const tw of activeTypewriters) tw.cancel();
  activeTypewriters = [];
  clearBitScanTimeouts();
  if (trainingAnimFrame) {
    cancelAnimationFrame(trainingAnimFrame);
    trainingAnimFrame = null;
  }
}

function clearBitScanTimeouts(): void {
  for (const t of bitScanTimeouts) clearTimeout(t);
  bitScanTimeouts = [];
}

// ---------------------------------------------------------------------------
// Reveal / hide
// ---------------------------------------------------------------------------

interface OverlayState {
  el: HTMLElement;
  inner: HTMLElement;
  revealed: boolean;
  timeline: gsap.core.Timeline | null;
}

let overlayState: OverlayState | null = null;

function revealOverlay(): void {
  const state = overlayState;
  if (!state || state.revealed) return;
  state.revealed = true;
  state.timeline?.kill();

  state.el.style.opacity = '1';
  state.el.style.pointerEvents = 'auto';

  const animTargets = state.el.querySelectorAll<HTMLElement>(
    '.skills-overlay-title, .skills-accordion-header'
  );
  const tl = gsap.timeline();
  tl.fromTo(animTargets,
    { opacity: 0, y: SLIDE_PX },
    { opacity: 1, y: 0, duration: REVEAL_DURATION, stagger: STAGGER, ease: 'power2.out' },
  );
  state.timeline = tl;
}

function hideOverlay(): void {
  const state = overlayState;
  if (!state || !state.revealed) return;
  state.revealed = false;
  state.timeline?.kill();

  skillsManager?.resetAccordion();

  const animTargets = state.el.querySelectorAll<HTMLElement>(
    '.skills-overlay-title, .skills-accordion-header'
  );
  const tl = gsap.timeline({
    onComplete: () => {
      state.el.style.opacity = '0';
      state.el.style.pointerEvents = 'none';
      state.inner.scrollTop = 0;
    },
  });
  tl.to(animTargets, { opacity: 0, y: SLIDE_PX, duration: HIDE_DURATION, stagger: STAGGER * 0.5, ease: 'power2.in' });
  state.timeline = tl;
}

// ---------------------------------------------------------------------------
// Scroll handler
// ---------------------------------------------------------------------------

function makeContinuousScrollHandler(inner: HTMLElement) {
  return (deltaY: number): 'consumed' | 'at-start' | 'at-end' => {
    const maxScroll = inner.scrollHeight - inner.clientHeight;
    if (maxScroll <= 0) return deltaY < 0 ? 'at-start' : 'at-end';
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

export function initSkillsOverlay(): void {
  const el = document.getElementById('skills-overlay');
  if (!el) return;

  const container = el.querySelector<HTMLElement>('.skills-accordion')!;
  buildSkillsDOM(container);
  const inner = el.querySelector('.skills-overlay-inner') as HTMLElement;
  inner.style.height = '100%';
  inner.style.overflowY = 'hidden';

  initAccordion(el, inner);

  gsap.set(el.querySelectorAll('.skills-accordion-header, .skills-overlay-title'), { opacity: 0, y: SLIDE_PX });

  overlayState = { el, inner, revealed: false, timeline: null };

  const idx = getSectionIndex('skills');
  if (idx >= 0) {
    registerSectionScrollHandler(idx, makeContinuousScrollHandler(inner));
  }
}

export function setSkillsOverlayVisible(visible: boolean): void {
  if (visible) revealOverlay();
  else hideOverlay();
}
