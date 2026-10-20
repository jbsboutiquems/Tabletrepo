/**
 * LAYER 5 — ENGINE (Gemini fallback)
 * ==================================
 * For what the local brain can't do: open-ended chat, media generation,
 * deep reasoning. Behind per-user consent toggles, server-side key only,
 * separate from The Intent.
 *
 * ROUTING POLICY — local first, Gemini only when needed or asked:
 *   diagnose / reflect / recommend  → ALWAYS local (Layers 2–4, zero cost)
 *   open-chat / media / deep-reasoning → Gemini, and ONLY with consent
 *   explicit user ask for Gemini → Gemini, and ONLY with consent
 *
 * HARD RULES:
 * - The Gemini API key lives server-side only. This file (and every client file)
 *   must never reference it — enforced by auditClientForSecrets().
 * - The Intent never sends user content to Google unless consent is
 *   'granted'. The payload is the bounded EnginePayload from Layer 3 —
 *   raw entries never leave the device/server.
 * - Every Gemini call speaks as The Intent via faceSystemPrompt() (Layer 1).
 *   Gemini is the engine behind the face, never the face itself.
 */

import { faceSystemPrompt } from './face';
import { toEnginePayload, type UserModel, type EngineConsent } from './memory';
import { AI_CONSENT_HEADER } from '../services/aiConsent';

export type EngineRequestKind =
  | 'diagnose'
  | 'reflect'
  | 'recommend'
  | 'open-chat'
  | 'media'
  | 'deep-reasoning';

export type EngineRoute = 'local' | 'gemini';

export interface RouteDecision {
  route: EngineRoute;
  /** Why — surfaced in debug/dev, never nagged at the user. */
  reason: string;
}

/**
 * Local-first router. Pure — no I/O, so the policy itself is unit-testable.
 */
export function routeRequest(
  kind: EngineRequestKind,
  opts: { explicitAsk?: boolean; consent: EngineConsent } = { consent: 'unknown' },
): RouteDecision {
  switch (kind) {
    case 'diagnose':
    case 'reflect':
    case 'recommend':
      return { route: 'local', reason: 'The local brain owns diagnostics — zero cost, no consent needed.' };
    case 'open-chat':
    case 'media':
    case 'deep-reasoning':
      if (opts.consent === 'granted')
        return { route: 'gemini', reason: 'Beyond local scope; consent granted.' };
      return {
        route: 'local',
        reason: 'Needs Gemini, but consent is not granted — staying local.',
      };
  }
}

/** Same router, honoring an explicit user ask for the Gemini layer. */
export function routeWithAsk(
  kind: EngineRequestKind,
  explicitAsk: boolean,
  consent: EngineConsent,
): RouteDecision {
  if (explicitAsk) {
    if (consent === 'granted')
      return { route: 'gemini', reason: 'User explicitly asked for the Gemini layer; consent granted.' };
    return { route: 'local', reason: 'User asked for Gemini, but consent is not granted — staying local.' };
  }
  return routeRequest(kind, { consent });
}

export interface IntentChatRequest {
  /** The user's open-ended message. */
  message: string;
  /** Bounded context — never raw entries. */
  context: string;
}

export interface IntentChatResult {
  reply: string;
  engine: 'gemini';
}

/**
 * Build the server-bound chat payload. Returns null unless consent is
 * granted — the caller must treat null as "stay local".
 */
export function buildIntentChatRequest(
  model: UserModel,
  consent: EngineConsent,
  message: string,
): IntentChatRequest | null {
  const payload = toEnginePayload(model, consent);
  if (!payload) return null;
  const context = [
    `7-day summary: ${payload.summary7d}`,
    `Dare intensity: ${payload.dareIntensity}`,
    payload.wordOfYear ? `Word of year: ${payload.wordOfYear}` : '',
    payload.buddyName ? `Buddy: ${payload.buddyName}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  return { message, context };
}

/**
 * Call the Gemini-backed Intent chat. Server holds the key; the client only
 * ever talks to OUR endpoint. Throws on consent problems or server errors —
 * the caller falls back to the local brain.
 */
export async function callIntentChat(
  apiUrl: (path: string) => string,
  req: IntentChatRequest,
  buddyName?: string,
): Promise<IntentChatResult> {
  const res = await fetch(apiUrl('/api/intent/chat'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [AI_CONSENT_HEADER]: 'granted',
    },
    body: JSON.stringify({
      message: req.message,
      context: req.context,
      buddyName,
      // The face travels with the request so the server can never
      // substitute a generic prompt. Layer 1 is the single source.
      systemPrompt: faceSystemPrompt(buddyName),
    }),
  });
  if (res.status === 403) {
    throw new Error('AI_CONSENT_REQUIRED');
  }
  if (!res.ok) {
    throw new Error(`Intent chat failed: ${res.status}`);
  }
  const data = (await res.json()) as { reply?: string };
  if (!data.reply) throw new Error('Empty reply from Intent chat.');
  return { reply: data.reply, engine: 'gemini' };
}

/* ------------------------------------------------------------------ */
/* Static secret audit — run in CI / smoke tests                        */
/* ------------------------------------------------------------------ */

const SECRET_PATTERNS = [
  // Built dynamically so this scanner never flags its own source.
  new RegExp('GEMINI' + '_API_KEY'),
  /AIza[0-9A-Za-z_-]{20,}/, // Google API key shape
  /\bsk-(proj-)?[0-9A-Za-z]{20,}/, // OpenAI-style key shape
];

/**
 * Scan client source text for leaked secrets. Returns the offending
 * patterns found — empty array means clean. Wire this into CI so a key
 * can never ship in the client bundle.
 */
export function auditClientForSecrets(source: string): string[] {
  const hits: string[] = [];
  for (const p of SECRET_PATTERNS) {
    if (p.test(source)) hits.push(p.source);
  }
  return hits;
}
