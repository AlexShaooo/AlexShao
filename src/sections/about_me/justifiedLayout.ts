/**
 * Binary Space Partition layout for photo collages.
 *
 * Recursively splits a rectangle with alternating H/V cuts driven by
 * actual image aspect ratios. Produces tight packing with no cropping
 * and organic, non-grid boundaries.
 *
 * Tree selection is a dynamic program over contiguous ranges of the
 * aspect-sorted image list. Each range keeps a few candidate subtrees
 * spanning a spread of combined aspect ratios, so the root can trade
 * collage shape against tile-size evenness. Committing to one subtree per
 * range greedily cannot do that: the subtree is fixed before the root knows
 * which aspect it needs, and unbalanced splits chain into sliver tiles.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface LayoutItem {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutResult {
  items: LayoutItem[];
  totalHeight: number;
}

// ---------------------------------------------------------------------------
// Internal BSP tree
// ---------------------------------------------------------------------------

/**
 * `minRel` / `maxRel` are the smallest and largest leaf areas inside this
 * node, as a fraction of the node's own area. They are scale-free, so a
 * subtree's tile evenness can be scored before its box size is known.
 */
interface BSPCommon {
  aspect: number;
  minRel: number;
  maxRel: number;
}

type BSPLeaf = BSPCommon & { kind: 'leaf'; index: number };
type BSPBranch = BSPCommon & {
  kind: 'branch';
  split: 'v' | 'h';
  left: BSPNode;
  right: BSPNode;
};
type BSPNode = BSPLeaf | BSPBranch;

interface ImageEntry {
  index: number;
  aspect: number;
}

/** Target combined aspect ratio — biases toward a pleasant landscape shape. */
const TARGET_ASPECT = 1.4;

/** Weight on root aspect error, traded against log tile-area spread. */
const ASPECT_WEIGHT = 2;

/** Candidates are binned by log(aspect) at this width before pruning. */
const ASPECT_BUCKET = 0.06;

/**
 * Candidate subtrees kept per range. 12 reproduces an uncapped search on
 * every current folder, and keeps a 30-photo collage under ~70 ms.
 */
const MAX_CANDIDATES = 12;

// ---------------------------------------------------------------------------
// Combined aspect ratio helpers
// ---------------------------------------------------------------------------

/** Side-by-side (same height): aspects add. */
function vCombine(aL: number, aR: number): number {
  return aL + aR;
}

/** Stacked (same width): harmonic combination. */
function hCombine(aT: number, aB: number): number {
  return 1 / (1 / aT + 1 / aB);
}

/**
 * Fraction of the parent box taken by the first child.
 *
 * For a vertical split that is the left child's share of the width; for a
 * horizontal split, the top child's share of the height. Either way the other
 * dimension is shared, so it is also the child's share of the parent's area.
 * `layoutBSP` uses the same two functions, which is what keeps each leaf box
 * at its own image's aspect ratio (no cropping).
 */
function vFraction(aL: number, aR: number): number {
  return aL / (aL + aR);
}

function hFraction(aT: number, aB: number): number {
  return 1 / aT / (1 / aT + 1 / aB);
}

// ---------------------------------------------------------------------------
// Tree building
// ---------------------------------------------------------------------------

/** Ratio of largest to smallest leaf area inside this node. 1 is perfectly even. */
function spread(node: BSPNode): number {
  return node.maxRel / node.minRel;
}

function makeBranch(split: 'v' | 'h', left: BSPNode, right: BSPNode): BSPBranch {
  const aspect =
    split === 'v'
      ? vCombine(left.aspect, right.aspect)
      : hCombine(left.aspect, right.aspect);
  const f =
    split === 'v'
      ? vFraction(left.aspect, right.aspect)
      : hFraction(left.aspect, right.aspect);

  return {
    kind: 'branch',
    split,
    left,
    right,
    aspect,
    minRel: Math.min(f * left.minRel, (1 - f) * right.minRel),
    maxRel: Math.max(f * left.maxRel, (1 - f) * right.maxRel),
  };
}

/**
 * Candidate subtrees covering images `[lo, hi)` of the aspect-sorted list.
 *
 * Returns several trees rather than one, binned by combined aspect ratio and
 * keeping the evenest tree per bin. The caller picks from the bins, so a
 * subtree is never locked in before the shape it has to fit is known.
 * Memoised on the range, which is also what keeps this polynomial.
 */
function solveRange(
  sorted: ImageEntry[],
  lo: number,
  hi: number,
  memo: Map<number, BSPNode[]>,
): BSPNode[] {
  const key = lo * (sorted.length + 1) + hi;
  const cached = memo.get(key);
  if (cached) return cached;

  if (hi - lo === 1) {
    const { index, aspect } = sorted[lo];
    const only: BSPNode[] = [{ kind: 'leaf', index, aspect, minRel: 1, maxRel: 1 }];
    memo.set(key, only);
    return only;
  }

  const byBucket = new Map<number, BSPNode>();

  for (let i = lo + 1; i < hi; i++) {
    for (const left of solveRange(sorted, lo, i, memo)) {
      for (const right of solveRange(sorted, i, hi, memo)) {
        for (const split of ['v', 'h'] as const) {
          const node = makeBranch(split, left, right);
          const bucket = Math.round(Math.log(node.aspect) / ASPECT_BUCKET);
          const held = byBucket.get(bucket);
          if (!held || spread(node) < spread(held)) byBucket.set(bucket, node);
        }
      }
    }
  }

  const candidates = [...byBucket.values()]
    .sort((a, b) => spread(a) - spread(b))
    .slice(0, MAX_CANDIDATES);

  memo.set(key, candidates);
  return candidates;
}

/**
 * Pick the root: even tile areas, with the collage as a whole kept near
 * TARGET_ASPECT. Both terms are logarithmic, so neither is sensitive to scale
 * and a 2x-too-tall collage costs the same as a 2x-too-wide one.
 */
function buildBSP(images: ImageEntry[]): BSPNode {
  const sorted = [...images].sort((a, b) => a.aspect - b.aspect);
  const memo = new Map<number, BSPNode[]>();

  let bestNode: BSPNode | null = null;
  let bestCost = Infinity;

  for (const node of solveRange(sorted, 0, sorted.length, memo)) {
    const cost =
      Math.log(spread(node)) +
      ASPECT_WEIGHT * Math.abs(Math.log(node.aspect / TARGET_ASPECT));
    if (cost < bestCost) {
      bestCost = cost;
      bestNode = node;
    }
  }

  return bestNode!;
}

// ---------------------------------------------------------------------------
// Layout (top-down coordinate assignment)
// ---------------------------------------------------------------------------

function layoutBSP(
  node: BSPNode,
  x: number,
  y: number,
  w: number,
  h: number,
  gap: number,
  items: LayoutItem[],
): void {
  if (node.kind === 'leaf') {
    items.push({ index: node.index, x, y, width: w, height: h });
    return;
  }

  const { split, left, right } = node;

  if (split === 'v') {
    // Vertical split: left and right side by side
    const ratio = vFraction(left.aspect, right.aspect);
    const leftW = (w - gap) * ratio;
    const rightW = w - gap - leftW;

    layoutBSP(left, x, y, leftW, h, gap, items);
    layoutBSP(right, x + leftW + gap, y, rightW, h, gap, items);
  } else {
    // Horizontal split: top and bottom stacked
    const ratio = hFraction(left.aspect, right.aspect);
    const topH = (h - gap) * ratio;
    const bottomH = h - gap - topH;

    layoutBSP(left, x, y, w, topH, gap, items);
    layoutBSP(right, x, y + topH + gap, w, bottomH, gap, items);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute a BSP collage layout.
 *
 * @param aspectRatios - width/height ratio for each image
 * @param containerWidth - available width in pixels
 * @param gap - gap between images in pixels (default 10)
 */
export function computeBSPLayout(
  aspectRatios: number[],
  containerWidth: number,
  gap = 10,
): LayoutResult {
  if (aspectRatios.length === 0) return { items: [], totalHeight: 0 };

  const images: ImageEntry[] = aspectRatios.map((aspect, index) => ({
    index,
    aspect,
  }));

  const root = buildBSP(images);
  const totalHeight = containerWidth / root.aspect;

  const items: LayoutItem[] = [];
  layoutBSP(root, 0, 0, containerWidth, totalHeight, gap, items);

  return { items, totalHeight };
}
