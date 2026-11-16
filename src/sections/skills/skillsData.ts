/**
 * Skill categories and items.
 * Edit this file to add/remove skills — the overlay auto-adjusts.
 *
 * Each category has a `theme` that drives its visual style:
 *   - 'terminal'  → shell prompt, typewriter, block-char proficiency
 *   - 'register'  → datasheet register map table, bit-field proficiency
 *   - 'training'  → ML training log, inline accuracy metric
 */

export type CategoryTheme = 'terminal' | 'register' | 'training' | 'plain';

export interface SkillItem {
  name: string;
  abbr: string;
  proficiency: number;  // 0–1
  years?: number;

  /** Languages: formatted print statement. Embedded: ignored (bit scan). AI: ignored (number count-up). */
  hoverLine?: string;

  /** Multi-line expanded content shown on click */
  expandedLines: string[];

  /** CUDA only: hover lines appear simultaneously with random offsets */
  parallelPrint?: boolean;

  /** Date when user started this skill (MM/DD/YYYY) — used by training theme */
  startDate?: string;

  // --- Register-specific fields ---
  /** Hex address for register map display */
  regAddr?: string;
  /** Section/peripheral name */
  regSection?: string;
  /** Register mnemonic (ALL CAPS) */
  regName?: string;
}

export interface SkillCategory {
  id: string;
  label: string;
  theme: CategoryTheme;
  skills: SkillItem[];
}

export const SKILL_CATEGORIES: SkillCategory[] = [
  // ---------------------------------------------------------------------------
  // LANGUAGES — Terminal / REPL
  // ---------------------------------------------------------------------------
  {
    id: 'languages',
    label: 'Languages',
    theme: 'terminal',
    skills: [
      {
        name: 'Python', abbr: 'Py', proficiency: 0.9, years: 2021,
        hoverLine: 'print(f"Python:\\tsince 2021 | web dev, ML, data")',
        expandedLines: [
          '>>> import this',
          '>>> print(f"Python: since 2021 | web dev, ML, data")',
          'Python: since 2021 | web dev, ML, data',
          '# numpy, torch, mujoco, ROS2 bindings',
        ],
      },
      {
        name: 'C', abbr: 'C', proficiency: 0.9, years: 2023,
        hoverLine: 'printf("C:\\tsince 2023 | systems & embedded\\n");',
        parallelPrint: true,
        expandedLines: [
          '$ gcc -O2 -Wall -o main main.c',
          '$ ./main',
          'C: since 2023 | control systems & embedded',
          '// ROS2, mujoco, isaacsim, POSIX, bare-metal',
        ],
      },
      {
        name: 'C++', abbr: 'C+', proficiency: 0.8, years: 2023,
        hoverLine: 'std::cout << "C++:\\tsince 2023 | templates, STL" << std::endl;',
        expandedLines: [
          '$ g++ -std=c++20 -o main main.cpp',
          '$ ./main',
          'C++: since 2023 | control systems, embedded',
          '// ROS2, mujoco, isaacsim, optimization',
        ],
      },
      {
        name: 'CUDA', abbr: 'Cu', proficiency: 0.7, years: 2023,
        hoverLine: 'printf("CUDA:\\tsince 2023 | GPU compute\\n");',
        parallelPrint: true,
        expandedLines: [
          '__global__ void hello() {',
          '  printf("[Thread %d] Hello!\\n", threadIdx.x);',
          '}',
          '// kernels, k-means project, 1600x+ speedup',
        ],
      },
      {
        name: 'Rust', abbr: 'Rs', proficiency: 0.5, years: 2025,
        hoverLine: 'println!("Rust:\\tsince 2025 | handsi, compiling");',
        expandedLines: [
          '$ cargo run',
          '   Compiling handsi v0.2.0',
          '    Finished release [optimized]',
          '// passion project, systems programming',
        ],
      },
    ],
  },
  // ---------------------------------------------------------------------------
  // EMBEDDED & SYSTEMS — Register Map / Datasheet
  // ---------------------------------------------------------------------------
  {
    id: 'embedded',
    label: 'Embedded & Systems',
    theme: 'register',
    skills: [
      {
        name: 'STM32', abbr: 'ST', proficiency: 0.9,
        regAddr: '0x2024', regSection: 'Baremetal Firmware',
        expandedLines: [
          'Peripherals: SPI, UART, I2C, SAI, DMA',
          'Network:     LwIP, TCP/IP, mDNS',
          'RTOS:        FreeRTOS, task scheduling',
          'Debug:       SWD, logic analyzer',
        ],
      },
      {
        name: 'ROS2', abbr: 'R2', proficiency: 0.6,
        regAddr: '0x2025', regSection: 'NDA',
        expandedLines: [
          '-- NDA: project details under agreement --',
          'pub /joint_cmd   trajectory_msgs/JointTrajectory',
          'pub /cmd_vel     geometry_msgs/Twist',
          'sub /joint_state sensor_msgs/JointState',
        ],
      },
      {
        name: 'EtherCAT', abbr: 'EC', proficiency: 0.7,
        regAddr: '0x2025', regSection: 'Motor Drive',
        expandedLines: [
          'Bus:        EtherCAT (CoE)',
          'Control:    Real-time motor-drive loop',
          'Devices:    Distributed state machines',
        ],
      },
      {
        name: 'Real-Time Linux', abbr: 'RT', proficiency: 0.8,
        regAddr: '0x2026', regSection: 'NDA',
        expandedLines: [
          '-- NDA: project details under agreement --',
          'Kernel:     PREEMPT_RT patched Linux',
          'Scheduling: Deterministic, priority-based',
          'Control:    Compliance control loops',
          'Latency:    Sub-millisecond guarantees',
        ],
      },
      {
        name: 'Arduino', abbr: 'Ar', proficiency: 0.7,
        regAddr: '0x2024', regSection: 'Sailboat Fleet',
        expandedLines: [
          'Project:    Autonomous sailboat fleet',
          'Sensors:    IMU, encoders, wind vane',
          'Telemetry:  Radio link',
          'Actuation:  Propulsion, rudder, sail',
        ],
      },
    ],
  },
  // ---------------------------------------------------------------------------
  // ROBOTICS & SIMULATION — Plain (static text, no animation)
  // ---------------------------------------------------------------------------
  {
    id: 'robotics-sim',
    label: 'Robotics & Simulation',
    theme: 'plain',
    skills: [
      {
        name: 'Isaac Sim/Lab', abbr: 'Is', proficiency: 0.75,
        startDate: '2026',
        expandedLines: [
          'NVIDIA Isaac Sim & Isaac Lab',
          'Robot modeling, domain randomization',
          'Sim-to-real transfer pipelines',
        ],
      },
      {
        name: 'MuJoCo', abbr: 'Mj', proficiency: 0.75,
        startDate: '2024',
        expandedLines: [
          'MuJoCo physics simulation',
          'Contact-rich manipulation modeling',
          'Policy training & evaluation',
        ],
      },
      {
        name: 'Real-Time Robot Control', abbr: 'rt', proficiency: 0.8,
        startDate: '2025',
        expandedLines: [
          'Real-time control for safe physical human-robot interaction',
          'Torque & joint control of robot manipulators',
        ],
      },
      {
        name: 'MATLAB', abbr: 'ML', proficiency: 0.7,
        startDate: '2022',
        expandedLines: [
          'Backdrivability & haptic interaction simulation',
          'Control prototyping, modeling & analysis',
        ],
      },
      {
        name: 'SolidWorks', abbr: 'SW', proficiency: 0.5,
        startDate: '2022',
        expandedLines: [
          'Carbon-fiber end effectors & sensor mounts',
          'Custom fixtures for Dexter HDI & Amber B1',
        ],
      },
    ],
  },
  // ---------------------------------------------------------------------------
  // MACHINE LEARNING — Training Log
  // ---------------------------------------------------------------------------
  {
    id: 'ml',
    label: 'Machine Learning',
    theme: 'training',
    skills: [
      {
        name: 'PyTorch', abbr: 'Pt', proficiency: 0.85,
        startDate: '2024',
        hoverLine: 'Epoch 40/50 | val_loss: 0.0231 | acc: 0.93',
        expandedLines: [
          'Tensors, autograd, custom nn.Modules',
          'Training loops, mixed precision, DDP',
          'Model deployment & inference',
          'Epoch 38/50 | val_loss: 0.0252 | acc: 0.92',
          'Epoch 40/50 | val_loss: 0.0231 | acc: 0.93',
        ],
      },
      {
        name: 'Reinforcement Learning', abbr: 'RL', proficiency: 0.85,
        startDate: '2024',
        hoverLine: 'Episode 2400 | reward: 487.3 | entropy: 1.42',
        expandedLines: [
          '-- NDA: project details under agreement --',
          'Policy gradient, off-policy, entropy-regularized',
          'Episode 2398 | reward: 479.1 | entropy: 1.45',
          'Episode 2399 | reward: 483.6 | entropy: 1.43',
          'Episode 2400 | reward: 487.3 | entropy: 1.42',
        ],
      },
      {
        name: 'Imitation Learning', abbr: 'IL', proficiency: 0.8,
        startDate: '2026',
        hoverLine: 'Demo 320 | BC loss: 0.0187 | success: 0.84',
        expandedLines: [
          '-- NDA: project details under agreement --',
          'Behavioral cloning, residual policies, LfD',
          'Demo 318 | BC loss: 0.0203 | success: 0.81',
          'Demo 319 | BC loss: 0.0195 | success: 0.83',
          'Demo 320 | BC loss: 0.0187 | success: 0.84',
        ],
      },
      {
        name: 'Skill Discovery', abbr: 'SD', proficiency: 0.85,
        startDate: '2026',
        hoverLine: 'Skill 47/64 | coverage: 0.891 | diversity: 4.23',
        expandedLines: [
          '-- NDA: project details under agreement --',
          'Unsupervised skill learning, density-based rewards',
          'SAC (soft actor-critic) backbone',
          'Skill 45/64 | coverage: 0.874 | diversity: 4.18',
          'Skill 46/64 | coverage: 0.883 | diversity: 4.21',
          'Skill 47/64 | coverage: 0.891 | diversity: 4.23',
        ],
      },
      {
        name: 'HPC', abbr: 'HP', proficiency: 0.7,
        startDate: '2023',
        hoverLine: 'iter 100 | speedup: 1600x | gpu_util: 0.97',
        expandedLines: [
          'Batched K-Means, CUDA C & Python',
          'Massively parallel GPU compute',
          '1600x+ speedup vs scikit-learn',
          '10K+ reads on Towards Data Science',
        ],
      },
    ],
  },
];
