/**
 * Per-category card DOM builders.
 * Each builder creates a distinct visual for its domain theme.
 */
import type { SkillItem, CategoryTheme } from './skillsData';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

type CardBuilder = (skill: SkillItem) => HTMLElement;

const builders: Record<CategoryTheme, CardBuilder> = {
  terminal: buildTerminalCard,
  register: buildRegisterCard,
  training: buildTrainingCard,
  plain: buildPlainCard,
};

export function buildSkillCard(skill: SkillItem, theme: CategoryTheme): HTMLElement {
  return builders[theme](skill);
}

// ---------------------------------------------------------------------------
// Terminal card (Languages)
// ---------------------------------------------------------------------------

function buildTerminalCard(skill: SkillItem): HTMLElement {
  const card = document.createElement('div');
  card.className = 'skill-card skill-card--terminal';

  // Prompt
  const prompt = document.createElement('span');
  prompt.className = 'skill-prompt';
  prompt.textContent = '$ ';
  card.appendChild(prompt);

  // Typed name (filled by typewriter in overlay — includes years)
  const typedName = document.createElement('span');
  typedName.className = 'skill-typed-name';
  typedName.textContent = '';
  card.appendChild(typedName);

  // Proficiency label + meter: Proficiency: [████████░░]
  const profLabel = document.createElement('span');
  profLabel.className = 'skill-proficiency-label';
  profLabel.textContent = 'Proficiency:';
  card.appendChild(profLabel);

  const meter = document.createElement('span');
  meter.className = 'skill-meter--terminal';
  const filled = Math.round(skill.proficiency * 10);
  meter.textContent = '[' + '\u2588'.repeat(filled) + '\u2591'.repeat(10 - filled) + ']';
  card.appendChild(meter);

  // Expand area (click-to-open)
  card.appendChild(buildExpandArea(skill));

  return card;
}

// ---------------------------------------------------------------------------
// Register card (Embedded & Robotics)
// ---------------------------------------------------------------------------

function buildRegisterCard(skill: SkillItem): HTMLElement {
  const card = document.createElement('div');
  card.className = 'skill-card skill-card--register';

  // Name (actual skill name)
  const regName = document.createElement('span');
  regName.className = 'skill-register-name';
  regName.textContent = skill.name;
  card.appendChild(regName);

  // Date (hex-encoded date when skill was picked up)
  const addr = document.createElement('span');
  addr.className = 'skill-register-addr';
  addr.textContent = skill.regAddr ?? '0x00000000';
  card.appendChild(addr);

  // Proficiency as a plain number (same styling as the rest of the register text)
  const prof = document.createElement('span');
  prof.className = 'skill-register-prof';
  prof.textContent = `${Math.round(skill.proficiency * 100)}%`;
  card.appendChild(prof);

  // Expand area
  card.appendChild(buildExpandArea(skill));

  return card;
}

/**
 * Creates the register table header row (Addr | Section | RegName | Bits).
 * Inserted once above the cards in the embedded accordion.
 */
export function buildRegisterHeader(): HTMLElement {
  const row = document.createElement('div');
  row.className = 'skill-register-header-row';

  const cols = ['Name', 'Date', 'Proficiency'];
  for (const col of cols) {
    const span = document.createElement('span');
    span.className = 'skill-register-header-col';
    span.textContent = col;
    row.appendChild(span);
  }
  return row;
}

// ---------------------------------------------------------------------------
// Training card (AI)
// ---------------------------------------------------------------------------

function buildTrainingCard(skill: SkillItem): HTMLElement {
  const card = document.createElement('div');
  card.className = 'skill-card skill-card--training';
  card.dataset.skill = skill.abbr.toLowerCase();

  // Skill name (left side)
  const name = document.createElement('span');
  name.className = 'skill-name';
  name.textContent = skill.name;
  card.appendChild(name);

  // Training metric line (right side)
  const metric = document.createElement('span');
  metric.className = 'skill-training-metric';
  const prof = skill.proficiency.toFixed(2);
  const loss = (1 - skill.proficiency).toFixed(4);
  const date = skill.startDate ?? '01/01/2020';
  metric.textContent = `Date: ${date} | loss: ${loss} | proficiency: ${prof}`;
  // Store final values for count-up animation
  metric.dataset.date = date;
  metric.dataset.loss = loss;
  metric.dataset.prof = prof;
  card.appendChild(metric);

  // Expand area
  card.appendChild(buildExpandArea(skill));

  return card;
}

// ---------------------------------------------------------------------------
// Plain card (Robotics & Sim) — static text, no animation
// ---------------------------------------------------------------------------

function buildPlainCard(skill: SkillItem): HTMLElement {
  const card = document.createElement('div');
  card.className = 'skill-card skill-card--plain';

  // Skill name (left) — no meter, no hover/typewriter flourishes
  const name = document.createElement('span');
  name.className = 'skill-name';
  name.textContent = skill.name;
  card.appendChild(name);

  // Static metric (right): date + proficiency, no animation
  const metric = document.createElement('span');
  metric.className = 'skill-plain-metric';
  const prof = skill.proficiency.toFixed(2);
  metric.textContent = skill.startDate
    ? `Date: ${skill.startDate} | proficiency: ${prof}`
    : `proficiency: ${prof}`;
  card.appendChild(metric);

  // Expand area (click-to-open)
  card.appendChild(buildExpandArea(skill));

  return card;
}

// ---------------------------------------------------------------------------
// Shared: expand area
// ---------------------------------------------------------------------------

function buildExpandArea(skill: SkillItem): HTMLElement {
  const expand = document.createElement('div');
  expand.className = 'skill-expand';

  for (const line of skill.expandedLines) {
    const lineEl = document.createElement('div');
    lineEl.className = 'skill-expand-line';
    lineEl.textContent = line;
    expand.appendChild(lineEl);
  }

  return expand;
}
