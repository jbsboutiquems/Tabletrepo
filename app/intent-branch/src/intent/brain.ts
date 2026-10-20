/**
 * LAYER 2 — BRAIN (diagnostic engine)
 * ===================================
 * Local logic over the last 7 days of entries (+ snapshots + weekly debrief).
 *
 * Pattern detectors: streaks, avoidance, mood drift, energy, social.
 * Recommendation engine picks ONE next action from Off*Script content —
 * never generic advice, never invented on the spot.
 *
 * ALL LOCAL, ZERO COST PER CALL. Pure functions: no network, no storage I/O,
 * no Gemini. The caller supplies the entries; the brain only thinks.
 */

import type { DailyEntry, PersonalitySnapshot } from '../types';
import { computeStreak } from '../lib/streaks';

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

export type PatternKind = 'streak' | 'avoidance' | 'mood-drift' | 'energy' | 'social';
export type Severity = 'info' | 'watch' | 'alert';

export interface Pattern {
  kind: PatternKind;
  label: string;
  detail: string;
  severity: Severity;
  /** Short, human-readable receipts — dates, counts, quotes. */
  evidence: string[];
}

export interface BrainReport {
  daysAnalyzed: number;
  dateRange: { from: string; to: string } | null;
  patterns: Pattern[];
  /** One-line read of the week — the diagnose seed for the Face. */
  headline: string;
}

/**
 * One actionable item from the Off*Script content library (Layer 4 owns the
 * real catalog). The brain never invents advice — it only selects.
 */
export interface ContentAction {
  id: string;
  title: string;
  detail?: string;
  dare?: boolean;
  /** Which pattern kinds this action answers. */
  answers: PatternKind[];
}

export interface DiagnoseOptions {
  /** YYYY-MM-DD. Defaults to today (local). Pass explicitly in tests. */
  today?: string;
  snapshots?: PersonalitySnapshot[];
  weeklyDebrief?: string;
}

/* ------------------------------------------------------------------ */
/* Main entry point                                                     */
/* ------------------------------------------------------------------ */

export function diagnoseWeek(entries: DailyEntry[], opts: DiagnoseOptions = {}): BrainReport {
  const today = opts.today ?? toDayStr(new Date());
  const sorted = [...entries]
    .filter((e) => e.entry_date <= today)
    .sort((a, b) => (a.entry_date < b.entry_date ? 1 : -1))
    .slice(0, 7);

  const patterns: Pattern[] = [];
  const streak = detectStreak(sorted, today);
  if (streak) patterns.push(streak);
  const avoidance = detectAvoidance(sorted, opts.weeklyDebrief);
  if (avoidance) patterns.push(avoidance);
  const drift = detectMoodDrift(sorted);
  if (drift) patterns.push(drift);
  const energy = detectEnergy(sorted, opts.snapshots);
  if (energy) patterns.push(energy);
  const social = detectSocial(sorted);
  if (social) patterns.push(social);

  // Highest severity first, then a stable kind order — deterministic.
  const rank: Record<Severity, number> = { alert: 0, watch: 1, info: 2 };
  patterns.sort((a, b) => rank[a.severity] - rank[b.severity]);

  return {
    daysAnalyzed: sorted.length,
    dateRange:
      sorted.length > 0
        ? { from: sorted[sorted.length - 1].entry_date, to: sorted[0].entry_date }
        : null,
    patterns,
    headline: makeHeadline(patterns, sorted.length),
  };
}

/* ------------------------------------------------------------------ */
/* Recommendation engine — ONE action, from the catalog, never invented  */
/* ------------------------------------------------------------------ */

const SEVERITY_WEIGHT: Record<Severity, number> = { alert: 3, watch: 2, info: 1 };

/**
 * Pick the single best action for this report. Scores each catalog item by
 * how many active patterns it answers, weighted by severity. Deterministic:
 * ties break by catalog order. Returns null when the catalog is empty —
 * the brain refuses to invent generic advice; the caller (Layer 4/5) owns
 * the fallback.
 */
export function recommendOneAction(
  report: BrainReport,
  catalog: ContentAction[],
): ContentAction | null {
  if (catalog.length === 0) return null;
  let best: ContentAction | null = null;
  let bestScore = -1;
  for (const action of catalog) {
    let score = 0;
    for (const p of report.patterns) {
      if (action.answers.includes(p.kind)) score += SEVERITY_WEIGHT[p.severity];
    }
    if (score > bestScore) {
      bestScore = score;
      best = action;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Detectors                                                            */
/* ------------------------------------------------------------------ */

/** Streaks: entry streak + micro-dare completion streak. */
function detectStreak(entries: DailyEntry[], today: string): Pattern | null {
  if (entries.length === 0) return null;
  const dates = entries.map((e) => e.entry_date);
  const entryStreak = computeStreak(dates, today);

  const dareDates = entries.filter((e) => e.micro_dare_completed).map((e) => e.entry_date);
  const dareStreak = computeStreak(dareDates, today);

  const evidence = [`${entryStreak}-day logging streak`, `${dareStreak}-day dare streak`];
  if (entryStreak >= 5) {
    return {
      kind: 'streak',
      label: `${entryStreak} days of showing up`,
      detail: 'The streak is alive. Protect it like a feral pet — feed it daily, never chase it.',
      severity: 'info',
      evidence,
    };
  }
  if (entryStreak === 0) {
    return {
      kind: 'streak',
      label: 'Streak is at zero',
      detail: 'No entries in the window. The legend restarts with one honest line today.',
      severity: 'watch',
      evidence,
    };
  }
  return {
    kind: 'streak',
    label: `${entryStreak}-day streak building`,
    detail: 'Early days. Momentum counts more than perfection.',
    severity: 'info',
    evidence,
  };
}

/** Avoidance: blank notes + skipped check-ins + dodged dares. */
function detectAvoidance(entries: DailyEntry[], weeklyDebrief?: string): Pattern | null {
  if (entries.length === 0) return null;
  const blankDays = entries.filter(
    (e) => !e.evening_notes.trim() && !e.midday_checkin.trim(),
  );
  const dodgedDares = entries.filter((e) => !e.micro_dare_completed).length;

  const debriefDodges = weeklyDebrief
    ? (weeklyDebrief.match(/\b(skip|skipped|avoid|avoided|didn'?t|missed|blew off)\b/gi) || []).length
    : 0;

  const evidence: string[] = [];
  if (blankDays.length > 0)
    evidence.push(`${blankDays.length} blank day(s): ${blankDays.map((e) => e.entry_date).join(', ')}`);
  if (dodgedDares >= 3) evidence.push(`${dodgedDares} dares left undone`);
  if (debriefDodges >= 3) evidence.push(`debrief mentions dodging ${debriefDodges}×`);

  const score = blankDays.length + (dodgedDares >= 3 ? 1 : 0) + (debriefDodges >= 3 ? 1 : 0);
  if (blankDays.length >= 3 || score >= 4) {
    return {
      kind: 'avoidance',
      label: 'Avoidance pattern',
      detail: 'Blank pages are data too — the diary is being dodged, not forgotten.',
      severity: 'alert',
      evidence,
    };
  }
  if (score >= 2) {
    return {
      kind: 'avoidance',
      label: 'Avoidance flickers',
      detail: 'A few skipped check-ins. Not a pattern yet — just a draft of one.',
      severity: 'watch',
      evidence,
    };
  }
  return null;
}

/** Mood drift: slope of khaos_score over the window. */
function detectMoodDrift(entries: DailyEntry[]): Pattern | null {
  const scored = entries.filter((e) => Number.isFinite(e.khaos_score)).reverse(); // oldest → newest
  if (scored.length < 3) return null;
  const n = scored.length;
  const xs = scored.map((_, i) => i);
  const ys = scored.map((e) => e.khaos_score);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  const num = xs.reduce((a, x, i) => a + (x - meanX) * (ys[i] - meanY), 0);
  const den = xs.reduce((a, x) => a + (x - meanX) ** 2, 0);
  const slope = den === 0 ? 0 : num / den; // khaos points per day

  const evidence = [
    `khaos scores: ${ys.join(' → ')}`,
    `trend ${slope >= 0 ? '+' : ''}${slope.toFixed(2)}/day`,
  ];
  if (slope <= -0.5) {
    return {
      kind: 'mood-drift',
      label: 'Mood sliding down',
      detail: 'Khaos scores are dropping day over day. Not a verdict — an early warning.',
      severity: 'alert',
      evidence,
    };
  }
  if (slope <= -0.25) {
    return {
      kind: 'mood-drift',
      label: 'Mood softening',
      detail: 'A gentle downward slope. Worth noticing before it becomes a slide.',
      severity: 'watch',
      evidence,
    };
  }
  if (slope >= 0.5) {
    return {
      kind: 'mood-drift',
      label: 'Mood climbing',
      detail: 'Scores trending up. Whatever changed — do more of that.',
      severity: 'info',
      evidence,
    };
  }
  return null;
}

type EnergyBucket = 'wired' | 'flat' | 'steady';

const WIRED_RE = /\b(wired|racing|anxious|buzzing|manic|can'?t sleep|restless|spiraling|overdrive)\b/i;
const FLAT_RE = /\b(numb|meh|flat|drained|empty|foggy|zombie|checked out|blah)\b/i;

/** Energy: wired / flat / steady from scores + language. */
function detectEnergy(entries: DailyEntry[], snapshots?: PersonalitySnapshot[]): Pattern | null {
  if (entries.length === 0) return null;
  const buckets: EnergyBucket[] = entries.map((e) => {
    const text = `${e.today_i_am} ${e.midday_checkin} ${e.evening_notes}`;
    if (e.khaos_score >= 8 || WIRED_RE.test(text)) return 'wired';
    if (e.khaos_score <= 3 || FLAT_RE.test(text)) return 'flat';
    return 'steady';
  });
  const count = (b: EnergyBucket) => buckets.filter((x) => x === b).length;
  const evidence = [
    `wired ${count('wired')}d · flat ${count('flat')}d · steady ${count('steady')}d`,
  ];

  const latest = snapshots?.[0];
  if (latest && (latest.burnout_risk === 'High' || latest.burnout_risk === 'Critical')) {
    evidence.push(`latest diagnostic flags burnout: ${latest.burnout_risk}`);
    return {
      kind: 'energy',
      label: `Burnout flag (${latest.burnout_risk})`,
      detail: 'The diagnostic engine already called it. The diary agrees or not — the flag stands.',
      severity: latest.burnout_risk === 'Critical' ? 'alert' : 'watch',
      evidence,
    };
  }

  if (count('flat') >= 4) {
    return {
      kind: 'energy',
      label: 'Running on fumes',
      detail: 'Most days read flat. This is a battery problem, not a motivation problem.',
      severity: 'alert',
      evidence,
    };
  }
  if (count('wired') >= 4) {
    return {
      kind: 'energy',
      label: 'Running hot',
      detail: 'Most days read wired. Speed is not the same as aliveness.',
      severity: 'watch',
      evidence,
    };
  }
  if (count('steady') >= 5) {
    return {
      kind: 'energy',
      label: 'Steady current',
      detail: 'Energy is holding. Boring? No — sustainable.',
      severity: 'info',
      evidence,
    };
  }
  return null;
}

const SOCIAL_RE =
  /\b(we|us|our|ours|friend|friends|family|mom|dad|partner|date|party|dinner with|called|texted|met up|crew|squad|neighbor)\b/i;

/** Social: connection vs. solo stretch from the week's language. */
function detectSocial(entries: DailyEntry[]): Pattern | null {
  if (entries.length === 0) return null;
  const refsPerDay = entries.map((e) => {
    const text = `${e.evening_notes} ${e.midday_checkin}`;
    const m = text.match(new RegExp(SOCIAL_RE.source, 'gi'));
    return m ? m.length : 0;
  });
  const silentDays = refsPerDay.filter((n) => n === 0).length;
  const loudDays = refsPerDay.filter((n) => n >= 2).length;

  if (silentDays >= 5) {
    return {
      kind: 'social',
      label: 'Solo stretch',
      detail: 'Almost no people in the week\'s pages. Solitude is fuel until it isn\'t.',
      severity: 'watch',
      evidence: [`${silentDays}/${entries.length} days mention no people`],
    };
  }
  if (loudDays >= 3) {
    return {
      kind: 'social',
      label: 'Social surge',
      detail: 'People everywhere this week. Connection is doing its quiet work.',
      severity: 'info',
      evidence: [`${loudDays} high-contact days`],
    };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* internals                                                            */
/* ------------------------------------------------------------------ */

function makeHeadline(patterns: Pattern[], days: number): string {
  if (days === 0) return 'No entries this week — the diary is a blank page, which is also data.';
  const top = patterns[0];
  if (!top) return 'Steady week. Nothing screaming, nothing numb.';
  switch (top.severity) {
    case 'alert':
      return `${top.label} — worth one honest look today.`;
    case 'watch':
      return `${top.label}. Not urgent, not nothing.`;
    default:
      return top.label;
  }
}

function toDayStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
