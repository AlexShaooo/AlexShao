/**
 * Manages section lifecycle: activation, opacity transitions, neuron burst triggers.
 * Sections are evenly spaced along the cylinder based on its length.
 */
import * as THREE from 'three';
import type { Network } from '../network';
import type { SectionDef } from './sectionConfig';
import { createCellBody, type CellBodyHandle } from './cellBody';
import { createSynapseWires, type SynapseWireHandle } from './synapseWires';
import { createGlassSphere, type GlassSphereHandle } from '../renderer/glassSphere';
import { createGlassRectangle, type GlassRectangleHandle } from '../renderer/glassRectangle';
import { getBrightness } from '../theme';
import { RevealController } from './revealController';
import { isScrollAnimating, isMultiSectionScrolling, getCurrentSectionIndex, getJumpOrigin, getJumpTarget } from '../scroll';

interface SectionState {
  def: SectionDef;
  group: THREE.Group;
  synapseWires: SynapseWireHandle[];
  cellBodies: CellBodyHandle[];
  glassSpheres: GlassSphereHandle[];
  glassRectangles: GlassRectangleHandle[];
  contentCenter: number;     // Z center of this section's content
  viewZ: number;             // ideal camera Z to view this section
  activateAt: number;        // camera Z that triggers activation
  fadeOutAt: number;         // camera Z where section starts fading
  triggerZ: number;          // Z center of the neuron burst slice
  opacity: number;
  triggered: boolean;        // has the neuron burst fired for this entry?
  active: boolean;           // is the camera currently in range?
}

const FADE_LERP_RATE = 40.0;  // fast snap for opacity transitions
const TRIGGER_BURST_COUNT = 200;
const TRIGGER_HALF_WIDTH = 3; // Z half-width of burst slice
const BG_PULSE_RANGE = 15;   // Z half-range to sample nearby neuron activations
// Camera looks ahead, so best viewing distance is offset before the section
const VIEW_OFFSET = 16;


export class SectionManager {
  private sections: SectionState[] = [];
  private revealController = new RevealController();
  private wasAnimating = false;
  private settledSection = 0; // index of section currently revealed

  constructor(
    sectionDefs: SectionDef[],
    private network: Network,
    private scene: THREE.Scene,
  ) {
    const cylinderLength = network.config.cylinderLength;
    const n = sectionDefs.length;
    // Keep sections within the middle portion of the cylinder so edge sections have neurons nearby
    const margin = 75;
    const usableLength = cylinderLength - margin;
    const slotSize = usableLength / n;

    for (let i = 0; i < n; i++) {
      // First section at Z=35 (comfortable viewing distance from camera start at Z=0)
      const contentCenter = i === 0 ? 35 : slotSize * i + slotSize * 0.5;
      const group = new THREE.Group();
      group.position.z = contentCenter;
      // Face the camera (which looks along +Z)
      group.rotation.y = Math.PI;

      // Build content first so we can measure it
      sectionDefs[i].buildContent(group);

      scene.add(group);

      // Register with reveal controller (sets all content meshes to opacity 0)
      this.revealController.registerSection(i, group);

      // Cell bodies: use config array, default to single default soma, [] for none
      const cellConfigs = sectionDefs[i].cellBodies ?? [{}];
      const cellBodies: CellBodyHandle[] = [];
      const synapseWires: SynapseWireHandle[] = [];

      for (const cfg of cellConfigs) {
        const cb = createCellBody(contentCenter, cfg);
        scene.add(cb.mesh);
        cellBodies.push(cb);

        const center = cb.mesh.position.clone();
        const wires = createSynapseWires(center, cb.radius, network, scene, {
          count: cfg.wireCount,
          opacity: cfg.wireOpacity,
          rimPower: cfg.wireRimPower,
          taperPower: cfg.wireTaperPower,
        });
        synapseWires.push(wires);
      }

      // Glass spheres: transmissive PBR glass overlays
      const glassConfigs = sectionDefs[i].glassSpheres ?? [];
      const glassSpheres: GlassSphereHandle[] = [];
      for (const gCfg of glassConfigs) {
        const gs = createGlassSphere(gCfg);
        const baseZ = contentCenter + (gCfg.radius ?? 16);
        gs.mesh.position.set(
          gCfg.x ?? 0,
          gCfg.y ?? 0,
          baseZ + (gCfg.zOffset ?? 0),
        );
        scene.add(gs.mesh);
        glassSpheres.push(gs);
      }

      // Glass rectangles: transmissive PBR glass panels
      const rectConfigs = sectionDefs[i].glassRectangles ?? [];
      const glassRectangles: GlassRectangleHandle[] = [];
      for (const rCfg of rectConfigs) {
        const gr = createGlassRectangle(rCfg);
        const baseZ = contentCenter + ((rCfg.height ?? 20) / 2);
        gr.mesh.position.set(
          rCfg.x ?? 0,
          rCfg.y ?? 0,
          baseZ + (rCfg.zOffset ?? 0),
        );
        scene.add(gr.mesh);
        glassRectangles.push(gr);
      }

      // Ideal camera Z to view this section (offset back from content)
      const viewZ = contentCenter - VIEW_OFFSET;
      this.sections.push({
        def: sectionDefs[i],
        group,
        synapseWires,
        cellBodies,
        glassSpheres,
        glassRectangles,
        contentCenter,
        viewZ,
        activateAt: viewZ - slotSize * 0.4,
        fadeOutAt: viewZ + slotSize * 0.3,
        triggerZ: viewZ - slotSize * 0.15,
        opacity: 1,
        triggered: i === 0,
        active: true,
      });
    }

    // Trigger reveal for whichever section the camera is on at load time
    requestAnimationFrame(() => {
      const idx = getCurrentSectionIndex();
      this.settledSection = idx;
      this.revealController.triggerReveal(idx, performance.now());
    });

    // Listen for theme changes
    window.addEventListener('theme-change', () => this.onThemeChange());

    // Apply initial brightness-dependent values (needed for reload in light mode)
    this.onThemeChange();
  }

  /** Rebuild canvas texture content and update shader uniforms for theme switch. */
  private onThemeChange(): void {
    for (let i = 0; i < this.sections.length; i++) {
      const sec = this.sections[i];
      // Remove old content children from group (preserve group transform)
      const toRemove: THREE.Object3D[] = [];
      sec.group.traverse((child) => {
        if (child !== sec.group) toRemove.push(child);
      });
      for (const child of toRemove) {
        if (child.parent === sec.group) sec.group.remove(child);
      }

      // Rebuild content with new theme colors
      sec.def.buildContent(sec.group);

      // Re-register with reveal controller (preserves current animation phase)
      this.revealController.reregisterSection(i, sec.group);

      // Update cell body shader uniforms
      for (const cb of sec.cellBodies) {
        cb.updateTheme();
      }

      // Interpolate glass reflectivity (0 in dark, 0.5 in light)
      const t = getBrightness();
      for (const gs of sec.glassSpheres) {
        gs.material.reflectivity = t * 0.5;
      }
      for (const gr of sec.glassRectangles) {
        gr.material.reflectivity = t * 0.5;
      }
    }
  }

  /** Returns section IDs and viewing Z positions (where camera should be to see section). */
  getSectionCenters(): { id: string; z: number }[] {
    return this.sections.map((s) => ({ id: s.def.navId ?? s.def.id, z: s.viewZ }));
  }

  /** Test ray against cell body spheres and set hover state. */
  updateHover(raycaster: THREE.Raycaster | null, dt: number): void {
    for (const sec of this.sections) {
      if (sec.opacity < 0.1 || !raycaster) {
        for (let i = 0; i < sec.cellBodies.length; i++) {
          sec.cellBodies[i].setHovered(false, dt);
          sec.synapseWires[i]?.setHovered(false, dt);
        }
        continue;
      }

      const rayOrigin = raycaster.ray.origin;
      const rayDir = raycaster.ray.direction;

      for (let i = 0; i < sec.cellBodies.length; i++) {
        const cb = sec.cellBodies[i];
        const cx = cb.mesh.position.x;
        const cy = cb.mesh.position.y;
        const cz = cb.mesh.position.z;

        // Ray-sphere intersection
        const ox = cx - rayOrigin.x;
        const oy = cy - rayOrigin.y;
        const oz = cz - rayOrigin.z;
        const dot = ox * rayDir.x + oy * rayDir.y + oz * rayDir.z;
        const d2 = ox * ox + oy * oy + oz * oz - dot * dot;
        const r2 = cb.radius * cb.radius;
        const hit = dot > 0 && d2 < r2;

        cb.setHovered(hit, dt);
        const wires = sec.synapseWires[i];
        if (wires) {
          wires.setHovered(hit, dt);
          // Fire connected neurons so they cascade downstream
          if (hit) {
            for (const ni of wires.neuronIndices) {
              this.network.fireNeuronByIndex(ni);
            }
          }
        }
      }
    }
  }

  update(cameraZ: number, dt: number): void {
    const now = performance.now();
    const pos = this.network.positions;
    const activations = this.network.activations;
    const neuronCount = this.network.neuronCount;

    // Detect scroll animation start/end transitions
    const animating = isScrollAnimating();
    if (animating && !this.wasAnimating) {
      // Scroll just started — hide the currently settled section
      this.revealController.triggerHide(this.settledSection, now);
    } else if (!animating && this.wasAnimating) {
      // Scroll just ended — reveal the section we landed on
      this.settledSection = getCurrentSectionIndex();
      this.revealController.triggerReveal(this.settledSection, now);
    }
    this.wasAnimating = animating;

    for (let i = 0; i < this.sections.length; i++) {
      const sec = this.sections[i];
      const inRange = cameraZ >= sec.activateAt && cameraZ <= sec.fadeOutAt;

      if (inRange) {
        // Fire neuron burst on first entry
        if (!sec.triggered) {
          sec.triggered = true;
          this.network.fireZoneNeurons(
            sec.triggerZ - TRIGGER_HALF_WIDTH,
            sec.triggerZ + TRIGGER_HALF_WIDTH,
            TRIGGER_BURST_COUNT,
          );
        }
        sec.active = true;
      } else {
        // Reset trigger once faded
        if (sec.active && sec.opacity <= 0.02) {
          sec.active = false;
          sec.triggered = false;
        }
      }

      // Distance-based opacity for non-content elements (cell bodies, wires, glass)
      const halfRange = (sec.fadeOutAt - sec.activateAt) / 2;
      const distFromMid = Math.abs(cameraZ - sec.viewZ);
      let targetOpacity: number;
      if (isMultiSectionScrolling() && i !== getJumpOrigin() && i !== getJumpTarget()) {
        // Hide intermediate sections during multi-section fly-through (keep origin and destination visible)
        sec.opacity = 0;
      } else if (inRange) {
        targetOpacity = Math.min(1, Math.max(0, 1 - distFromMid / halfRange));
        sec.opacity += (targetOpacity - sec.opacity) * Math.min(1, FADE_LERP_RATE * dt);
      } else {
        // Snap to invisible immediately when out of range
        sec.opacity = 0;
      }

      // Content mesh visibility driven by reveal controller (not distance-based opacity)
      this.revealController.update(i, now);
      sec.group.visible = !this.revealController.isFullyHidden(i);

      // Sample nearby neuron activations for synapse wire glow
      const zMin = sec.contentCenter - BG_PULSE_RANGE;
      const zMax = sec.contentCenter + BG_PULSE_RANGE;
      let totalActivation = 0;
      let count = 0;
      for (let j = 0; j < neuronCount; j++) {
        const nz = pos[j * 3 + 2];
        if (nz >= zMin && nz <= zMax) {
          totalActivation += activations[j];
          count++;
        }
      }
      const avgActivation = count > 0 ? totalActivation / count : 0;

      // Update all synapse wires
      for (const wires of sec.synapseWires) {
        wires.update(dt, avgActivation);
        wires.setOpacity(sec.opacity);
      }

      // Update all cell bodies
      for (const cb of sec.cellBodies) {
        cb.update(sec.opacity);
      }

      // Update all glass spheres (fade to 0 as camera reaches section plane)
      for (const gs of sec.glassSpheres) {
        const distToSection = Math.abs(cameraZ - sec.contentCenter);
        const fadeStart = VIEW_OFFSET;
        const proximityFade = Math.min(1, distToSection / fadeStart);
        gs.update(sec.opacity * proximityFade);
      }

      // Update all glass rectangles (fade to 0 as camera reaches section plane)
      for (const gr of sec.glassRectangles) {
        const distToSection = Math.abs(cameraZ - sec.contentCenter);
        const fadeStart = VIEW_OFFSET;  // begin fading at this distance from contentCenter
        const proximityFade = Math.min(1, distToSection / fadeStart);
        gr.update(sec.opacity * proximityFade);
      }
    }
  }

  /** Get opacity for a given section ID. */
  getSectionOpacity(id: string): number {
    const sec = this.sections.find((s) => s.def.id === id);
    return sec ? sec.opacity : 0;
  }

  /** Get all meshes marked as interactive (for raycasting). */
  getInteractiveMeshes(): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    const idx = this.settledSection;
    if (idx < 0 || idx >= this.sections.length) return meshes;
    if (this.revealController.isFullyHidden(idx)) return meshes;
    this.sections[idx].group.traverse((child) => {
      if ((child as THREE.Mesh).isMesh && child.userData.interactive) {
        meshes.push(child as THREE.Mesh);
      }
    });
    return meshes;
  }
}
