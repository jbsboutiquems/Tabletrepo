/**
 * Voice calling over WebRTC — voice-only first, video later if Amber wants it.
 *
 * How it works:
 *   - Signaling (SDP offer/answer + ICE candidates) rides two tiny endpoints:
 *       POST /api/calls/signal            { callId, toUserId, type, payload }
 *       GET  /api/calls/signal/:callId?since=n
 *     plus GET /api/calls/pending for incoming-call discovery.
 *   - Media is phone-to-phone over the RTCPeerConnection. Audio NEVER goes
 *     through the app server — the server only relays handshake messages.
 *   - NAT traversal: Google STUN + the public free-tier OpenRelay TURN below.
 *
 * The manager is a singleton (one call at a time). UI lives in
 * ../components/VoiceCallUI.tsx — this file owns the connection, the mic,
 * the ringtone, and the polling loops.
 */
import { api } from './api';
import { BuddyRingtone } from './buddySounds';
import { getBuddy } from '../buddy';

// ---------------------------------------------------------------------------
// Wire types
// ---------------------------------------------------------------------------

export type CallSignalType = 'offer' | 'answer' | 'ice' | 'hangup';
export type CallState =
  | 'idle'
  | 'dialing' // I called; waiting for them to pick up
  | 'ringing-in' // they're calling me; ringtone playing
  | 'connecting' // handshake done; ICE still negotiating
  | 'connected' // audio flowing both ways
  | 'ended'
  | 'failed';

export interface SignalMessage {
  id: string;
  callId: string;
  fromUserId: string;
  toUserId: string;
  type: CallSignalType;
  /** offer/answer: { sdp } · ice: { candidate } · hangup: {} */
  payload: any;
  at: string;
}

export interface IncomingCall {
  callId: string;
  fromUserId: string;
  fromUsername: string;
  /** Caller's buddy species id — drives the ringtone. */
  fromSpecies?: string;
  at: string;
  offer: RTCSessionDescriptionInit;
}

export interface CallInfo {
  callId: string;
  partnerId: string;
  partnerUsername: string;
  direction: 'out' | 'in';
  connectedAt: number | null;
  muted: boolean;
}

// ---------------------------------------------------------------------------
// ICE: STUN + free-tier TURN
// ---------------------------------------------------------------------------

const ICE_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    // PUBLIC free-tier TURN relay (OpenRelay / Metered). Shared and
    // rate-limited — fine for the prototype, and the ONLY TURN that works
    // without an account. No secret here: these are the project's published
    // public credentials. Amber should swap in her own TURN server
    // (self-hosted coturn, Cloudflare Calls, or Twilio) before this carries
    // real traffic — ~20-30% of calls need TURN when STUN alone can't punch
    // through symmetric NATs.
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
  iceCandidatePoolSize: 10,
};

// ---------------------------------------------------------------------------
// Authenticated fetch (the api.ts req() helper is private to that module,
// so this file carries its own thin wrapper over the same token + base URL)
// ---------------------------------------------------------------------------

async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = api.getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string> | undefined) || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(api.apiUrl(path), { ...init, headers });
  } catch {
    throw new TypeError('network unreachable');
  }
  if (res.status === 401) throw new Error('Session expired. Please log in again.');
  return res;
}

async function postSignal(msg: {
  callId: string;
  toUserId: string;
  type: CallSignalType;
  payload: unknown;
  fromSpecies?: string;
}): Promise<void> {
  const res = await authedFetch('/api/calls/signal', {
    method: 'POST',
    body: JSON.stringify(msg),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({} as any));
    throw new Error(body.error || 'Signal send failed.');
  }
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Call manager (singleton)
// ---------------------------------------------------------------------------

const SIGNAL_POLL_MS = 2500;
const PENDING_POLL_MS = 5000;
const RING_TIMEOUT_MS = 45000; // stop dialing into the void after 45s

class VoiceCallManager {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteAudio: HTMLAudioElement | null = null;
  private state: CallState = 'idle';
  private info: CallInfo | null = null;
  private incoming: IncomingCall | null = null;
  private lastError: string | null = null;
  private myUserId: string | null = null;

  private signalTimer: ReturnType<typeof setInterval> | null = null;
  private pendingTimer: ReturnType<typeof setInterval> | null = null;
  private ringTimer: ReturnType<typeof setTimeout> | null = null;
  private watchers = 0;
  private since = 0;
  private pendingIce: RTCIceCandidateInit[] = [];
  private readonly ringtone = new BuddyRingtone();

  private stateListeners = new Set<(s: CallState, info: CallInfo | null) => void>();
  private incomingListeners = new Set<(c: IncomingCall | null) => void>();

  // ---- identity + subscriptions ----

  /** The UI hook calls this on mount so we can skip our own signal echoes. */
  setMyUserId(id: string): void {
    this.myUserId = id;
  }

  getState(): CallState {
    return this.state;
  }
  getInfo(): CallInfo | null {
    return this.info;
  }
  getIncoming(): IncomingCall | null {
    return this.incoming;
  }
  getLastError(): string | null {
    return this.lastError;
  }

  onStateChange(cb: (s: CallState, info: CallInfo | null) => void): () => void {
    this.stateListeners.add(cb);
    return () => {
      this.stateListeners.delete(cb);
    };
  }

  onIncomingCall(cb: (c: IncomingCall | null) => void): () => void {
    this.incomingListeners.add(cb);
    return () => {
      this.incomingListeners.delete(cb);
    };
  }

  private setState(s: CallState): void {
    this.state = s;
    this.stateListeners.forEach((cb) => cb(s, this.info));
  }

  private emitIncoming(c: IncomingCall | null): void {
    this.incomingListeners.forEach((cb) => cb(c));
  }

  // ---- outgoing ----

  /** Start a voice-only call to a DM partner. Throws on mic denial. */
  async startCall(partnerId: string, partnerUsername: string): Promise<void> {
    if (this.state !== 'idle') throw new Error('Already on a call. One khaos at a time.');
    const stream = await this.captureMic();
    const callId = `call_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

    this.localStream = stream;
    const pc = this.createPeerConnection();
    this.pc = pc;
    stream.getAudioTracks().forEach((t) => pc.addTrack(t, stream));

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    this.info = {
      callId,
      partnerId,
      partnerUsername,
      direction: 'out',
      connectedAt: null,
      muted: false,
    };
    this.since = 0;
    this.pendingIce = [];
    this.setState('dialing');

    try {
      await postSignal({
        callId,
        toUserId: partnerId,
        type: 'offer',
        payload: { sdp: pc.localDescription ? pc.localDescription.toJSON() : offer },
        fromSpecies: getBuddy()?.creatureId || 'custom',
      });
    } catch (e) {
      // Offer never left the phone — tear down instead of dialing into the void.
      this.cleanupCall();
      this.lastError = e instanceof Error ? e.message : 'Could not reach the server.';
      this.setState('failed');
      throw e;
    }
    this.startSignalPoll();

    // Nobody home? Hang up instead of ringing forever.
    this.clearRingTimer();
    this.ringTimer = setTimeout(() => {
      if (this.state === 'dialing') void this.endCall();
    }, RING_TIMEOUT_MS);
  }

  // ---- incoming ----

  /** Answer the currently ringing call. */
  async acceptCall(): Promise<void> {
    const incoming = this.incoming;
    if (!incoming || this.state !== 'ringing-in') throw new Error('No incoming call to accept.');
    const stream = await this.captureMic();

    this.ringtone.stop();
    this.clearRingTimer();
    this.localStream = stream;
    const pc = this.createPeerConnection();
    this.pc = pc;
    stream.getAudioTracks().forEach((t) => pc.addTrack(t, stream));

    await pc.setRemoteDescription(new RTCSessionDescription(incoming.offer));
    await this.flushPendingIce();
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    this.info = {
      callId: incoming.callId,
      partnerId: incoming.fromUserId,
      partnerUsername: incoming.fromUsername,
      direction: 'in',
      connectedAt: null,
      muted: false,
    };
    this.incoming = null;
    this.emitIncoming(null);
    this.since = 0;
    this.setState('connecting');

    try {
      await postSignal({
        callId: incoming.callId,
        toUserId: incoming.fromUserId,
        type: 'answer',
        payload: { sdp: pc.localDescription ? pc.localDescription.toJSON() : answer },
      });
    } catch (e) {
      this.cleanupCall();
      this.lastError = e instanceof Error ? e.message : 'Could not reach the server.';
      this.setState('failed');
      throw e;
    }
    this.startSignalPoll();
  }

  /** Decline the ringing call — tells the caller via hangup signal. */
  async declineCall(): Promise<void> {
    const incoming = this.incoming;
    this.ringtone.stop();
    this.clearRingTimer();
    if (incoming) {
      try {
        await postSignal({ callId: incoming.callId, toUserId: incoming.fromUserId, type: 'hangup', payload: {} });
      } catch {
        /* best effort */
      }
    }
    this.incoming = null;
    this.emitIncoming(null);
    this.cleanupCall();
    this.setState('ended');
  }

  // ---- in-call controls ----

  /** Hang up the active call (best-effort hangup signal, then tear down). */
  async endCall(): Promise<void> {
    const info = this.info;
    if (info) {
      try {
        await postSignal({ callId: info.callId, toUserId: info.partnerId, type: 'hangup', payload: {} });
      } catch {
        /* best effort — the other side's poll timeout covers us */
      }
    }
    this.clearRingTimer();
    this.cleanupCall();
    this.setState('ended');
  }

  /** Mute/unmute the local mic. Returns the new muted state. */
  toggleMute(): boolean {
    const tracks = this.localStream?.getAudioTracks() || [];
    if (tracks.length === 0) return this.info?.muted ?? false;
    const next = !(this.info?.muted ?? false);
    tracks.forEach((t) => {
      t.enabled = !next;
    });
    if (this.info) this.info = { ...this.info, muted: next };
    this.stateListeners.forEach((cb) => cb(this.state, this.info));
    return next;
  }

  /** Reset to idle after the ended/failed panel has been shown. */
  dismiss(): void {
    if (this.state === 'ended' || this.state === 'failed') {
      this.info = null;
      this.lastError = null;
      this.setState('idle');
    }
  }

  // ---- incoming-call discovery (polls while any UI is watching) ----

  startIncomingWatch(): void {
    this.watchers++;
    if (this.pendingTimer) return;
    void this.checkPending();
    this.pendingTimer = setInterval(() => {
      void this.checkPending();
    }, PENDING_POLL_MS);
  }

  stopIncomingWatch(): void {
    this.watchers = Math.max(0, this.watchers - 1);
    if (this.watchers === 0 && this.pendingTimer) {
      clearInterval(this.pendingTimer);
      this.pendingTimer = null;
    }
  }

  private async checkPending(): Promise<void> {
    if (this.state !== 'idle' && this.state !== 'ringing-in') return;
    try {
      const res = await authedFetch('/api/calls/pending');
      if (!res.ok) return;
      const body = await res.json();
      const offers = (body.incoming || []) as Array<{
        callId: string;
        fromUserId: string;
        fromUsername: string;
        fromSpecies?: string;
        at: string;
      }>;

      if (this.state === 'ringing-in' && this.incoming) {
        // Caller hung up before we answered — missed call, stop ringing.
        if (!offers.some((o) => o.callId === this.incoming!.callId)) {
          this.ringtone.stop();
          this.incoming = null;
          this.emitIncoming(null);
          this.setState('ended');
        }
        return;
      }
      if (this.state !== 'idle' || offers.length === 0) return;

      const first = offers[0];
      // Fetch the offer SDP so acceptCall() has something to answer.
      const sigRes = await authedFetch(`/api/calls/signal/${first.callId}?since=0`);
      if (!sigRes.ok) return;
      const sigBody = await sigRes.json();
      const offerMsg = ((sigBody.messages || []) as SignalMessage[]).find((m) => m.type === 'offer');
      const sdp = offerMsg?.payload?.sdp as RTCSessionDescriptionInit | undefined;
      if (!offerMsg || !sdp) return;

      this.incoming = {
        callId: first.callId,
        fromUserId: first.fromUserId,
        fromUsername: first.fromUsername,
        fromSpecies: first.fromSpecies,
        at: first.at,
        offer: sdp,
      };
      this.setState('ringing-in');
      this.ringtone.start(first.fromSpecies);
      this.emitIncoming(this.incoming);
    } catch {
      // Transient — the next tick retries.
    }
  }

  // ---- internals ----

  private async captureMic(): Promise<MediaStream> {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.lastError = 'This device blocked microphone access.';
      this.setState('failed');
      throw new Error(this.lastError);
    }
    try {
      // Voice-only: audio track, no camera. Ever.
      return await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch {
      this.lastError = 'Microphone unavailable. Check the permission and try again.';
      this.setState('failed');
      throw new Error(this.lastError);
    }
  }

  private createPeerConnection(): RTCPeerConnection {
    const pc = new RTCPeerConnection(ICE_CONFIG);

    // Trickle ICE out through the signaling channel.
    pc.onicecandidate = (e) => {
      if (e.candidate && this.info) {
        const callId = this.info.callId;
        const toUserId = this.info.partnerId;
        void postSignal({
          callId,
          toUserId,
          type: 'ice',
          payload: { candidate: e.candidate.toJSON() },
        }).catch(() => {
          /* transient — the next candidates still go out */
        });
      }
    };

    // Remote voice lands here. Audio element only — no video, ever.
    pc.ontrack = (e) => {
      const stream = e.streams[0];
      if (!stream) return;
      let el = this.remoteAudio;
      if (!el) {
        el = document.createElement('audio');
        el.autoplay = true;
        document.body.appendChild(el);
        this.remoteAudio = el;
      }
      el.srcObject = stream;
      void el.play().catch(() => {
        /* autoplay policies: the user already tapped, so this is rare */
      });
    };

    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === 'connected') {
        if (this.info && !this.info.connectedAt) this.info = { ...this.info, connectedAt: Date.now() };
        this.setState('connected');
      } else if (st === 'failed') {
        this.failCall('The connection failed. Gremlins in the wires.');
      }
    };

    return pc;
  }

  private startSignalPoll(): void {
    this.stopSignalPoll();
    this.signalTimer = setInterval(() => {
      void this.pollSignals();
    }, SIGNAL_POLL_MS);
  }

  private stopSignalPoll(): void {
    if (this.signalTimer) {
      clearInterval(this.signalTimer);
      this.signalTimer = null;
    }
  }

  private async pollSignals(): Promise<void> {
    const info = this.info;
    if (!info) return;
    try {
      const res = await authedFetch(`/api/calls/signal/${info.callId}?since=${this.since}`);
      if (!res.ok) return;
      const body = await res.json();
      const messages = (body.messages || []) as SignalMessage[];
      this.since += messages.length;
      for (const m of messages) {
        await this.handleSignalMessage(m);
      }
    } catch {
      // Transient — the next tick retries. Ring timeout / ICE failure
      // paths still bound the call lifetime.
    }
  }

  private async handleSignalMessage(msg: SignalMessage): Promise<void> {
    if (msg.fromUserId === this.myUserId) return; // skip my own echoes
    const pc = this.pc;
    if (!pc || !this.info) return;
    switch (msg.type) {
      case 'answer': {
        if (this.state === 'dialing' || this.state === 'connecting') {
          const sdp = msg.payload?.sdp as RTCSessionDescriptionInit | undefined;
          if (sdp) {
            this.clearRingTimer();
            await pc.setRemoteDescription(new RTCSessionDescription(sdp));
            await this.flushPendingIce();
            this.setState('connecting');
          }
        }
        break;
      }
      case 'ice': {
        const cand = msg.payload?.candidate as RTCIceCandidateInit | undefined;
        if (cand) {
          if (pc.remoteDescription) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(cand));
            } catch {
              /* trickle races are normal; the next candidate covers it */
            }
          } else {
            // Remote description isn't set yet — hold for later.
            this.pendingIce.push(cand);
          }
        }
        break;
      }
      case 'hangup': {
        // They hung up (or declined). Tear down quietly.
        this.clearRingTimer();
        this.cleanupCall();
        this.setState('ended');
        break;
      }
      case 'offer':
        // Offers arrive via the pending poll, never the signal stream.
        break;
    }
  }

  private async flushPendingIce(): Promise<void> {
    const pc = this.pc;
    if (!pc) return;
    const queued = this.pendingIce;
    this.pendingIce = [];
    for (const cand of queued) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(cand));
      } catch {
        /* stale candidate — skip */
      }
    }
  }

  private clearRingTimer(): void {
    if (this.ringTimer) {
      clearTimeout(this.ringTimer);
      this.ringTimer = null;
    }
  }

  private failCall(reason: string): void {
    this.lastError = reason;
    this.clearRingTimer();
    this.ringtone.stop();
    this.cleanupCall();
    this.setState('failed');
  }

  /** Stop tracks, close the peer connection, drop the remote audio element. */
  private cleanupCall(): void {
    this.stopSignalPoll();
    this.ringtone.stop();
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          /* already stopped */
        }
      });
      this.localStream = null;
    }
    if (this.pc) {
      try {
        this.pc.close();
      } catch {
        /* already closed */
      }
      this.pc = null;
    }
    if (this.remoteAudio) {
      try {
        this.remoteAudio.srcObject = null;
        this.remoteAudio.remove();
      } catch {
        /* already gone */
      }
      this.remoteAudio = null;
    }
    this.pendingIce = [];
  }
}

/** One call at a time — the whole app shares this manager. */
export const voiceCall = new VoiceCallManager();
