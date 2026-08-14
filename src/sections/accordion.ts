/**
 * Shared accordion open/close/toggle/reset logic.
 * Each overlay extends BaseAccordionSection and provides callbacks
 * for overlay-specific behaviour (card reveals, typewriters, etc.).
 */
import gsap from 'gsap';

// ---------------------------------------------------------------------------
// Base interface — every accordion section must have at least these fields
// ---------------------------------------------------------------------------

export interface BaseAccordionSection {
  sectionEl: HTMLElement;
  headerEl: HTMLElement;
  contentEl: HTMLElement;
  chevronEl: HTMLElement;
  open: boolean;
}

// ---------------------------------------------------------------------------
// Callbacks for overlay-specific hooks
// ---------------------------------------------------------------------------

export interface AccordionCallbacks<S extends BaseAccordionSection> {
  /** Runs before the height animation — use for lazy-loading content. */
  onBeforeOpen?: (section: S) => Promise<void> | void;
  /** Runs after the height animation starts — use for card reveal animations. */
  onAfterOpen?: (section: S) => void;
  /** Runs during an animated close — use for card hide + cleanup. */
  onClose?: (section: S) => void;
  /** Runs during an instant reset (overlay hidden) — use for hard-reset of cards/state. */
  onReset?: (section: S) => void;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createAccordionManager<S extends BaseAccordionSection>(
  inner: HTMLElement,
  callbacks: AccordionCallbacks<S> = {},
) {
  let activeSection: S | null = null;

  async function openSection(section: S, fast = false): Promise<void> {
    section.open = true;
    section.sectionEl.classList.add('open');

    const dur = fast ? 0.4 : 0.4;

    gsap.killTweensOf(section.contentEl);
    gsap.to(section.chevronEl, { rotation: 90, duration: fast ? 0.2 : 0.4, ease: 'power2.out' });

    // Overlay-specific pre-open (e.g. lazy-populate images)
    await callbacks.onBeforeOpen?.(section);

    // Animate height from 0 to auto
    gsap.set(section.contentEl, { height: 'auto' });
    const autoHeight = section.contentEl.scrollHeight;
    gsap.fromTo(section.contentEl,
      { height: 0 },
      { height: autoHeight, duration: dur, ease: 'power2.out' },
    );

    // Overlay-specific post-open (e.g. card reveal / typewriter)
    callbacks.onAfterOpen?.(section);

    // Scroll the overlay so the opened section header is visible
    const headerTop = section.headerEl.offsetTop - inner.offsetTop;
    gsap.to(inner, {
      scrollTop: headerTop,
      duration: dur,
      ease: 'power2.out',
      delay: fast ? 0 : 0.15,
    });
  }

  function closeSection(section: S, fast = false): Promise<void> {
    section.open = false;
    section.sectionEl.classList.remove('open');

    // Overlay-specific animated close (e.g. hide cards, cancel typewriters)
    callbacks.onClose?.(section);

    const dur = fast ? 0.3 : 0.4;

    gsap.killTweensOf(section.contentEl);
    gsap.to(section.chevronEl, { rotation: 0, duration: fast ? 0.15 : 0.3, ease: 'power2.in' });

    return new Promise((resolve) => {
      gsap.to(section.contentEl, {
        height: 0, duration: dur, ease: 'power2.in', onComplete: resolve,
      });
    });
  }

  async function toggleSection(section: S): Promise<void> {
    if (section === activeSection) {
      closeSection(section);
      activeSection = null;
      return;
    }
    const isSwap = !!activeSection;
    if (activeSection) {
      await closeSection(activeSection, true);
    }
    activeSection = section;
    await openSection(section, isSwap);
  }

  function resetAccordion(): void {
    if (!activeSection) return;

    // Overlay-specific instant reset
    callbacks.onReset?.(activeSection);

    gsap.set(activeSection.contentEl, { height: 0 });
    gsap.set(activeSection.chevronEl, { rotation: 0 });
    activeSection.sectionEl.classList.remove('open');
    activeSection.open = false;
    activeSection = null;
  }

  /** Re-measure open section height — call on window resize. */
  function remeasure(): void {
    if (activeSection?.open) {
      gsap.set(activeSection.contentEl, { height: 'auto' });
    }
  }

  return { openSection, closeSection, toggleSection, resetAccordion, remeasure, getActive: () => activeSection };
}
