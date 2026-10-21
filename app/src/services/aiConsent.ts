// Google Gemini consent — explicit opt-in before any Gemini-powered feature.
//
// Covered surfaces:
//   - AI Studio (music / image / video / transcription generation)
//   - The media-intent handoff (/api/mei/media-intent)
//   - The /api/diagnose Gemini fallback
// Everything else in the app stays on the local engine and never needs this.
//
// The decision is persisted per user under the existing
// `lifeos:<userId>:` localStorage convention. Declining never blocks the app:
// Gemini features simply render a friendly disabled state instead.
//
// Event bridge: any view can call requestAiConsent() and the mounted
// AiConsentGate will show the modal — but only while the decision is still
// unknown, so users are never nagged twice.

export type AiConsentState = 'unknown' | 'granted' | 'declined';

export const AI_CONSENT_REQUEST_EVENT = 'offscript:ai-consent-request';
export const AI_CONSENT_CHANGED_EVENT = 'offscript:ai-consent-changed';
/** Header the client sends on Gemini-backed requests when consent is granted. */
export const AI_CONSENT_HEADER = 'X-AI-Consent';

const keyFor = (userId?: string | null) => `lifeos:${userId || 'anon'}:ai-consent:v1`;

let currentUserId: string | null = null;

/** Called by AiConsentGate so header helpers know whose decision applies. */
export function setAiConsentUser(userId: string | null | undefined): void {
  currentUserId = userId ?? null;
}

export function getAiConsent(userId?: string | null): AiConsentState {
  try {
    const v = localStorage.getItem(keyFor(userId));
    if (v === 'granted' || v === 'declined') return v;
  } catch {
    // ignore — storage unavailable means undecided
  }
  return 'unknown';
}

export function setAiConsent(userId: string | null | undefined, state: 'granted' | 'declined'): void {
  try {
    localStorage.setItem(keyFor(userId), state);
  } catch {
    // ignore
  }
  try {
    window.dispatchEvent(new CustomEvent(AI_CONSENT_CHANGED_EVENT, { detail: { state } }));
  } catch {
    // ignore
  }
}

export function resetAiConsent(userId?: string | null): void {
  try {
    localStorage.removeItem(keyFor(userId));
  } catch {
    // ignore
  }
}

/** Ask the mounted AiConsentGate to show the modal (no-op if already decided). */
export function requestAiConsent(): void {
  try {
    window.dispatchEvent(new CustomEvent(AI_CONSENT_REQUEST_EVENT));
  } catch {
    // ignore
  }
}

/** Clear a previous decision and ask again — used by "Enable Gemini" buttons. */
export function reaskAiConsent(userId?: string | null): void {
  resetAiConsent(userId);
  requestAiConsent();
}

/**
 * Headers to attach to Gemini-backed API calls for the current user.
 * Empty when consent isn't granted — the server then refuses the call and
 * the client falls back to its non-Gemini behavior.
 */
export function aiConsentHeaders(): Record<string, string> {
  return getAiConsent(currentUserId) === 'granted' ? { [AI_CONSENT_HEADER]: 'granted' } : {};
}

/* ------------------------------------------------------------------ */
/* Granular per-feature toggles (Sunday add-day)                       */
/*                                                                     */
/* The master consent above is the big on/off switch. These toggles     */
/* decide WHICH Gemini features may run once the master is granted.     */
/* Default: everything OFF — nothing generative runs until the user    */
/* says so, feature by feature.                                        */
/*                                                                     */
/* Persisted per user under `lifeos:<userId>:ai-features:v1` (JSON      */
/* map). The client sends the enabled set as the X-AI-Features header;  */
/* the server enforces BOTH headers before any Gemini call.             */
/* ------------------------------------------------------------------ */

export type AiFeature = 'chat' | 'image' | 'video' | 'music' | 'transcribe' | 'diagnose';

/** Header the client sends listing which Gemini features are switched on. */
export const AI_FEATURES_HEADER = 'X-AI-Features';

export const AI_FEATURES_CHANGED_EVENT = 'offscript:ai-features-changed';
/** Dispatched when a locked Gemini view wants the settings screen to open AI Controls. */
export const AI_CONTROLS_OPEN_EVENT = 'offscript:ai-controls-open';

export const AI_FEATURES: AiFeature[] = ['chat', 'image', 'video', 'music', 'transcribe', 'diagnose'];

const DEFAULT_AI_FEATURES: Record<AiFeature, boolean> = {
  chat: false,
  image: false,
  video: false,
  music: false,
  transcribe: false,
  diagnose: false,
};

const featuresKeyFor = (userId?: string | null) => `lifeos:${userId || 'anon'}:ai-features:v1`;

function readFeatureMap(userId?: string | null): Record<AiFeature, boolean> {
  const out: Record<AiFeature, boolean> = { ...DEFAULT_AI_FEATURES };
  try {
    const raw = localStorage.getItem(featuresKeyFor(userId));
    if (!raw) return out;
    const parsed = JSON.parse(raw) as Partial<Record<AiFeature, boolean>>;
    for (const f of AI_FEATURES) {
      if (typeof parsed[f] === 'boolean') out[f] = parsed[f];
    }
  } catch {
    // ignore — storage unavailable means all features stay off
  }
  return out;
}

/** The user's per-feature toggle map. Unknown keys never sneak in; defaults are all false. */
export function getAiFeatures(userId?: string | null): Record<AiFeature, boolean> {
  return readFeatureMap(userId);
}

export function setAiFeature(userId: string | null | undefined, feature: AiFeature, on: boolean): void {
  const map = readFeatureMap(userId);
  map[feature] = on;
  try {
    localStorage.setItem(featuresKeyFor(userId), JSON.stringify(map));
  } catch {
    // ignore
  }
  try {
    window.dispatchEvent(new CustomEvent(AI_FEATURES_CHANGED_EVENT, { detail: { feature, on } }));
  } catch {
    // ignore
  }
}

export function isAiFeatureEnabled(userId: string | null | undefined, feature: AiFeature): boolean {
  return readFeatureMap(userId ?? currentUserId)[feature] === true;
}

/**
 * X-AI-Features header value: comma-joined list of enabled features.
 * Empty (no header) when master consent isn't granted or nothing is on —
 * the server refuses Gemini calls without both headers.
 */
export function aiFeatureHeaders(userId?: string | null): Record<string, string> {
  const uid = userId ?? currentUserId;
  if (getAiConsent(uid) !== 'granted') return {};
  const enabled = AI_FEATURES.filter((f) => readFeatureMap(uid)[f]);
  return enabled.length ? { [AI_FEATURES_HEADER]: enabled.join(',') } : {};
}

/** Ask the host settings screen to open AI Controls (no-op if nobody listens). */
export function requestAiControls(): void {
  try {
    window.dispatchEvent(new CustomEvent(AI_CONTROLS_OPEN_EVENT));
  } catch {
    // ignore
  }
}
