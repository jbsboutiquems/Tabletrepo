// Gemini conversational chat — "like a real Gemini", separate from The Intent
// diagnostic path. Renders only when master consent is granted AND the chat
// feature toggle is on; otherwise a friendly locked state pointing at AI
// Controls. Multi-turn: history loads from the server, usage shows as
// "n/limit chats today".
//
// NOTE: this view does its own authed fetch (token key mirrors api.ts).
// If adopted, move these calls into src/services/api.ts as proper methods.
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Sparkles, Send, Lock, Loader2 } from 'lucide-react';
import { apiUrl } from '../services/api';
import {
  AI_CONSENT_CHANGED_EVENT,
  AI_FEATURES_CHANGED_EVENT,
  getAiConsent,
  isAiFeatureEnabled,
  aiConsentHeaders,
  aiFeatureHeaders,
  requestAiControls,
} from '../services/aiConsent';

interface ChatMsg {
  role: 'user' | 'model';
  text: string;
  at: string;
}

interface Props {
  userId?: string | null;
  /** Called by the "Open AI Controls" button; defaults to dispatching offscript:ai-controls-open. */
  onOpenControls?: () => void;
}

const AUTH_TOKEN_KEY = 'lifeos:auth:token'; // mirrors src/services/api.ts
const MAX_MESSAGE_CHARS = 2000;

async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  let token: string | null = null;
  try {
    token = sessionStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    token = null;
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...aiConsentHeaders(),
    ...aiFeatureHeaders(),
    ...((init.headers as Record<string, string>) || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(apiUrl(path), { ...init, headers });
  } catch {
    throw new TypeError('network unreachable');
  }
  if (res.status === 401) throw new Error('Session expired. Please log in again.');
  return res;
}

export const GeminiChatView: React.FC<Props> = ({ userId, onOpenControls }) => {
  const [allowed, setAllowed] = useState<boolean>(
    () => getAiConsent(userId) === 'granted' && isAiFeatureEnabled(userId, 'chat')
  );
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const checkAccess = useCallback(() => {
    setAllowed(getAiConsent(userId) === 'granted' && isAiFeatureEnabled(userId, 'chat'));
  }, [userId]);

  useEffect(() => {
    checkAccess();
    window.addEventListener(AI_CONSENT_CHANGED_EVENT, checkAccess);
    window.addEventListener(AI_FEATURES_CHANGED_EVENT, checkAccess);
    return () => {
      window.removeEventListener(AI_CONSENT_CHANGED_EVENT, checkAccess);
      window.removeEventListener(AI_FEATURES_CHANGED_EVENT, checkAccess);
    };
  }, [checkAccess]);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    (async () => {
      try {
        const [hRes, uRes] = await Promise.all([
          authedFetch('/api/ai/history'),
          authedFetch('/api/ai/usage'),
        ]);
        if (hRes.status === 403 || uRes.status === 403) {
          if (!cancelled) checkAccess();
          return;
        }
        const h = (await hRes.json().catch(() => ({}))) as { messages?: ChatMsg[] };
        const u = (await uRes.json().catch(() => ({}))) as { used?: number; limit?: number };
        if (!cancelled) {
          if (Array.isArray(h.messages)) setMessages(h.messages);
          if (typeof u.used === 'number' && typeof u.limit === 'number') {
            setUsage({ used: u.used, limit: u.limit });
          }
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Could not load chat.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [allowed, checkAccess]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, sending]);

  const send = useCallback(async () => {
    const text = input.trim().slice(0, MAX_MESSAGE_CHARS);
    if (!text || sending) return;
    setSending(true);
    setError(null);
    setInput('');
    const userMsg: ChatMsg = { role: 'user', text, at: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    try {
      const res = await authedFetch('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({ message: text }),
      });
      if (res.status === 403) {
        checkAccess();
        setError('Gemini chat needs your OK first — flip it on in AI Controls.');
        return;
      }
      if (res.status === 429) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error || 'Daily chat budget spent — fresh batch tomorrow.');
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `Chat failed (${res.status}).`);
      }
      const body = (await res.json()) as {
        reply?: string;
        usage?: { used: number; limit: number };
      };
      setMessages((prev) => [
        ...prev,
        { role: 'model', text: (body.reply || '').trim() || '…', at: new Date().toISOString() },
      ]);
      if (body.usage && typeof body.usage.used === 'number') setUsage(body.usage);
    } catch (e: any) {
      setError(e?.message || 'Could not send. Try again.');
    } finally {
      setSending(false);
    }
  }, [input, sending, checkAccess]);

  if (!allowed) {
    return (
      <div className="w-full rounded-2xl border-2 border-dashed border-stone-300 dark:border-stone-700 bg-[#faf7f0] dark:bg-[#000a15] p-8 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-stone-200 dark:bg-stone-800 text-stone-500 dark:text-stone-400">
          <Lock size={22} />
        </span>
        <h2 className="mt-4 text-lg font-black text-slate-900 dark:text-stone-100">
          Gemini chat is off
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-stone-300 max-w-sm mx-auto">
          Nothing generative runs until you say so. Flip the master switch and the
          chat toggle on in AI Controls to start talking.
        </p>
        <button
          type="button"
          onClick={() => (onOpenControls ? onOpenControls() : requestAiControls())}
          className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 bg-[#ea4798] hover:bg-[#d13a86] text-white text-sm font-bold rounded-xl transition-all"
        >
          <Sparkles size={16} />
          Open AI Controls
        </button>
      </div>
    );
  }

  return (
    <div className="w-full rounded-2xl border-2 border-[#ea4798]/40 bg-[#faf7f0] dark:bg-[#000a15] shadow-xl flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-stone-200 dark:border-stone-700">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#ea4798] to-[#2da2ee] text-white shrink-0">
            <Sparkles size={18} />
          </span>
          <div>
            <h2 className="text-sm font-black text-slate-900 dark:text-stone-100">Gemini Chat</h2>
            <p className="text-[11px] text-slate-500 dark:text-stone-400">
              Your Off*Script buddy, powered by Gemini.
            </p>
          </div>
        </div>
        {usage && (
          <span
            className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-[#2da2ee]/15 text-[#2da2ee] whitespace-nowrap"
            title="AI usage today"
          >
            {usage.used}/{usage.limit} today
          </span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 min-h-[280px] max-h-[420px] overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && !sending && (
          <p className="text-center text-xs text-slate-400 dark:text-stone-500 mt-8">
            Say hi. Short answers, zero lectures — that's the deal.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-[#ea4798] text-white rounded-2xl rounded-br-md'
                  : 'bg-white dark:bg-[#0f1b2d] text-slate-800 dark:text-stone-200 border border-stone-200 dark:border-stone-700 rounded-2xl rounded-bl-md'
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 px-3.5 py-2.5 bg-white dark:bg-[#0f1b2d] border border-stone-200 dark:border-stone-700 rounded-2xl rounded-bl-md text-slate-400">
              <Loader2 size={16} className="animate-spin" />
              <span className="text-xs">Thinking…</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Error */}
      {error && (
        <p className="px-4 pb-2 text-xs font-semibold text-rose-600 dark:text-rose-400">{error}</p>
      )}

      {/* Input */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-stone-200 dark:border-stone-700">
        <input
          type="text"
          value={input}
          maxLength={MAX_MESSAGE_CHARS}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') send();
          }}
          placeholder="Ask anything…"
          disabled={sending}
          className="flex-1 px-3.5 py-2.5 border border-stone-300 dark:border-stone-600 rounded-xl bg-white dark:bg-[#0f1b2d] text-sm text-slate-900 dark:text-stone-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#ea4798]/50 disabled:opacity-60"
        />
        <button
          type="button"
          onClick={send}
          disabled={sending || !input.trim()}
          aria-label="Send message"
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ea4798] hover:bg-[#d13a86] text-white transition-all disabled:opacity-40 shrink-0"
        >
          <Send size={17} />
        </button>
      </div>
    </div>
  );
};
