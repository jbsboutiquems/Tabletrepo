// AI Studio client helper. Calls ONLY our own /api/studio/* endpoints —
// the client NEVER talks to Google directly and never sees GEMINI_API_KEY.
//
// Generative endpoints (music/image/video/transcribe) additionally send the
// X-AI-Consent header when the user has granted Google Gemini consent. The
// server refuses those calls without it; declining consent never breaks the
// rest of the app.
import { aiConsentHeaders, aiFeatureHeaders } from '../../services/aiConsent';
import { apiUrl } from '../../services/api';

const TOKEN_KEY = 'lifeos:auth:token';

export class StudioNotConfiguredError extends Error {
  code = 'STUDIO_NOT_CONFIGURED';
  constructor(message: string) {
    super(message);
    this.name = 'StudioNotConfiguredError';
  }
}

export class AiConsentRequiredError extends Error {
  code = 'AI_CONSENT_REQUIRED';
  constructor(message: string) {
    super(message);
    this.name = 'AiConsentRequiredError';
  }
}

/** OS-006 mirror: the auth token lives in sessionStorage (cleared when the
 * tab/app session ends). One-time migration of a pre-OS-006 localStorage
 * token so existing sessions aren't force-logged out — never leave a copy
 * behind in localStorage. */
function getToken(): string | null {
  try {
    const t = sessionStorage.getItem(TOKEN_KEY);
    if (t) return t;
    const legacy = localStorage.getItem(TOKEN_KEY);
    if (legacy) {
      try { sessionStorage.setItem(TOKEN_KEY, legacy); } catch { /* ignore */ }
      try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
      return legacy;
    }
    return null;
  } catch {
    return null;
  }
}

/** A dropped connection surfaces as a bare `TypeError: Failed to fetch` —
 * useless on its own. Every studio request goes through this so the UI
 * always says WHAT failed and what to try next. */
function networkError(action: string): Error {
  return new Error(
    `Could not reach the studio server while ${action} — check your connection and try again.`
  );
}

async function studioReq(path: string, options: RequestInit = {}, action = 'talking to the studio'): Promise<any> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...aiConsentHeaders(),
    ...aiFeatureHeaders(),
    ...((options.headers as Record<string, string>) || {})
  };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(apiUrl(path), { ...options, headers });
  } catch {
    throw networkError(action);
  }
  if (res.status === 503) {
    const body = await res.json().catch(() => ({}));
    throw new StudioNotConfiguredError(
      body.error || 'AI Studio is not configured on this server yet.'
    );
  }
  if (res.status === 403) {
    const body = await res.json().catch(() => ({}));
    if (body.code === 'AI_CONSENT_REQUIRED') {
      throw new AiConsentRequiredError(
        body.error || 'Google Gemini needs your OK first.'
      );
    }
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Studio request failed (${res.status})`);
  }
  return res.json();
}

export interface StudioMediaItem {
  id: string;
  type: 'music' | 'image' | 'video' | 'transcript';
  prompt: string;
  resultUrl: string;
  transcript?: string;
  mimeType?: string;
  aspectRatio?: string;
  model?: string;
  operationName?: string;
  createdAt: string;
}

export const studioApi = {
  async status(): Promise<{ configured: boolean }> {
    const headers: Record<string, string> = {};
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    let res: Response;
    try {
      res = await fetch(apiUrl('/api/studio/status'), { headers });
    } catch {
      throw networkError('checking whether the studio is switched on');
    }
    if (!res.ok) return { configured: false };
    return res.json();
  },

  async generateMusic(input: { prompt: string; model?: string; imageBase64?: string }) {
    return studioReq('/api/studio/music', {
      method: 'POST',
      body: JSON.stringify(input)
    }, 'composing your track');
  },

  async generateImage(input: { prompt: string; aspectRatio?: string }) {
    return studioReq('/api/studio/image', {
      method: 'POST',
      body: JSON.stringify(input)
    }, 'conjuring your image');
  },

  async editImage(input: { imageBase64: string; prompt: string; mimeType?: string }) {
    return studioReq('/api/studio/image/edit', {
      method: 'POST',
      body: JSON.stringify(input)
    }, 'remixing your image');
  },

  async generateVideo(input: { prompt: string; imageBase64?: string; mimeType?: string; aspectRatio?: string }) {
    return studioReq('/api/studio/video', {
      method: 'POST',
      body: JSON.stringify(input)
    }, 'starting your render');
  },

  async videoStatus(operationName: string) {
    return studioReq('/api/studio/video/status', {
      method: 'POST',
      body: JSON.stringify({ operationName })
    }, 'checking your render');
  },

  /** Downloads via the server proxy; returns an object URL. */
  async downloadVideo(operationName: string): Promise<string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...aiConsentHeaders(),
      ...aiFeatureHeaders()
    };
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    let res: Response;
    try {
      res = await fetch(apiUrl('/api/studio/video/download'), {
        method: 'POST',
        headers,
        body: JSON.stringify({ operationName })
      });
    } catch {
      throw networkError('pulling down your video');
    }
    if (res.status === 503) throw new StudioNotConfiguredError('AI Studio is not configured on this server yet.');
    if (res.status === 404) throw new Error('Video is still rendering — check back in a bit.');
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Video download failed (${res.status})`);
    }
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },

  async transcribe(input: { audioBase64: string; mimeType?: string }) {
    return studioReq('/api/studio/transcribe', {
      method: 'POST',
      body: JSON.stringify(input)
    }, 'transcribing your audio');
  },

  async listMedia(): Promise<StudioMediaItem[]> {
    const headers: Record<string, string> = {};
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    let res: Response;
    try {
      res = await fetch(apiUrl('/api/studio/media'), { headers });
    } catch {
      throw networkError('loading your studio library');
    }
    if (!res.ok) throw new Error('Could not load your studio library.');
    return res.json();
  },

  async deleteMedia(id: string) {
    const headers: Record<string, string> = {};
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    let res: Response;
    try {
      res = await fetch(apiUrl(`/api/studio/media/${encodeURIComponent(id)}`), {
        method: 'DELETE',
        headers
      });
    } catch {
      throw networkError('deleting that item');
    }
    if (!res.ok) throw new Error('Could not delete that item.');
    return res.json();
  }
};

/** Read a File into a data URL (base64). */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}
