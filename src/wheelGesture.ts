/**
 * Wheel gesture gate for leaving overlay sections (projects, skills, about).
 *
 * WheelEvent has no momentum or phase flag, so gestures are inferred from event
 * timing and size. Measured 2026-11-13 (Chrome 155, macOS, logs via ?scrolldebug):
 *  - Mouse: events 15-41 ms apart inside one flick, |deltaY| ramping 4 -> 278 px,
 *    no momentum tail; separate flicks were >= 486 ms apart.
 *  - Trackpad: events ~8.3 ms apart; a fling ends in a ~500 ms tail decaying to
 *    ~4 px; a new swipe during the tail arrives after a 43-62 ms gap.
 *
 * Rule: a new gesture starts after a gap > GESTURE_GAP_MS, or after a gap >
 * TAIL_SPLIT_GAP_MS when the previous event was below TAIL_FRACTION of the
 * gesture's peak (a decaying tail cut by a new swipe). Only a gesture whose first
 * event was already at a boundary may leave the section, after BOUNDARY_EXIT_PX
 * of its own input. The rest of a flick that scrolls the content to its end stops
 * there; the next separate flick moves on.
 *
 * Units: t is event.timeStamp in ms; deltaY in CSS px (deltaMode 0), > 0 = down.
 */

export type BoundaryResult = 'consumed' | 'at-start' | 'at-end';

export const GESTURE_GAP_MS = 150;
export const TAIL_SPLIT_GAP_MS = 30;
export const TAIL_FRACTION = 0.5;
export const BOUNDARY_EXIT_PX = 300;

export class WheelBoundaryGate {
  private lastT = -Infinity;
  private peak = 0;
  private prevAbs = 0;
  private start: BoundaryResult | null = null;
  private px = 0;
  private lastWasNew = false;

  /**
   * Feed one wheel event. result is the section's scroll verdict, or null when the
   * event cannot exit (transition running, or a section without overlay content).
   * Returns 1 to go to the next section, -1 to the previous, 0 to stay.
   */
  step(t: number, deltaY: number, result: BoundaryResult | null): -1 | 0 | 1 {
    const gap = t - this.lastT;
    const abs = Math.abs(deltaY);
    this.lastWasNew = gap > GESTURE_GAP_MS
      || (gap > TAIL_SPLIT_GAP_MS && this.prevAbs < TAIL_FRACTION * this.peak);
    this.lastT = t;
    this.prevAbs = abs;
    if (this.lastWasNew) {
      this.peak = abs;
      this.start = result;
      this.px = 0;
    } else {
      this.peak = Math.max(this.peak, abs);
    }

    if (result === 'consumed') {
      this.start = null; // content moved: this is no longer a boundary gesture
      return 0;
    }
    if (result === null || result !== this.start) return 0;
    this.px += abs;
    if (this.px < BOUNDARY_EXIT_PX) return 0;
    this.start = null; // one exit per gesture
    return result === 'at-end' ? 1 : -1;
  }

  /** Call on any section change: the rest of the current gesture cannot exit again. */
  endGesture(): void {
    this.start = null;
    this.px = 0;
  }

  get newGesture(): boolean { return this.lastWasNew; }
  get gestureStart(): BoundaryResult | null { return this.start; }
  get gesturePx(): number { return this.px; }
}
