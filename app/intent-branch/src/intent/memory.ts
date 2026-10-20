/**
 * LAYER 3 — MEMORY (user model)
 * ==============================
 * Per-user profile: entries, patterns, buddy, preferences.
 * Rolling summaries: 7-day, weekly debrief, monthly. Token-bounded.
 *
 * PRIVACY CONTRACT (hard):
 * - The user model stays on OUR server / device. It is never sent to Google.
 * - The ONLY path to Gemini is Layer 5, which requires explicit per-user
 *   consent (see services/aiConsent.ts) AND strips the model to the minimum
 *   payload via toEnginePayload().
 * - summarize() is extractive and local — zero cost, zero network.
 */

import type { BuddyProfile } from '../buddy';
import type { DailyEntry } from '../types';
import type { BrainReport, Pattern } from './brain';

/* ------------------------------------------------------------------ */
/* Token budget                                                         */
/* ------------------------------------------------------------------ */

/** Rough estimate: ~4 chars per token. Used to keep summaries bounded. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Hard caps per summary kind — the model can never bloat past these. */
export const SUMMARY_TOKEN_BUDGET = {
  '7-day': 400,
  weekly: 800,
  monthly: 1500,
} as const;

export type SummaryKind = keyof typeof SUMMARY_TOKEN_BUDGET;

const TRUNCATION_MARKER = '\n…(truncated to token budget)';

function truncateToTokens(text: string, maxTokens: number): { text: string; truncated: boolean } {
  if (estimateTokens(text) <= maxTokens) return { text, truncated: false };
  const reserve = estimateTokens(TRUNCATION_MARKER);
  const maxChars = Math.max(0, (maxTokens - reserve) * 4);
  const cut = text.slice(0, maxChars);
  const lastBreak = Math.max(cut.lastIndexOf('\n'), cut.lastIndexOf('. '));
  const trimmed = (lastBreak > maxChars * 0.6 ? cut.slice(0, lastBreak + 1) : cut).trimEnd();
  return { text: trimmed + TRUNCATION_MARKER, truncated: true };
}

/* ------------------------------------------------------------------ */
/* Profile                                                              */
/* ------------------------------------------------------------------ */

export type DareIntensity = 'gentle' | 'spicy' | 'feral';

export interface UserPreferences {
  /** How provocative the micro-dares get. */
  dareIntensity: DareIntensity;
  /** The Intent stays quiet during these hours (local HH:MM). */
  quietHours?: { start: string; end: string };
  /** User's word of the year, if set. */
  wordOfYear?: string;
  /** What they're done pretending about — identity anchor. */
  donePretending?: string;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  dareIntensity: 'spicy',
};

/* ------------------------------------------------------------------ */
/* Rolling summaries                                                    */
/* ------------------------------------------------------------------ */

export interface RollingSummary {
  kind: SummaryKind;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string; // YYYY-MM-DD
  text: string;
  tokens: number;
  truncated: boolean;
  updatedAt: string; // ISO
}

function stamp(kind: SummaryKind, from: string, to: string, text: string): RollingSummary {
  const budget = SUMMARY_TOKEN_BUDGET[kind];
  const { text: bounded, truncated } = truncateToTokens(text, budget);
  return {
    kind,
    periodStart: from,
    periodEnd: to,
    text: bounded,
    tokens: estimateTokens(bounded),
    truncated,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * 7-day rolling summary — extractive, from the brain report + entries.
 * This is what the Face reads before speaking; it never sees raw entries
 * unless the user opens them.
 */
export function buildSevenDaySummary(entries: DailyEntry[], report: BrainReport): RollingSummary {
  const from = report.dateRange?.from ?? '';
  const to = report.dateRange?.to ?? '';
  const scores = entries.filter((e) => Number.isFinite(e.khaos_score)).map((e) => e.khaos_score);
  const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '—';
  const dares = entries.filter((e) => e.micro_dare_completed).length;

  const lines = [
    `7-day window ${from} → ${to} (${report.daysAnalyzed} entries logged).`,
    `Headline: ${report.headline}`,
    `Avg khaos score: ${avg}. Micro-dares completed: ${dares}/${entries.length}.`,
    ...report.patterns.map(
      (p) => `Pattern [${p.severity}] ${p.label}: ${p.detail} (${p.evidence.join('; ')})`,
    ),
  ];
  return stamp('7-day', from, to, lines.join('\n'));
}

/**
 * Weekly debrief summary — the structured end-of-week digest.
 * Feeds the planner's "WEEKLY FLIGHT DEBRIEF" and next week's brain.
 */
export function buildWeeklyDebrief(
  weekStart: string,
  weekEnd: string,
  report: BrainReport,
  userNote?: string,
): RollingSummary {
  const alerts = report.patterns.filter((p) => p.severity === 'alert');
  const lines = [
    `Week ${weekStart} → ${weekEnd} debrief.`,
    `Headline: ${report.headline}`,
    alerts.length
      ? `Flags needing attention: ${alerts.map((a) => a.label).join('; ')}.`
      : 'No red flags. The week held.',
    ...report.patterns.map((p) => `- [${p.severity}] ${p.kind}: ${p.label} — ${p.detail}`),
  ];
  if (userNote?.trim()) lines.push(`User's own words: ${userNote.trim()}`);
  lines.push('Carry-forward: the top watch/alert above becomes next week\'s first check.');
  return stamp('weekly', weekStart, weekEnd, lines.join('\n'));
}

/**
 * Monthly summary — rolls up weekly debriefs. Extractive only.
 */
export function buildMonthlySummary(
  monthLabel: string,
  weeklies: RollingSummary[],
): RollingSummary {
  const from = weeklies[0]?.periodStart ?? '';
  const to = weeklies[weeklies.length - 1]?.periodEnd ?? '';
  const lines = [
    `${monthLabel}: ${weeklies.length} weekly debriefs rolled up.`,
    ...weeklies.map((w) => `Week ${w.periodStart}→${w.periodEnd}: ${w.text.split('\n')[1] ?? ''}`),
  ];
  return stamp('monthly', from, to, lines.join('\n'));
}

/* ------------------------------------------------------------------ */
/* The user model                                                       */
/* ------------------------------------------------------------------ */

export interface UserModel {
  userId: string;
  buddy: Pick<BuddyProfile, 'creatureId' | 'name' | 'color'> | null;
  preferences: UserPreferences;
  /** Recent patterns, newest first — capped so the model stays small. */
  recentPatterns: Pattern[];
  summaries: {
    sevenDay: RollingSummary | null;
    weekly: RollingSummary | null;
    monthly: RollingSummary | null;
  };
  updatedAt: string;
}

export const MAX_RECENT_PATTERNS = 20;

export function createUserModel(userId: string): UserModel {
  return {
    userId,
    buddy: null,
    preferences: { ...DEFAULT_PREFERENCES },
    recentPatterns: [],
    summaries: { sevenDay: null, weekly: null, monthly: null },
    updatedAt: new Date().toISOString(),
  };
}

/** Fold a fresh brain report into the model (patterns capped, summaries refreshed). */
export function updateModelWithReport(
  model: UserModel,
  entries: DailyEntry[],
  report: BrainReport,
): UserModel {
  const merged = [...report.patterns, ...model.recentPatterns].slice(0, MAX_RECENT_PATTERNS);
  return {
    ...model,
    recentPatterns: merged,
    summaries: {
      ...model.summaries,
      sevenDay: buildSevenDaySummary(entries, report),
    },
    updatedAt: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* Consent gate — the ONLY door to any external engine                  */
/* ------------------------------------------------------------------ */

export type EngineConsent = 'unknown' | 'granted' | 'declined';

/**
 * Minimal payload an external engine may receive — and ONLY when consent
 * is 'granted'. Raw entries never leave; only the bounded summary +
 * non-identifying preferences travel.
 */
export interface EnginePayload {
  summary7d: string;
  dareIntensity: DareIntensity;
  wordOfYear?: string;
  buddyName?: string;
}

/**
 * Returns the shareable payload, or null when consent is anything other
 * than 'granted'. Call this at every Layer 5 boundary — no exceptions.
 */
export function toEnginePayload(model: UserModel, consent: EngineConsent): EnginePayload | null {
  if (consent !== 'granted') return null;
  return {
    summary7d: model.summaries.sevenDay?.text ?? 'No recent summary.',
    dareIntensity: model.preferences.dareIntensity,
    wordOfYear: model.preferences.wordOfYear,
    buddyName: model.buddy?.name,
  };
}
