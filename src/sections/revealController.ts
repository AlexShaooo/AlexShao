/**
 * Controls staggered reveal/hide animations for section content meshes.
 * Meshes are tagged with userData.revealGroup (0 = title/subtitle, 1 = rest).
 * Reveal: fade+slide-up, group 0 first then group 1.
 * Hide: fade only, group 1 first then group 0 (reverse stagger).
 */
import * as THREE from 'three';

// --- Tunable parameters ---
export const STAGGER_DELAY_MS = 100;
export const REVEAL_DURATION_MS = 400;
export const HIDE_DURATION_MS = 250;
export const SLIDE_DISTANCE = 0.8; // world units

type Phase = 'hidden' | 'revealing' | 'visible' | 'hiding';

interface MeshState {
  mesh: THREE.Mesh;
  revealGroup: number;   // 0 or 1
  baseY: number;         // original Y from buildContent
  currentOpacity: number;
  currentYOffset: number;
}

interface SectionRevealState {
  phase: Phase;
  phaseStartTime: number;
  meshes: MeshState[];
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) * (1 - t) * (1 - t);
}

export class RevealController {
  private sections: Map<number, SectionRevealState> = new Map();

  /** Scan group children for revealGroup tags, initialize all hidden. */
  registerSection(index: number, group: THREE.Group): void {
    const meshes: MeshState[] = [];
    group.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || mesh === (group as unknown as THREE.Mesh)) return;
      if (mesh.userData.revealGroup === undefined) return;
      const mat = mesh.material as THREE.Material;
      if ('opacity' in mat) mat.opacity = 0;
      meshes.push({
        mesh,
        revealGroup: mesh.userData.revealGroup as number,
        baseY: mesh.position.y,
        currentOpacity: 0,
        currentYOffset: SLIDE_DISTANCE,
      });
      mesh.position.y += SLIDE_DISTANCE;
    });
    this.sections.set(index, {
      phase: 'hidden',
      phaseStartTime: 0,
      meshes,
    });
  }

  /** Re-scan after theme rebuild. Preserves current phase and applies animation state to new meshes. */
  reregisterSection(index: number, group: THREE.Group): void {
    const prev = this.sections.get(index);
    const meshes: MeshState[] = [];
    group.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || mesh === (group as unknown as THREE.Mesh)) return;
      if (mesh.userData.revealGroup === undefined) return;
      // Determine what opacity/offset this mesh should have based on current phase
      let opacity = 0;
      let yOffset = SLIDE_DISTANCE;
      if (prev && (prev.phase === 'visible')) {
        opacity = 1;
        yOffset = 0;
      } else if (prev && prev.phase === 'revealing') {
        // Find matching previous mesh state by revealGroup for approximate state
        const prevMesh = prev.meshes.find(m => m.revealGroup === mesh.userData.revealGroup);
        if (prevMesh) {
          opacity = prevMesh.currentOpacity;
          yOffset = prevMesh.currentYOffset;
        }
      }
      const mat = mesh.material as THREE.Material;
      if ('opacity' in mat) mat.opacity = opacity;
      // Recover baseY: if this mesh was previously registered, use its stored baseY
      // to avoid stacking offsets on reused singleton meshes.
      const prevMeshState = prev?.meshes.find(m => m.mesh === mesh);
      const baseY = prevMeshState ? prevMeshState.baseY : mesh.position.y;
      mesh.position.y = baseY + yOffset;
      meshes.push({
        mesh,
        revealGroup: mesh.userData.revealGroup as number,
        baseY,
        currentOpacity: opacity,
        currentYOffset: yOffset,
      });
    });
    this.sections.set(index, {
      phase: prev?.phase ?? 'hidden',
      phaseStartTime: prev?.phaseStartTime ?? 0,
      meshes,
    });
  }

  triggerReveal(index: number, now: number): void {
    const state = this.sections.get(index);
    if (!state || state.phase === 'visible' || state.phase === 'revealing') return;
    state.phase = 'revealing';
    state.phaseStartTime = now;
  }

  triggerHide(index: number, now: number): void {
    const state = this.sections.get(index);
    if (!state || state.phase === 'hidden' || state.phase === 'hiding') return;
    state.phase = 'hiding';
    state.phaseStartTime = now;
  }

  /** Per-frame update. Computes and applies opacity + Y offset for all meshes in a section. */
  update(index: number, now: number): void {
    const state = this.sections.get(index);
    if (!state) return;

    if (state.phase === 'hidden' || state.phase === 'visible') return;

    const elapsed = now - state.phaseStartTime;
    let allDone = true;

    for (const ms of state.meshes) {
      if (state.phase === 'revealing') {
        const groupDelay = ms.revealGroup * STAGGER_DELAY_MS;
        const meshElapsed = Math.max(0, elapsed - groupDelay);
        const t = Math.min(1, meshElapsed / REVEAL_DURATION_MS);
        const eased = easeOutCubic(t);
        ms.currentOpacity = eased;
        ms.currentYOffset = SLIDE_DISTANCE * (1 - eased);
        if (t < 1) allDone = false;
      } else if (state.phase === 'hiding') {
        // Reverse stagger: group 1 hides first (delay 0), group 0 hides second
        const groupDelay = (1 - ms.revealGroup) * STAGGER_DELAY_MS;
        const meshElapsed = Math.max(0, elapsed - groupDelay);
        const t = Math.min(1, meshElapsed / HIDE_DURATION_MS);
        const eased = easeOutCubic(t);
        ms.currentOpacity = 1 - eased;
        ms.currentYOffset = 0; // no slide on hide
        if (t < 1) allDone = false;
      }

      // Apply to mesh
      const mat = ms.mesh.material as THREE.Material;
      if ('opacity' in mat) (mat as any).opacity = ms.currentOpacity;
      ms.mesh.position.y = ms.baseY + ms.currentYOffset;
    }

    if (allDone) {
      state.phase = state.phase === 'revealing' ? 'visible' : 'hidden';
    }
  }

  isFullyHidden(index: number): boolean {
    const state = this.sections.get(index);
    if (!state) return true;
    return state.phase === 'hidden';
  }

  isVisible(index: number): boolean {
    const state = this.sections.get(index);
    if (!state) return false;
    return state.phase === 'visible';
  }
}
