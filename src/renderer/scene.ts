import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { Network } from '../network';
import { buildFilaments } from './filaments';
import {
  getColors, FOG_NEAR, FOG_FAR,
  NEURON_RADIUS, NEURON_SEGMENTS, NEURON_RINGS,
  SOMA_RADIUS, SOMA_SEGMENTS, SOMA_RINGS, SOMA_OPACITY,
} from './visual';
import { getBrightness } from '../theme';
import { SectionManager } from '../sections/sectionManager';
import { SECTIONS } from '../sections/sectionConfig';
import { setupInteraction } from '../sections/interaction';
import { initScroll, getEffectiveZ, scrollToSection, navigateDirection } from '../scroll';
import { initProjectsOverlay, setProjectsOverlayVisible } from '../sections/projectsOverlay';
import { initAboutOverlays, setAboutOverlayVisible } from '../sections/about_me/aboutOverlay';
import { initSkillsOverlay, setSkillsOverlayVisible } from '../sections/skills/skillsOverlay';

const initColors = getColors();
const COLOR_ACTIVE = new THREE.Color(initColors.neuronActive);
const COLOR_DIM = new THREE.Color(initColors.neuronDim);
const SOMA_DIM = new THREE.Color(initColors.somaDim);
const SOMA_ACTIVE = new THREE.Color(initColors.somaActive);
const BG_COLOR = new THREE.Color(initColors.background);
const ENV_COLOR = new THREE.Color(initColors.envMap);

export interface SceneHandle {
  animate(): void;
}

export function createScene(network: Network): SceneHandle {
  // --- Renderer ---
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  document.getElementById('app')!.appendChild(renderer.domElement);

  // --- Scene ---
  const scene = new THREE.Scene();
  scene.background = BG_COLOR;
  scene.fog = new THREE.Fog(BG_COLOR, FOG_NEAR, FOG_FAR);

  // --- Solid-color environment map (gives glass something to reflect) ---
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileCubemapShader();

  const envColor = new THREE.Color();

  function buildEnvMap(color: THREE.Color): THREE.Texture {
    envColor.copy(color);
    const envScene = new THREE.Scene();
    envScene.background = envColor;
    const envMap = pmrem.fromScene(envScene, 0).texture;
    envScene.background = null;
    return envMap;
  }

  scene.environment = buildEnvMap(ENV_COLOR);

  // --- Lights ---
  RectAreaLightUniformsLib.init();

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  // --- Mouse-tracking area light (wide soft highlight that follows cursor) ---
  // Faces back toward camera (-Z) so it illuminates glass sphere front faces
  const mouseLight = new THREE.RectAreaLight(0xffffff, 3.0, 30, 30);
  mouseLight.position.set(0, 0, 0);
  scene.add(mouseLight);

  const BASE_FOV = 70;
  const BASE_ASPECT = 1; // aspect ratio where current framing looks correct

  // Compute the horizontal FOV at baseline once
  const BASE_HFOV = 2 * Math.atan(Math.tan((BASE_FOV * Math.PI) / 360) * BASE_ASPECT);

  // --- Two large area lights for broad, soft specular reflections ---
  const specLight1 = new THREE.RectAreaLight(0xffe8c0, 3.0, 10, 40); // warm gold, large panel
  specLight1.position.set(-30, 20, 50);
  specLight1.lookAt(0, 0, 50);
  scene.add(specLight1);

  const specLight2 = new THREE.RectAreaLight(0xc0d8ff, 3.0, 35, 35); // cool blue, large panel
  specLight2.position.set(25, -15, 60);
  specLight2.lookAt(0, 0, 60);
  scene.add(specLight2);

  // --- Camera: centered in cylinder, looking forward along Z ---
  const camera = new THREE.PerspectiveCamera(
    BASE_HFOV,
    window.innerWidth / window.innerHeight,
    0.1,
    1000,
  );
  // Start camera at the home section's ideal viewing position
  const homeViewZ = 35 - 16; // contentCenter - VIEW_OFFSET
  let currentZ = homeViewZ;
  camera.position.set(0, 0, homeViewZ);
  camera.lookAt(0, 0, homeViewZ + 50);
  scene.add(camera); // needed so camera children (nav pills) render

  // Scroll drives camera through cylinder
  let lastInteraction = 0;

  // Track scroll as interaction for neuron input rate
  window.addEventListener('scroll', () => { lastInteraction = performance.now(); }, { passive: true });

  // Arrow keys navigate sections (with projects sub-page awareness)
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      navigateDirection(1);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      navigateDirection(-1);
    }
  });

  // --- Mouse proximity firing ---
  const mouseNDC = new THREE.Vector2(0, 0);
  const raycaster = new THREE.Raycaster();
  const mouseRadiusSq = network.config.mouseFireRadius * network.config.mouseFireRadius;
  const mouseFireRate = network.config.mouseFireRate;
  let mouseOnScreen = false;

  window.addEventListener('mousemove', (e) => {
    mouseNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
    mouseOnScreen = true;
  });
  window.addEventListener('mouseleave', () => { mouseOnScreen = false; });

  // --- Neurons: tiny instanced spheres ---
  const geo = new THREE.SphereGeometry(NEURON_RADIUS, NEURON_SEGMENTS, NEURON_RINGS);
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, fog: true });
  const mesh = new THREE.InstancedMesh(geo, mat, network.neuronCount);

  const dummy = new THREE.Object3D();
  const pos = network.positions;
  for (let i = 0; i < network.neuronCount; i++) {
    dummy.position.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;

  // Instance colors
  const colorData = new Float32Array(network.neuronCount * 3);
  for (let i = 0; i < network.neuronCount; i++) {
    colorData[i * 3] = COLOR_DIM.r;
    colorData[i * 3 + 1] = COLOR_DIM.g;
    colorData[i * 3 + 2] = COLOR_DIM.b;
  }
  mesh.instanceColor = new THREE.InstancedBufferAttribute(colorData, 3);
  mesh.renderOrder = -1;
  scene.add(mesh);

  // --- Soma: transparent outer sphere around each neuron ---
  const somaGeo = new THREE.SphereGeometry(SOMA_RADIUS, SOMA_SEGMENTS, SOMA_RINGS);
  const somaMat = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: SOMA_OPACITY,
    fog: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const somaMesh = new THREE.InstancedMesh(somaGeo, somaMat, network.neuronCount);
  const somaColorData = new Float32Array(network.neuronCount * 3);
  for (let i = 0; i < network.neuronCount; i++) {
    dummy.position.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    dummy.updateMatrix();
    somaMesh.setMatrixAt(i, dummy.matrix);
    somaColorData[i * 3] = SOMA_DIM.r;
    somaColorData[i * 3 + 1] = SOMA_DIM.g;
    somaColorData[i * 3 + 2] = SOMA_DIM.b;
  }
  somaMesh.instanceMatrix.needsUpdate = true;
  somaMesh.instanceColor = new THREE.InstancedBufferAttribute(somaColorData, 3);
  somaMesh.renderOrder = -1;
  scene.add(somaMesh);

  // --- Filaments ---
  const { updateSignals } = buildFilaments(network, scene);

  // --- Sections ---
  const sectionManager = new SectionManager(SECTIONS, network, scene);
  setupInteraction(camera, renderer.domElement, () => sectionManager.getInteractiveMeshes());

  // --- HTML Nav Bar ---
  const sectionCenters = sectionManager.getSectionCenters();
  const navLinks = document.querySelectorAll<HTMLElement>('#nav-pill .nav-link');
  const segmentsByNav = new Map<string, HTMLElement[]>();
  navLinks.forEach((link) => {
    const segs = Array.from(link.querySelectorAll<HTMLElement>('.nav-segment'));
    if (segs.length > 0 && link.dataset.section) segmentsByNav.set(link.dataset.section, segs);
  });
  const sectionIdToIndex = new Map<string, number>();
  const sectionIndicesByNav = new Map<string, number[]>();
  let activeNavId = '';

  // Populate section Z list and initialize DOM scroll system
  const sectionZList = sectionCenters.map((sc, i) => {
    if (!sectionIdToIndex.has(sc.id)) sectionIdToIndex.set(sc.id, i);
    if (!sectionIndicesByNav.has(sc.id)) sectionIndicesByNav.set(sc.id, []);
    sectionIndicesByNav.get(sc.id)!.push(i);
    return sc.z;
  });
  initScroll(sectionZList);
  initProjectsOverlay();
  initAboutOverlays();
  initSkillsOverlay();

  navLinks.forEach((link) => {
    link.addEventListener('click', () => {
      const sectionId = link.dataset.section;
      if (!sectionId) return;
      const indices = sectionIndicesByNav.get(sectionId);
      if (!indices || indices.length === 0) return;
      if (indices.length > 1 && activeNavId === sectionId) {
        // Already in this group — advance to the next subsection (wraps)
        let minD = Infinity, curSub = 0;
        indices.forEach((idx, si) => {
          const d = Math.abs(currentZ - sectionZList[idx]);
          if (d < minD) { minD = d; curSub = si; }
        });
        scrollToSection(indices[(curSub + 1) % indices.length]);
      } else {
        scrollToSection(indices[0]);
      }
    });
  });

  // Monogram "S" navigates to home
  const monogram = document.querySelector<HTMLElement>('.nav-monogram');
  if (monogram) {
    monogram.style.cursor = 'pointer';
    monogram.addEventListener('click', () => {
      const idx = sectionIdToIndex.get('home');
      if (idx !== undefined) scrollToSection(idx);
    });
  }

  // // --- Resize ---
  // window.addEventListener('resize', () => {
  //   camera.aspect = window.innerWidth / window.innerHeight;
  //   camera.updateProjectionMatrix();
  //   renderer.setSize(window.innerWidth, window.innerHeight);
  // });

  function updateCamera() {
    const aspect = window.innerWidth / window.innerHeight;
    if (aspect < BASE_ASPECT) {
      const mobileZoom = window.innerWidth < 640 ? 0.9 : 1.0;
      const mobileHFOV = BASE_HFOV * mobileZoom;
      camera.fov = 2 * Math.atan(Math.tan(mobileHFOV / 2) / aspect) * (180 / Math.PI);
    } else {
      camera.fov = BASE_FOV;
    }
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', updateCamera);
  updateCamera();


  // --- Theme change (fires every animation frame during transition) ---
  let lastEnvRebuild = 0;
  window.addEventListener('theme-change', () => {
    const c = getColors();
    BG_COLOR.set(c.background);
    scene.background = BG_COLOR;
    scene.fog = new THREE.Fog(BG_COLOR, FOG_NEAR, FOG_FAR);
    COLOR_DIM.set(c.neuronDim);
    COLOR_ACTIVE.set(c.neuronActive);
    SOMA_DIM.set(c.somaDim);
    SOMA_ACTIVE.set(c.somaActive);
    const t = getBrightness();
    ambientLight.intensity = 0.4 + t * 0.2;
    specLight1.intensity = 6.0 + t * 1.0;
    specLight2.intensity = 5.0 + t * 1.0;
    // Rebuild env map periodically during transition (throttled to avoid perf hit)
    const now = performance.now();
    if (now - lastEnvRebuild > 10) {
      lastEnvRebuild = now;
      ENV_COLOR.set(c.envMap);
      scene.environment?.dispose();
      scene.environment = buildEnvMap(ENV_COLOR);
    }
  });

  // Apply initial brightness-dependent values (needed for reload in light mode)
  const initT = getBrightness();
  ambientLight.intensity = 0.4 + initT * 0.2;
  specLight1.intensity = 6.0 + initT * 1.0;
  specLight2.intensity = 5.0 + initT * 1.0;

  // --- Animation ---
  const tmpColor = new THREE.Color();
  let lastTime = performance.now();

  function animate() {
    requestAnimationFrame(animate);

    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, 0.05); // cap at 50ms
    lastTime = now;

    // Update input rate based on interaction recency
    const { minInputRate, maxInputRate, inputDecay } = network.config;
    const timeSinceInteraction = (now - lastInteraction) / 1000;
    const interactionFactor = Math.max(0, 1 - timeSinceInteraction / inputDecay);
    network.inputRate = minInputRate + (maxInputRate - minInputRate) * interactionFactor;

    // Input layer follows camera — fires from the slice just behind the viewer
    network.inputZoneCenter = Math.max(0, currentZ - 5);

    // Mouse ray (used for neuron firing + cell body hover)
    raycaster.setFromCamera(mouseNDC, camera);
    sectionManager.updateHover(mouseOnScreen ? raycaster : null, dt);

    // Move mouse area light to follow cursor — faces back toward camera
    if (mouseOnScreen) {
      const lx = mouseNDC.x * 30;
      const ly = mouseNDC.y * 25;
      const lz = currentZ + 40;
      mouseLight.position.set(lx, ly, lz);
      mouseLight.lookAt(lx, ly, lz - 50); // face toward camera (-Z)
      mouseLight.intensity = 0.2;
    } else {
      mouseLight.intensity = 0;
    }

    // Keep specular area lights tracking with camera Z
    specLight1.position.z = currentZ + 50;
    specLight1.lookAt(0, 0, currentZ + 50);
    specLight2.position.z = currentZ + 60;
    specLight2.lookAt(0, 0, currentZ + 60);

    // Mouse proximity: fire neurons near the mouse ray
    if (mouseOnScreen) {
      const rayOrigin = raycaster.ray.origin;
      const rayDir = raycaster.ray.direction;
      let fired = 0;
      for (let i = 0; i < network.neuronCount && fired < mouseFireRate; i++) {
        if (network.refractory[i] > 0) continue;
        // Vector from ray origin to neuron
        const px = pos[i * 3] - rayOrigin.x;
        const py = pos[i * 3 + 1] - rayOrigin.y;
        const pz = pos[i * 3 + 2] - rayOrigin.z;
        // Project onto ray direction
        const dot = px * rayDir.x + py * rayDir.y + pz * rayDir.z;
        if (dot < 0) continue; // behind camera
        // Squared distance from point to ray
        const d2 = px * px + py * py + pz * pz - dot * dot;
        if (d2 < mouseRadiusSq) {
          network.fireNeuronByIndex(i);
          fired++;
        }
      }
    }

    // Step simulation
    network.step(dt);

    // Camera Z derived from DOM scroll position (or direct Z tween during multi-section jumps)
    currentZ = getEffectiveZ();

    camera.position.set(0, 0, currentZ);
    camera.lookAt(0, 0, currentZ + 50);

    // Update neuron core + soma colors based on activation
    const attr = mesh.instanceColor as THREE.InstancedBufferAttribute;
    const somaAttr = somaMesh.instanceColor as THREE.InstancedBufferAttribute;
    for (let i = 0; i < network.neuronCount; i++) {
      const a = network.activations[i];
      tmpColor.copy(COLOR_DIM).lerp(COLOR_ACTIVE, a);
      attr.setXYZ(i, tmpColor.r, tmpColor.g, tmpColor.b);
      const sg = network.somaGlow[i];
      tmpColor.copy(SOMA_DIM).lerp(SOMA_ACTIVE, sg);
      somaAttr.setXYZ(i, tmpColor.r, tmpColor.g, tmpColor.b);
    }
    attr.needsUpdate = true;
    somaAttr.needsUpdate = true;

    // Update filament glow from signals
    updateSignals(network.signals);

    // Update section visibility/transitions
    sectionManager.update(currentZ, dt);

    // Sync HTML overlay opacities with section manager
    const proj1Opacity = sectionManager.getSectionOpacity('projects-1');
    const proj2Opacity = sectionManager.getSectionOpacity('projects-2');
    setProjectsOverlayVisible('projects-1', proj1Opacity > 0.3);
    setProjectsOverlayVisible('projects-2', proj2Opacity > 0.3);

    // Sync skills HTML overlay
    const skillsOpacity = sectionManager.getSectionOpacity('skills');
    setSkillsOverlayVisible(skillsOpacity > 0.3);

    // Sync about HTML overlays (layers 2 and 3)
    const about2Opacity = sectionManager.getSectionOpacity('about-2');
    const about3Opacity = sectionManager.getSectionOpacity('about-3');
    setAboutOverlayVisible('about-2', about2Opacity > 0.3);
    setAboutOverlayVisible('about-3', about3Opacity > 0.3);

    // Update active nav link
    let minDist = Infinity;
    let nearestId = '';
    for (const sc of sectionCenters) {
      const d = Math.abs(currentZ - sc.z);
      if (d < minDist) { minDist = d; nearestId = sc.id; }
    }
    activeNavId = nearestId;
    navLinks.forEach((link) => {
      link.classList.toggle('active', link.dataset.section === nearestId);
    });

    // Update segmented underline for multi-subsection nav groups (projects, about)
    const activeSegments = segmentsByNav.get(nearestId);
    if (activeSegments) {
      let minSubDist = Infinity;
      let activeSegment = 0;
      let segIdx = 0;
      for (const sc of sectionCenters) {
        if (sc.id !== nearestId) continue;
        const d = Math.abs(currentZ - sc.z);
        if (d < minSubDist) { minSubDist = d; activeSegment = segIdx; }
        segIdx++;
      }
      activeSegments.forEach((seg, i) => seg.classList.toggle('active', i === activeSegment));
    }
    for (const [navId, segs] of segmentsByNav) {
      if (navId !== nearestId) segs.forEach(s => s.classList.remove('active'));
    }

    renderer.render(scene, camera);
  }

  return { animate };
}
