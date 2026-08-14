/**
 * Sparse neural network: volumetric cylinder layout + neighbor connections + signal propagation.
 */

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface NetworkConfig {
  // --- Topology ---
  neuronCount: number;
  maxConnectionsPerNeuron: number; // upper bound — only a few hub neurons reach this
  minConnectionsPerNeuron: number; // guaranteed minimum connections per neuron
  connectionAlpha: number;       // power-law exponent (higher = heavier tail, more hubs)
  connectionRadius: number;     // max distance to form a connection
  cylinderInnerRadius: number;  // inner radius — neurons won't spawn closer than this
  cylinderOuterRadius: number;  // outer radius — neurons won't spawn farther than this
  cylinderLength: number;       // total Z extent

  // --- Input layer ---
  seedCount: number;            // number of input neurons to fire at simulation start
  minInputRate: number;         // fires per second at rest (no interaction)
  maxInputRate: number;         // fires per second at peak interaction
  inputDecay: number;           // seconds for input rate to decay from max → min
  inputZone: number;            // Z range from 0 that counts as the input layer

  // --- Neuron dynamics ---
  signalSpeed: number;          // t per second (signal traverses connection in 1/speed seconds)
  chargePerSignal: number;      // charge added to neuron per incoming signal
  fireThreshold: number;        // charge level that triggers firing (0-1)
  fireCost: number;              // charge subtracted on firing (remainder keeps neuron warm)
  chargeDecay: number;          // charge lost per second
  refractoryPeriod: number;     // seconds a neuron can't fire after firing
  downstreamOnly: boolean;      // cascade weighted by max(cos(angle),0) — forces downstream waves

  // --- Mouse interaction ---
  mouseFireRadius: number;      // world-space distance from ray to fire a neuron
  mouseFireRate: number;        // max neurons to fire per frame from mouse proximity

  // --- Signal timing (controls visual continuity) ---
  earlyFire: number;            // t at which destination neuron fires (< 1.0 for overlap)
  signalEnd: number;            // t at which signal is removed (> 1.0 for fade-out)
  sourceRamp: number;           // t range over which glow eases in at source (0→1)
  destFade: number;             // t range over which glow fades out past t=1.0
}

export const DEFAULT_NETWORK_CONFIG: NetworkConfig = {
  // --- Topology ---
  neuronCount: 2000, // 1500 * 1.35 = 
  maxConnectionsPerNeuron: 8,
  minConnectionsPerNeuron: 2,
  connectionAlpha: 10.0, // Higher is fewer hubs. 0.0 = uniform distribution. 
  connectionRadius: 3,
  cylinderInnerRadius: 100,
  cylinderOuterRadius: 300,
  cylinderLength: 600, // 700 / 520 = 1.35 aspect ratio (cylinder is taller than wide)

  // --- Input layer ---
  seedCount: 100,
  minInputRate: 50,              // gentle ambient firing
  maxInputRate: 300,             // intense firing during interaction
  inputDecay: 0.5,              // half-second decay back to min
  inputZone: 100,

  // --- Neuron dynamics ---
  signalSpeed: 0.9,
  chargePerSignal: 0.4,
  fireThreshold: 0.6,
  fireCost: 0.4,
  chargeDecay: 0.12,
  refractoryPeriod: 1.0,
  downstreamOnly: true,

  // --- Mouse interaction ---
  mouseFireRadius: 10,
  mouseFireRate: 10,

  // --- Signal timing ---
  earlyFire: 0.7,
  signalEnd: 1.3,
  sourceRamp: 0.5,
  destFade: 0.5,
};

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

export interface Signal {
  connIdx: number;
  t: number; // 0 = at src, 1 = at dst
  srcNeuron: number; // neuron that fired this signal (for downstream direction calc)
  fired: boolean; // true once the destination neuron has been triggered (at earlyFire threshold)
}

export class Network {
  readonly config: NetworkConfig;
  readonly neuronCount: number;
  readonly positions: Float32Array;     // [x, y, z] flat
  readonly connectionSrc: Uint16Array;
  readonly connectionDst: Uint16Array;
  readonly connectionCount: number;
  readonly connections: number[][];      // connections[neuron] → all connection indices (both ends)

  activations: Float32Array;            // neuron charge (0-1), drives core brightness
  somaGlow: Float32Array;               // soma flash level — spikes on arrival, decays to activation
  refractory: Float32Array;             // time remaining before neuron can fire again
  inputRate: number;                    // current dynamic input rate (set externally)
  inputZoneCenter = 0;                 // Z center of dynamic input zone (set externally, follows camera)
  inputFiresThisStep = 0;             // how many input neurons fired this step (interaction-driven)
  signals: Signal[] = [];
  private seeded = false;

  constructor(config: Partial<NetworkConfig> = {}) {
    this.config = { ...DEFAULT_NETWORK_CONFIG, ...config };
    this.neuronCount = this.config.neuronCount;
    this.positions = new Float32Array(this.neuronCount * 3);
    this.activations = new Float32Array(this.neuronCount);
    this.somaGlow = new Float32Array(this.neuronCount);
    this.refractory = new Float32Array(this.neuronCount);
    this.inputRate = this.config.minInputRate;
    this.connections = new Array(this.neuronCount);
    for (let i = 0; i < this.neuronCount; i++) { this.connections[i] = []; }

    this.placeNeurons();
    const conns = this.buildConnections();
    this.connectionSrc = conns.src;
    this.connectionDst = conns.dst;
    this.connectionCount = conns.count;

  }

  // -------------------------------------------------------------------------
  // Layout: toroidal distribution — neurons cluster near the ring radius,
  // thin out toward center and outer edge
  // -------------------------------------------------------------------------

  private placeNeurons(): void {
    const { neuronCount, cylinderInnerRadius, cylinderOuterRadius, cylinderLength } = this.config;

    for (let i = 0; i < neuronCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      // Uniform distribution between inner and outer radius (area-corrected)
      const rMin2 = cylinderInnerRadius * cylinderInnerRadius;
      const rMax2 = cylinderOuterRadius * cylinderOuterRadius;
      const r = Math.sqrt(rMin2 + Math.random() * (rMax2 - rMin2));
      const z = Math.random() * cylinderLength;

      this.positions[i * 3] = Math.cos(angle) * r;
      this.positions[i * 3 + 1] = Math.sin(angle) * r;
      this.positions[i * 3 + 2] = z;
    }
  }

  // -------------------------------------------------------------------------
  // Connections: random neighbors within a radius (no sorting, no O(n²) sort)
  // -------------------------------------------------------------------------

  private buildConnections(): { src: Uint16Array; dst: Uint16Array; count: number } {
    const { neuronCount, maxConnectionsPerNeuron, minConnectionsPerNeuron, connectionAlpha, connectionRadius } = this.config;
    const pos = this.positions;
    const r2 = connectionRadius * connectionRadius;

    // Sample per-neuron target from a power-law distribution (heavy tail)
    // u ~ Uniform(0,1), target = min + (max - min) * (1 - u)^(1/alpha)
    // Higher alpha → heavier tail (most neurons get min, a few get max)
    const targets = new Uint16Array(neuronCount);
    const range = maxConnectionsPerNeuron - minConnectionsPerNeuron;
    for (let i = 0; i < neuronCount; i++) {
      const u = Math.random();
      const t = Math.pow(u, connectionAlpha); // concentrates near 0
      targets[i] = Math.round(minConnectionsPerNeuron + range * t);
    }

    // Upper bound on total connections
    const maxConns = neuronCount * (maxConnectionsPerNeuron + minConnectionsPerNeuron);
    const src = new Uint16Array(maxConns);
    const dst = new Uint16Array(maxConns);
    let count = 0;

    // Track how many connections each neuron got
    const foundPerNeuron = new Uint16Array(neuronCount);

    // For each neuron, sample random candidates and accept those within radius
    for (let i = 0; i < neuronCount; i++) {
      const target = targets[i];
      const ix = pos[i * 3], iy = pos[i * 3 + 1], iz = pos[i * 3 + 2];
      let found = 0;
      let attempts = 0;
      const maxAttempts = target * 20;

      while (found < target && attempts < maxAttempts) {
        attempts++;
        const j = Math.floor(Math.random() * neuronCount);
        if (j === i) continue;

        const dx = pos[j * 3] - ix;
        const dy = pos[j * 3 + 1] - iy;
        const dz = pos[j * 3 + 2] - iz;
        if (dx * dx + dy * dy + dz * dz < r2) {
          src[count] = i;
          dst[count] = j;
          this.connections[i].push(count);
          this.connections[j].push(count);
          count++;
          found++;
        }
      }
      foundPerNeuron[i] = found;
    }

    // Guarantee minimum connections: find nearest neurons as fallback
    for (let i = 0; i < neuronCount; i++) {
      if (foundPerNeuron[i] >= minConnectionsPerNeuron) continue;
      const ix = pos[i * 3], iy = pos[i * 3 + 1], iz = pos[i * 3 + 2];
      const needed = minConnectionsPerNeuron - foundPerNeuron[i];

      // Sample random candidates and pick the closest ones
      const candidates: { j: number; d2: number }[] = [];
      for (let s = 0; s < 200; s++) {
        const j = Math.floor(Math.random() * neuronCount);
        if (j === i) continue;
        const dx = pos[j * 3] - ix;
        const dy = pos[j * 3 + 1] - iy;
        const dz = pos[j * 3 + 2] - iz;
        candidates.push({ j, d2: dx * dx + dy * dy + dz * dz });
      }
      candidates.sort((a, b) => a.d2 - b.d2);

      let added = 0;
      for (const c of candidates) {
        if (added >= needed) break;
        src[count] = i;
        dst[count] = c.j;
        this.connections[i].push(count);
        this.connections[c.j].push(count);
        count++;
        added++;
      }
    }

    return {
      src: src.slice(0, count),
      dst: dst.slice(0, count),
      count,
    };
  }

  // -------------------------------------------------------------------------
  // Simulation step
  // -------------------------------------------------------------------------

  step(dt: number): void {
    const { signalSpeed, seedCount, chargePerSignal, fireThreshold, fireCost, chargeDecay, refractoryPeriod } = this.config;
    this.inputFiresThisStep = 0;

    // Decay charge, soma glow, soma scale, and refractory timers
    const somaDecayRate = 3.0;
    for (let i = 0; i < this.neuronCount; i++) {
      this.activations[i] = Math.max(0, this.activations[i] - chargeDecay * dt);
      this.refractory[i] = Math.max(0, this.refractory[i] - dt);
      const target = this.activations[i];
      if (this.somaGlow[i] > target) {
        this.somaGlow[i] = Math.max(target, this.somaGlow[i] - somaDecayRate * dt);
      } else {
        this.somaGlow[i] = target;
      }
    }

    // Advance signals — fire destination early, keep alive for fade-out
    const { earlyFire, signalEnd } = this.config;
    const arrived: { neuron: number; fromNeuron: number }[] = [];
    const alive: Signal[] = [];

    for (const sig of this.signals) {
      sig.t += signalSpeed * dt;

      // Early fire: trigger the destination neuron before the signal visually arrives
      if (!sig.fired && sig.t >= earlyFire) {
        sig.fired = true;
        // Destination is whichever end of the connection is NOT the source neuron
        const s = this.connectionSrc[sig.connIdx];
        const d = this.connectionDst[sig.connIdx];
        const dstNeuron = (sig.srcNeuron === s) ? d : s;
        this.activations[dstNeuron] = Math.min(1.0, this.activations[dstNeuron] + chargePerSignal);
        this.somaGlow[dstNeuron] = 1.0;
        arrived.push({ neuron: dstNeuron, fromNeuron: sig.srcNeuron });
      }

      // Keep signal alive for visual fade-out past t=1.0
      if (sig.t < signalEnd) {
        alive.push(sig);
      }
    }
    this.signals = alive;

    // Integrate-and-fire: only if not in refractory period
    for (const { neuron, fromNeuron } of arrived) {
      if (this.activations[neuron] >= fireThreshold && this.refractory[neuron] <= 0) {
        this.activations[neuron] = Math.max(0, this.activations[neuron] - fireCost);
        this.somaGlow[neuron] = 1.0;
        this.refractory[neuron] = refractoryPeriod;
        this.fireNeuronDownstream(neuron, fromNeuron);
      }
    }

    // Collect input neurons dynamically around inputZoneCenter
    const inputHalf = this.config.inputZone;
    const izMin = this.inputZoneCenter - inputHalf;
    const izMax = this.inputZoneCenter + inputHalf;
    const inputNeurons: number[] = [];
    for (let i = 0; i < this.neuronCount; i++) {
      const z = this.positions[i * 3 + 2];
      if (z >= izMin && z <= izMax) inputNeurons.push(i);
    }

    // Initial seed burst — fire across the entire cylinder
    if (!this.seeded) {
      this.seeded = true;
      const allNeurons: number[] = [];
      for (let i = 0; i < this.neuronCount; i++) allNeurons.push(i);
      for (let i = allNeurons.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allNeurons[i], allNeurons[j]] = [allNeurons[j], allNeurons[i]];
      }
      const count = Math.min(seedCount, allNeurons.length);
      for (let k = 0; k < count; k++) {
        const i = allNeurons[k];
        this.activations[i] = 1.0;
        this.somaGlow[i] = 1.0;
        this.refractory[i] = refractoryPeriod;
        for (const connIdx of this.connections[i]) {
          this.signals.push({ connIdx, t: -Math.random() * 0.3, srcNeuron: i, fired: false });
        }
      }
    }

    // Continuous input layer firing — zone follows camera
    if (inputNeurons.length > 0) {
      const firesToEmit = this.inputRate * dt;
      const wholeFires = Math.floor(firesToEmit);
      const fractional = firesToEmit - wholeFires;
      const totalFires = wholeFires + (Math.random() < fractional ? 1 : 0);

      for (let k = 0; k < totalFires; k++) {
        const i = inputNeurons[Math.floor(Math.random() * inputNeurons.length)];
        if (this.refractory[i] > 0) continue;
        this.activations[i] = 1.0;
        this.somaGlow[i] = 1.0;
        this.refractory[i] = refractoryPeriod;
        this.fireNeuron(i, 0, { dx: 0, dy: 0, dz: 1 });
        this.inputFiresThisStep++;
      }
    }
  }

  private fireNeuron(neuron: number, headStart: number = 0, direction?: { dx: number; dy: number; dz: number }): void {
    const conns = this.connections[neuron];
    if (conns.length === 0) return;

    if (direction) {
      // Directional mode: fire 1-2 connections aligned with the given direction
      const pos = this.positions;
      const dLen = Math.sqrt(direction.dx * direction.dx + direction.dy * direction.dy + direction.dz * direction.dz) || 1;
      const candidates: number[] = [];
      for (const connIdx of conns) {
        const s = this.connectionSrc[connIdx];
        const d = this.connectionDst[connIdx];
        const other = (neuron === s) ? d : s;
        const ox = pos[other * 3] - pos[neuron * 3];
        const oy = pos[other * 3 + 1] - pos[neuron * 3 + 1];
        const oz = pos[other * 3 + 2] - pos[neuron * 3 + 2];
        const oLen = Math.sqrt(ox * ox + oy * oy + oz * oz) || 1;
        const cos = (direction.dx * ox + direction.dy * oy + direction.dz * oz) / (dLen * oLen);
        if (cos > 0) candidates.push(connIdx);
      }
      if (candidates.length === 0) return;
      // Fire 1-2 with staggered starts
      const toFire = Math.min(1 + Math.floor(Math.random() * 2), candidates.length);
      for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
      }
      for (let k = 0; k < toFire; k++) {
        this.signals.push({ connIdx: candidates[k], t: headStart - Math.random() * 0.15, srcNeuron: neuron, fired: false });
      }
    } else {
      // Original random mode
      const connIdx = conns[Math.floor(Math.random() * conns.length)];
      this.signals.push({ connIdx, t: headStart, srcNeuron: neuron, fired: false });
    }
  }

  /**
   * Fire a single neuron by index (used for mouse proximity interaction).
   * Respects refractory period.
   */
  fireNeuronByIndex(i: number): void {
    if (i < 0 || i >= this.neuronCount) return;
    if (this.refractory[i] > 0) return;
    this.activations[i] = 1.0;
    this.somaGlow[i] = 1.0;
    this.refractory[i] = this.config.refractoryPeriod;
    // Fire all connections (unified — direction determined by signal propagation)
    for (const connIdx of this.connections[i]) {
      this.signals.push({ connIdx, t: -Math.random() * 0.15, srcNeuron: i, fired: false });
    }
  }

  /**
   * Fire a burst of neurons within a Z-slice — used by section triggers.
   */
  fireZoneNeurons(zMin: number, zMax: number, count: number, direction?: { dx: number; dy: number; dz: number }): void {
    const zone: number[] = [];
    for (let i = 0; i < this.neuronCount; i++) {
      const z = this.positions[i * 3 + 2];
      if (z >= zMin && z <= zMax) zone.push(i);
    }
    for (let i = zone.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [zone[i], zone[j]] = [zone[j], zone[i]];
    }
    const toFire = Math.min(count, zone.length);
    for (let k = 0; k < toFire; k++) {
      const i = zone[k];
      this.activations[i] = 1.0;
      this.somaGlow[i] = 1.0;
      this.refractory[i] = this.config.refractoryPeriod;
      if (direction) {
        // Directional burst — focused wave
        this.fireNeuron(i, 0, direction);
      } else {
        for (const connIdx of this.connections[i]) {
          this.signals.push({ connIdx, t: 0, srcNeuron: i, fired: false });
        }
      }
    }
  }

  private fireNeuronDownstream(neuron: number, fromNeuron: number): void {
    const conns = this.connections[neuron];
    if (conns.length === 0) return;

    const pos = this.positions;
    // Incoming direction: fromNeuron → this neuron
    const inDx = pos[neuron * 3] - pos[fromNeuron * 3];
    const inDy = pos[neuron * 3 + 1] - pos[fromNeuron * 3 + 1];
    const inDz = pos[neuron * 3 + 2] - pos[fromNeuron * 3 + 2];
    const inLen = Math.sqrt(inDx * inDx + inDy * inDy + inDz * inDz) || 1;

    // Collect forward-aligned connections (cosAngle > -0.1 = wide forward cone)
    const forward: number[] = [];
    for (const connIdx of conns) {
      const s = this.connectionSrc[connIdx];
      const d = this.connectionDst[connIdx];
      const other = (neuron === s) ? d : s;
      if (other === fromNeuron) continue; // don't fire back along the incoming connection
      const outDx = pos[other * 3] - pos[neuron * 3];
      const outDy = pos[other * 3 + 1] - pos[neuron * 3 + 1];
      const outDz = pos[other * 3 + 2] - pos[neuron * 3 + 2];
      const outLen = Math.sqrt(outDx * outDx + outDy * outDy + outDz * outDz) || 1;
      const cosAngle = (inDx * outDx + inDy * outDy + inDz * outDz) / (inLen * outLen);
      if (cosAngle > -0.1) forward.push(connIdx);
    }

    if (forward.length === 0) return;

    // Fire all forward connections with staggered starts for organic rolling feel
    for (const connIdx of forward) {
      this.signals.push({ connIdx, t: -Math.random() * 0.15, srcNeuron: neuron, fired: false });
    }
  }
}

