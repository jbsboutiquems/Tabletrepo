/**
 * LAYER 4 — KNOWLEDGE (content library)
 * =====================================
 * Off*Script philosophy, planner content, holiday explainers, growth
 * frameworks, challenges, anti-goals — structured so answers come from
 * HER system, not generic self-help.
 *
 * This is the catalog the Brain (Layer 2) selects from: every actionable
 * item declares which pattern kinds it answers. Nothing here is generic —
 * if it could appear in a airport bookstore, it doesn't belong.
 */

import type { PatternKind } from './brain';
import type { ContentAction } from './brain';
import type { DareIntensity } from './memory';
import { INTENT_PHILOSOPHY, INTENT_SLOGAN, INTENT_MOTTO } from './face';
import { MORNING_MANTRAS } from '../data/mantras';
import { CORE_HOLIDAYS } from '../data/holidays';

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

export type KnowledgeKind =
  | 'philosophy'
  | 'micro-dare'
  | 'challenge'
  | 'framework'
  | 'holiday'
  | 'anti-goal'
  | 'mantra';

export interface KnowledgeItem {
  id: string;
  kind: KnowledgeKind;
  title: string;
  /** The content itself — voice-checked, Off*Script-native. */
  body: string;
  /** Which brain pattern kinds this item answers. */
  answers: PatternKind[];
  intensity?: DareIntensity;
  tags: string[];
}

/* ------------------------------------------------------------------ */
/* Philosophy — the five tenets as explainers                           */
/* ------------------------------------------------------------------ */

const PHILOSOPHY: KnowledgeItem[] = [
  {
    id: 'phil-khaos',
    kind: 'philosophy',
    title: 'Khaos is not disorder',
    body: `${INTENT_PHILOSOPHY.khaosNotDisorder} When the week feels messy, ask: is this disorder (the script running me) or Khaos (me running)? Only one of them needs fixing.`,
    answers: ['mood-drift', 'energy'],
    tags: ['khaos', 'philosophy', 'reframe'],
  },
  {
    id: 'phil-boredom',
    kind: 'philosophy',
    title: INTENT_SLOGAN,
    body: `${INTENT_PHILOSOPHY.monotonyIsDeath} If your days are interchangeable, that is the emergency — not the missed deadline.`,
    answers: ['avoidance', 'energy', 'streak'],
    tags: ['boredom', 'slogan', 'philosophy'],
  },
  {
    id: 'phil-values',
    kind: 'philosophy',
    title: 'Values before performance',
    body: `${INTENT_PHILOSOPHY.valuesBeforePerformance} A 4/10 week lived on-purpose beats a 9/10 week lived on-autopilot.`,
    answers: ['mood-drift', 'streak'],
    tags: ['values', 'philosophy', 'performance'],
  },
  {
    id: 'phil-identity',
    kind: 'philosophy',
    title: 'Identity evolves',
    body: `${INTENT_PHILOSOPHY.identityEvolves} The Intent will sometimes quote last month's you back at you. That's not a gotcha — it's a growth receipt.`,
    answers: ['mood-drift', 'social'],
    tags: ['identity', 'philosophy', 'growth'],
  },
  {
    id: 'phil-year',
    kind: 'philosophy',
    title: 'One year at a time',
    body: `${INTENT_PHILOSOPHY.oneYearAtATime} ${INTENT_MOTTO}`,
    answers: ['avoidance', 'streak'],
    tags: ['year', 'philosophy', 'motto'],
  },
];

/* ------------------------------------------------------------------ */
/* Micro-dares — single concrete rebellions                             */
/* ------------------------------------------------------------------ */

const MICRO_DARES: KnowledgeItem[] = [
  {
    id: 'dare-wrong-street',
    kind: 'micro-dare',
    title: 'Walk a street you never walk',
    body: 'Leave 15 minutes early and take the wrong turn on purpose. Notice three things. That\'s the whole dare.',
    answers: ['avoidance', 'energy', 'mood-drift'],
    intensity: 'gentle',
    tags: ['outside', 'novelty', 'attention'],
  },
  {
    id: 'dare-real-text',
    kind: 'micro-dare',
    title: 'Text one human a real sentence',
    body: 'Not "we should hang out sometime." One true sentence about your actual week. Send it before you can edit it into politeness.',
    answers: ['social', 'avoidance'],
    intensity: 'spicy',
    tags: ['connection', 'honesty'],
  },
  {
    id: 'dare-phone-exile',
    kind: 'micro-dare',
    title: 'Phone in another room by 10pm',
    body: 'The scroll is not rest; it\'s anesthesia. Exile the phone. Let the evening be boring enough to feel.',
    answers: ['energy', 'mood-drift'],
    intensity: 'spicy',
    tags: ['rest', 'boundaries', 'sleep'],
  },
  {
    id: 'dare-crooked-ship',
    kind: 'micro-dare',
    title: 'Ship the crooked version',
    body: 'That draft you\'ve been polishing into oblivion? Send the crooked version today. Perfectionism is cowardice in a spreadsheet.',
    answers: ['avoidance', 'streak'],
    intensity: 'spicy',
    tags: ['perfectionism', 'shipping', 'work'],
  },
  {
    id: 'dare-say-no',
    kind: 'micro-dare',
    title: 'Decline one thing with no essay',
    body: '"Can\'t make it." Full sentence. No apology paragraph, no replacement offer. Watch the world not end.',
    answers: ['energy', 'social'],
    intensity: 'feral',
    tags: ['boundaries', 'no', 'people-pleasing'],
  },
  {
    id: 'dare-opposite-order',
    kind: 'micro-dare',
    title: 'Do the day backwards once',
    body: 'Evening routine in the morning, or dessert first. Break one sequence to prove the sequence was optional.',
    answers: ['energy', 'mood-drift', 'streak'],
    intensity: 'gentle',
    tags: ['novelty', 'routine', 'play'],
  },
  {
    id: 'dare-rant-loud',
    kind: 'micro-dare',
    title: 'Rant out loud for 90 seconds',
    body: 'Set a timer. Say the unsayable thing to an empty room at full volume. Then write down the one true sentence hiding inside it.',
    answers: ['avoidance', 'mood-drift'],
    intensity: 'spicy',
    tags: ['honesty', 'release', 'rant'],
  },
  {
    id: 'dare-stranger-compliment',
    kind: 'micro-dare',
    title: 'Compliment a stranger specifically',
    body: 'Not "nice shirt." Something you actually noticed. Specificity is the dare — generic praise is cowardice.',
    answers: ['social', 'energy'],
    intensity: 'feral',
    tags: ['connection', 'courage', 'attention'],
  },
  {
    id: 'dare-paper-day',
    kind: 'micro-dare',
    title: 'One hour, paper only',
    body: 'No screens for one hour. Paper, pen, your actual handwriting. Relearn what your thoughts sound like without an audience.',
    answers: ['energy', 'avoidance'],
    intensity: 'gentle',
    tags: ['attention', 'rest', 'analog'],
  },
  {
    id: 'dare-ask-dumb',
    kind: 'micro-dare',
    title: 'Ask the "dumb" question',
    body: 'In the meeting, the group chat, wherever — ask the thing everyone\'s pretending to understand. Somebody will silently thank you.',
    answers: ['social', 'avoidance'],
    intensity: 'spicy',
    tags: ['courage', 'honesty', 'work'],
  },
];

/* ------------------------------------------------------------------ */
/* Challenges — multi-day arcs                                          */
/* ------------------------------------------------------------------ */

const CHALLENGES: KnowledgeItem[] = [
  {
    id: 'chal-7d-first',
    kind: 'challenge',
    title: '7 Days of Do-First',
    body: 'One tiny action before 9am every day for a week — before planning, before coffee-theory, before thinking. Action first, analysis later. Log what changed.',
    answers: ['avoidance', 'streak', 'mood-drift'],
    intensity: 'spicy',
    tags: ['do-first', 'week', 'momentum'],
  },
  {
    id: 'chal-no-polish',
    kind: 'challenge',
    title: '3 Days of No Polish',
    body: 'For three days, everything you share goes out unpolished: the typo stays, the rough edge stays. Notice how little breaks.',
    answers: ['avoidance', 'energy'],
    intensity: 'feral',
    tags: ['perfectionism', 'shipping'],
  },
  {
    id: 'chal-people-week',
    kind: 'challenge',
    title: 'One Human Per Day',
    body: 'Seven days, seven real contacts — a call, a walk, a long text. Not networking. Witnessing and being witnessed.',
    answers: ['social'],
    intensity: 'spicy',
    tags: ['connection', 'week'],
  },
];

/* ------------------------------------------------------------------ */
/* Frameworks — reusable lenses                                         */
/* ------------------------------------------------------------------ */

const FRAMEWORKS: KnowledgeItem[] = [
  {
    id: 'fw-do-first',
    kind: 'framework',
    title: 'The Do-First Inversion',
    body: 'Think-first self-help says: understand, then act. Off*Script inverts it: act tiny, then understand. A 5-minute experiment teaches more than a 5-hour plan. When stuck, shrink the action until it\'s laughable — then do the laughable thing.',
    answers: ['avoidance', 'mood-drift'],
    tags: ['do-first', 'action', 'stuck'],
  },
  {
    id: 'fw-honest-mirror',
    kind: 'framework',
    title: 'The Honest Mirror',
    body: 'Read your own week like a detective, not a defendant. What did you say vs. what did you do? The gap isn\'t guilt — it\'s the map.',
    answers: ['mood-drift', 'energy', 'avoidance'],
    tags: ['reflection', 'honesty'],
  },
  {
    id: 'fw-battery-not-motor',
    kind: 'framework',
    title: 'Battery, Not Motor',
    body: 'Flat weeks are battery problems, not motivation problems. You don\'t fix a dead battery by yelling at the car. Rest, novelty, and one small win recharge; lectures drain.',
    answers: ['energy'],
    tags: ['rest', 'energy', 'burnout'],
  },
  {
    id: 'fw-one-khaos-year',
    kind: 'framework',
    title: 'One Khaos Year',
    body: 'You don\'t need a five-year plan; you need one fully-lived year. Pick the year\'s word, live it messily, review honestly. Identity is revised annually.',
    answers: ['streak', 'avoidance'],
    tags: ['year', 'identity', 'planning'],
  },
];

/* ------------------------------------------------------------------ */
/* Anti-goals — things an Off*Script human refuses                      */
/* ------------------------------------------------------------------ */

const ANTI_GOALS: KnowledgeItem[] = [
  {
    id: 'ag-optimize-mornings',
    kind: 'anti-goal',
    title: 'I will not turn my mornings into a performance',
    body: 'Mornings are for living, not for winning. No routine-as-identity, no dawn-patrol cosplay. Coffee, light, one honest intention — done.',
    answers: ['energy'],
    tags: ['anti-goal', 'mornings'],
  },
  {
    id: 'ag-perform-rest',
    kind: 'anti-goal',
    title: 'I will not perform rest',
    body: 'Rest with a tracking ring and a recovery score is just work in pajamas. Real rest is unmeasured and slightly boring.',
    answers: ['energy', 'mood-drift'],
    tags: ['anti-goal', 'rest'],
  },
  {
    id: 'ag-earn-breaks',
    kind: 'anti-goal',
    title: 'I will not earn my breaks',
    body: 'Breaks are not wages for productivity. The walk happens because the sky exists, not because the inbox is empty.',
    answers: ['energy'],
    tags: ['anti-goal', 'rest', 'guilt'],
  },
  {
    id: 'ag-polish-first',
    kind: 'anti-goal',
    title: 'I will not polish before shipping',
    body: 'The crooked version out the door beats the perfect version in the drawer. Polish is procrastination in a nice outfit.',
    answers: ['avoidance', 'streak'],
    tags: ['anti-goal', 'perfectionism'],
  },
  {
    id: 'ag-explain-no',
    kind: 'anti-goal',
    title: 'I will not write essays to decline',
    body: '"No" is a complete sentence. The three-paragraph apology is people-pleasing with extra steps.',
    answers: ['social', 'energy'],
    tags: ['anti-goal', 'boundaries'],
  },
  {
    id: 'ag-compare-timelines',
    kind: 'anti-goal',
    title: 'I will not compare my timeline',
    body: 'Someone\'s highlight reel is not your deadline. One Khaos year at a time — theirs is not the reference implementation.',
    answers: ['mood-drift', 'social'],
    tags: ['anti-goal', 'comparison'],
  },
];

/* ------------------------------------------------------------------ */
/* Mantras + holidays — projected from the existing content library     */
/* ------------------------------------------------------------------ */

function mantraKnowledge(): KnowledgeItem[] {
  return MORNING_MANTRAS.map((m) => ({
    id: `mantra-${m.id}`,
    kind: 'mantra' as const,
    title: m.text,
    body: `Morning mantra [${m.attitude} · ${m.edgeLevel}] — ${m.contextTag}. Read it out loud. Mean at least half of it.`,
    answers: ['streak', 'energy', 'mood-drift'] as PatternKind[],
    tags: ['mantra', m.attitude.toLowerCase(), m.contextTag.toLowerCase()],
  }));
}

function holidayKnowledge(): KnowledgeItem[] {
  return Object.values(CORE_HOLIDAYS).map((h) => ({
    id: `holiday-${h.dateKey}`,
    kind: 'holiday' as const,
    title: h.title,
    body: `${h.tagline} ${h.meaning} Try: ${h.adventures[0] ?? ''}`,
    answers: ['energy', 'streak', 'avoidance'] as PatternKind[],
    tags: ['holiday', 'khaos-year', h.title.toLowerCase()],
  }));
}

/* ------------------------------------------------------------------ */
/* Public API                                                           */
/* ------------------------------------------------------------------ */

/** The full library — philosophy, dares, challenges, frameworks, anti-goals, mantras, holidays. */
export function getKnowledge(): KnowledgeItem[] {
  return [...PHILOSOPHY, ...MICRO_DARES, ...CHALLENGES, ...FRAMEWORKS, ...ANTI_GOALS, ...mantraKnowledge(), ...holidayKnowledge()];
}

/**
 * The Brain's catalog: every actionable item (dares, challenges, mantras)
 * as a ContentAction. This is what recommendOneAction() selects from —
 * Off*Script content only, never generic advice.
 */
export function buildBrainCatalog(maxIntensity: DareIntensity = 'feral'): ContentAction[] {
  const rank: Record<DareIntensity, number> = { gentle: 0, spicy: 1, feral: 2 };
  return getKnowledge()
    .filter((k) => k.kind === 'micro-dare' || k.kind === 'challenge' || k.kind === 'mantra')
    .filter((k) => rank[k.intensity ?? 'spicy'] <= rank[maxIntensity])
    .map((k) => ({
      id: k.id,
      title: k.title,
      detail: k.body,
      dare: k.kind !== 'mantra',
      answers: k.answers,
    }));
}

/** Keyword search over the library — for the Face, Layer 5 grounding, and UI. */
export function searchKnowledge(query: string, limit = 5): KnowledgeItem[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  const terms = q.split(/\s+/);
  const scored = getKnowledge().map((item) => {
    const hay = `${item.title} ${item.body} ${item.tags.join(' ')}`.toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (item.title.toLowerCase().includes(t)) score += 3;
      else if (hay.includes(t)) score += 1;
    }
    return { item, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.item);
}
