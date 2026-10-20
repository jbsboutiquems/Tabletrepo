/**
 * Voice-call UI for DMs — voice-only, no video elements anywhere.
 *
 * Pieces:
 *   - CallButton: drops into the DM thread header next to the back button
 *     (styled to match InboxView's header buttons exactly).
 *   - IncomingCallBanner: fixed bottom banner with Accept / Decline.
 *   - InCallPanel: in-call sheet — status, timer, mute, end.
 *   - useVoiceCall: wires the voiceCall singleton to React state.
 *
 * Integration (in InboxView, which owns the thread header):
 *
 *   import { CallButton, IncomingCallBanner, InCallPanel, useVoiceCall } from './VoiceCallUI';
 *   const call = useVoiceCall(myUserId);
 *
 *   // thread header, beside the back button:
 *   {active && (
 *     <CallButton
 *       onClick={() => call.start(active.partnerId, active.partnerUsername)}
 *       disabled={call.state !== 'idle'}
 *     />
 *   )}
 *
 *   // anywhere in the view:
 *   {call.incoming && call.state === 'ringing-in' && (
 *     <IncomingCallBanner
 *       callerName={call.incoming.fromUsername}
 *       onAccept={call.accept}
 *       onDecline={call.decline}
 *     />
 *   )}
 *   {call.state !== 'idle' && call.info && (
 *     <InCallPanel
 *       partnerName={call.info.partnerUsername}
 *       state={call.state}
 *       muted={call.info.muted}
 *       elapsedSec={call.elapsedSec}
 *       error={call.error}
 *       onToggleMute={call.toggleMute}
 *       onEnd={call.end}
 *     />
 *   )}
 */
import React, { useState, useEffect } from 'react';
import { Phone, PhoneOff, Mic, MicOff } from 'lucide-react';
import { voiceCall, CallState, CallInfo, IncomingCall } from '../services/voiceCall';

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseVoiceCall {
  state: CallState;
  info: CallInfo | null;
  incoming: IncomingCall | null;
  error: string | null;
  elapsedSec: number;
  start: (partnerId: string, partnerUsername: string) => Promise<void>;
  accept: () => Promise<void>;
  decline: () => Promise<void>;
  end: () => Promise<void>;
  toggleMute: () => void;
}

export function useVoiceCall(myUserId: string): UseVoiceCall {
  const [state, setState] = useState<CallState>(voiceCall.getState());
  const [info, setInfo] = useState<CallInfo | null>(voiceCall.getInfo());
  const [incoming, setIncoming] = useState<IncomingCall | null>(voiceCall.getIncoming());
  const [error, setError] = useState<string | null>(voiceCall.getLastError());
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    voiceCall.setMyUserId(myUserId);
    voiceCall.startIncomingWatch();
    const offState = voiceCall.onStateChange((s, i) => {
      setState(s);
      setInfo(i);
      setError(voiceCall.getLastError());
    });
    const offIncoming = voiceCall.onIncomingCall((c) => setIncoming(c));
    return () => {
      offState();
      offIncoming();
      voiceCall.stopIncomingWatch();
    };
  }, [myUserId]);

  // Ended/failed panels linger just long enough to read, then dismiss.
  useEffect(() => {
    if (state === 'ended' || state === 'failed') {
      const t = setTimeout(() => voiceCall.dismiss(), 3000);
      return () => clearTimeout(t);
    }
  }, [state]);

  // Call timer — ticks only while connected.
  const connectedAt = info?.connectedAt ?? null;
  useEffect(() => {
    if (state !== 'connected' || !connectedAt) {
      setElapsedSec(0);
      return;
    }
    const tick = () => setElapsedSec(Math.max(0, Math.floor((Date.now() - connectedAt) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [state, connectedAt]);

  const start = async (partnerId: string, partnerUsername: string) => {
    setError(null);
    try {
      await voiceCall.startCall(partnerId, partnerUsername);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the call.');
    }
  };
  const accept = async () => {
    try {
      await voiceCall.acceptCall();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not answer the call.');
    }
  };
  const decline = async () => {
    await voiceCall.declineCall().catch(() => {});
  };
  const end = async () => {
    await voiceCall.endCall().catch(() => {});
  };
  const toggleMute = () => voiceCall.toggleMute();

  return { state, info, incoming, error, elapsedSec, start, accept, decline, end, toggleMute };
}

// ---------------------------------------------------------------------------
// Call button — matches InboxView's thread-header buttons
// ---------------------------------------------------------------------------

export const CallButton: React.FC<{ onClick: () => void; disabled?: boolean }> = ({
  onClick,
  disabled,
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-200 dark:hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
    title="Voice call"
  >
    <Phone className="w-4 h-4" />
  </button>
);

// ---------------------------------------------------------------------------
// Incoming-call banner
// ---------------------------------------------------------------------------

export const IncomingCallBanner: React.FC<{
  callerName: string;
  onAccept: () => void;
  onDecline: () => void;
}> = ({ callerName, onAccept, onDecline }) => (
  <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm">
    <div className="bg-slate-900 dark:bg-[#02142e] border-2 border-amber-400/60 rounded-2xl px-5 py-4 shadow-2xl">
      <div className="flex items-center gap-3">
        <span className="relative flex h-11 w-11 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-40" />
          <span className="relative inline-flex rounded-full h-11 w-11 bg-gradient-to-br from-indigo-600 to-rose-600 items-center justify-center">
            <Phone className="w-5 h-5 text-white" />
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-mono-code font-bold uppercase tracking-widest text-amber-300">
            Incoming voice call
          </p>
          <p className="font-bold text-sm text-white truncate">@{callerName}</p>
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <button
          onClick={onDecline}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold transition-colors"
        >
          <PhoneOff className="w-4 h-4" /> Decline
        </button>
        <button
          onClick={onAccept}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold transition-colors"
        >
          <Phone className="w-4 h-4" /> Accept
        </button>
      </div>
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// In-call panel
// ---------------------------------------------------------------------------

function formatElapsed(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function statusText(state: CallState, elapsedSec: number): string {
  switch (state) {
    case 'dialing':
      return 'Dialing…';
    case 'ringing-in':
      return 'Incoming…';
    case 'connecting':
      return 'Connecting…';
    case 'connected':
      return formatElapsed(elapsedSec);
    case 'ended':
      return 'Call ended';
    case 'failed':
      return 'Call failed';
    default:
      return '';
  }
}

export const InCallPanel: React.FC<{
  partnerName: string;
  state: CallState;
  muted: boolean;
  elapsedSec: number;
  error: string | null;
  onToggleMute: () => void;
  onEnd: () => void;
}> = ({ partnerName, state, muted, elapsedSec, error, onToggleMute, onEnd }) => {
  const live = state === 'connected';
  const working = state === 'dialing' || state === 'connecting';
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm">
      <div className="bg-white dark:bg-[#02142e] border-2 border-stone-800 dark:border-amber-400/40 rounded-2xl px-5 py-4 shadow-2xl">
        <div className="flex items-center gap-3">
          <span className="relative flex h-11 w-11 shrink-0">
            {live && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-40" />
            )}
            <span
              className={`relative inline-flex rounded-full h-11 w-11 items-center justify-center ${
                live
                  ? 'bg-gradient-to-br from-emerald-500 to-teal-600'
                  : working
                    ? 'bg-gradient-to-br from-amber-500 to-orange-600'
                    : 'bg-gradient-to-br from-indigo-600 to-rose-600'
              }`}
            >
              <Phone className="w-5 h-5 text-white" />
            </span>
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-sm text-slate-900 dark:text-cream-canvas truncate">
              @{partnerName}
            </p>
            <p
              className={`text-xs font-mono-code font-bold ${
                live
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : working
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-stone-500 dark:text-stone-400'
              }`}
            >
              {statusText(state, elapsedSec)}
              {muted && live && ' · muted'}
            </p>
          </div>
        </div>
        {state === 'failed' && error && (
          <p className="mt-2 text-xs font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-800/60 rounded-xl px-3 py-2">
            {error}
          </p>
        )}
        {(state === 'dialing' || state === 'connecting' || state === 'connected') && (
          <div className="flex gap-2 mt-3">
            <button
              onClick={onToggleMute}
              disabled={!live}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-40 ${
                muted
                  ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700'
                  : 'bg-stone-100 dark:bg-white/10 text-stone-700 dark:text-stone-200 hover:bg-stone-200 dark:hover:bg-white/15'
              }`}
              title={muted ? 'Unmute' : 'Mute'}
            >
              {muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              {muted ? 'Unmute' : 'Mute'}
            </button>
            <button
              onClick={onEnd}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold transition-colors"
              title="End call"
            >
              <PhoneOff className="w-4 h-4" /> End
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
