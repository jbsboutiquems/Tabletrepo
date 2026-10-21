import React, { useState, useEffect, useRef } from 'react';
import { Camera, MapPin, Clock, Loader2, AlertTriangle, Sparkles, Trophy, QrCode, ImagePlus, Navigation, Check } from 'lucide-react';
import { apiUrl } from '../services/api';
import { fileToDataUrl } from './studio/studioApi';
import {
  quantizeSpyPosition,
  difficultyLabel,
  difficultyTagline,
  parseSpyQrPayload,
  type SpyDifficulty,
  type QuantizedPosition,
} from '../game/ispy';

const TOKEN_KEY = 'lifeos:auth:token';

/** Best-effort authed fetch — mirrors FieldView's fieldApi. */
async function ispyApi(path: string, options: RequestInit = {}): Promise<any | null> {
  try {
    const token =
      sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
    const res = await fetch(apiUrl(path), {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...((options.headers as Record<string, string>) || {}),
      },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

interface ActiveSpy {
  id: string;
  posterId: string;
  photoUrl: string;
  hint: string;
  difficulty: SpyDifficulty;
  regionBucket: string;
  approxMiles: string;
  timeLeft: string;
  findCount: number;
  foundByMe: boolean;
}

const DIFFICULTY_STYLES: Record<SpyDifficulty, string> = {
  easy: 'bg-[#2da2ee]/15 text-[#2da2ee] border-[#2da2ee]/40',
  spicy: 'bg-amber-500/15 text-amber-500 border-amber-500/40',
  feral: 'bg-[#ea4798]/15 text-[#ea4798] border-[#ea4798]/40',
};

function locateOnce(): Promise<QuantizedPosition> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('This device does not share its location.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // Quantized client-side — raw coordinates never leave the device.
        resolve(
          quantizeSpyPosition({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          })
        );
      },
      (err) =>
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? 'Location permission was denied. I-Spy needs it to place the hunt.'
              : 'Could not get your location. Try again.'
          )
        ),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
    );
  });
}

export default function ISpyView() {
  const [spies, setSpies] = useState<ActiveSpy[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'locating' | 'posting' | 'claiming'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [position, setPosition] = useState<QuantizedPosition | null>(null);

  // Composer
  const [photoUrl, setPhotoUrl] = useState<string>('');
  const [hint, setHint] = useState('');
  const [difficulty, setDifficulty] = useState<SpyDifficulty>('spicy');
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const claimFileRef = useRef<HTMLInputElement>(null);
  const [photoClaimSpy, setPhotoClaimSpy] = useState<string | null>(null);

  // QR spot
  const [qrPayload, setQrPayload] = useState('');
  const [spotting, setSpotting] = useState(false);

  const loadSpies = async (pos: QuantizedPosition) => {
    setStatus('loading');
    setError(null);
    const data = await ispyApi(
      `/api/ispy/active?lat=${pos.latitude}&lng=${pos.longitude}`
    );
    if (!data) {
      setError('Could not load spies. Check your connection.');
      setStatus('idle');
      return;
    }
    setSpies(Array.isArray(data.spies) ? data.spies : []);
    setStatus('idle');
  };

  const locate = async (then?: (pos: QuantizedPosition) => void) => {
    setStatus('locating');
    setError(null);
    try {
      const pos = await locateOnce();
      setPosition(pos);
      setStatus('idle');
      if (then) then(pos);
    } catch (e: any) {
      setStatus('idle');
      setError(e?.message || 'Location failed.');
    }
  };

  useEffect(() => {
    locate((pos) => loadSpies(pos));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 6000);
  };

  // TODO(upload-pipeline): photo clues are base64 data URLs until a real
  // media upload endpoint exists. Guarded at 2MB client-side; a server-side
  // object store (S3/R2/etc.) should replace this before heavy use.
  const pickPhoto = async (file: File | undefined, onPick: (url: string) => void) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('That is not an image. Pick a photo.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Photo is over 2MB — shrink it first. (Real upload pipeline is still TODO.)');
      return;
    }
    setPhotoBusy(true);
    setError(null);
    try {
      onPick(await fileToDataUrl(file));
    } catch {
      setError('Could not read that photo.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const postSpy = async () => {
    if (!photoUrl) {
      setError('A spy needs a photo clue. No photo, no hunt.');
      return;
    }
    setStatus('posting');
    setError(null);
    try {
      const pos = position ?? (await locateOnce());
      setPosition(pos);
      const data = await ispyApi('/api/ispy', {
        method: 'POST',
        body: JSON.stringify({
          photoUrl,
          hint: hint.trim(),
          difficulty,
          lat: pos.latitude,
          lng: pos.longitude,
        }),
      });
      if (!data?.spy) {
        setError('Could not post that spy. Try again.');
        return;
      }
      setPhotoUrl('');
      setHint('');
      flash(
        `Spy posted. +${data.points?.poster ?? 15} Khaos points. Now go touch grass.`
      );
      loadSpies(pos);
    } catch (e: any) {
      setError(e?.message || 'Posting failed.');
    } finally {
      setStatus('idle');
    }
  };

  const claimFind = async (spyId: string, method: 'gps' | 'photo', proofPhotoUrl?: string) => {
    setStatus('claiming');
    setError(null);
    try {
      const pos = position ?? (await locateOnce());
      setPosition(pos);
      const body: Record<string, unknown> = { lat: pos.latitude, lng: pos.longitude, method };
      if (proofPhotoUrl) body.proofPhotoUrl = proofPhotoUrl;
      const data = await ispyApi(`/api/ispy/${encodeURIComponent(spyId)}/find`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (!data?.ok) {
        setError(data?.error || 'Claim rejected. Are you close enough?');
        return;
      }
      const pts = data.points ?? {};
      flash(
        data.firstFinder
          ? `FOUND IT. First blood! +${pts.find ?? 20} Khaos points + ${pts.bonus ?? 10} first-finder bonus.`
          : `Found it! +${pts.find ?? 20} Khaos points.`
      );
      loadSpies(pos);
    } catch (e: any) {
      setError(e?.message || 'Claim failed.');
    } finally {
      setStatus('idle');
    }
  };

  /** Photo-proof button: remember which spy, then open the single hidden picker. */
  const startPhotoClaim = (spyId: string) => {
    setPhotoClaimSpy(spyId);
    claimFileRef.current?.click();
  };

  const spotSticker = async () => {
    const ownerId = parseSpyQrPayload(qrPayload);
    if (!ownerId) {
      setError('That QR code is not a "Spy Me!" sticker. Format is ispy:<owner>.');
      return;
    }
    setSpotting(true);
    setError(null);
    const data = await ispyApi('/api/ispy/spot', {
      method: 'POST',
      body: JSON.stringify({ qrPayload: qrPayload.trim() }),
    });
    setSpotting(false);
    if (!data?.ok) {
      setError(data?.error || 'Spot failed. Try again.');
      return;
    }
    flash(
      `Spotted! +${data.points?.spotter ?? 10} Khaos points for you, +${data.points?.owner ?? 10} for the sticker owner.`
    );
    setQrPayload('');
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-black tracking-tight">I-Spy</h2>
        <p className="text-sm text-stone-500 dark:text-stone-400 max-w-md mx-auto">
          Spot something weird. Dare someone to find it. 10-mile radius, 5 minutes,
          zero mercy.
        </p>
      </div>

      {notice && (
        <div className="max-w-md mx-auto p-4 rounded-2xl bg-[#2da2ee]/10 border-2 border-[#2da2ee]/40 text-sm font-bold text-center flex items-center justify-center gap-2">
          <Sparkles className="w-4 h-4 text-[#2da2ee]" /> {notice}
        </div>
      )}
      {error && (
        <p className="text-sm font-bold text-rose-600 dark:text-rose-400 flex items-center justify-center gap-1.5 max-w-md mx-auto text-center">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </p>
      )}

      {/* Composer */}
      <div className="max-w-md mx-auto p-5 rounded-2xl border-2 border-stone-300 dark:border-white/15 space-y-4">
        <h3 className="font-black flex items-center gap-2">
          <Camera className="w-5 h-5 text-[#ea4798]" /> Post a spy
        </h3>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            pickPhoto(e.target.files?.[0], setPhotoUrl);
            e.target.value = '';
          }}
        />
        {photoUrl ? (
          <div className="relative">
            <img src={photoUrl} alt="Spy photo clue" className="w-full rounded-xl object-cover max-h-56" />
            <button
              onClick={() => setPhotoUrl('')}
              className="absolute top-2 right-2 px-2 py-1 rounded-lg text-xs font-bold bg-black/60 text-white"
            >
              Retake
            </button>
          </div>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            disabled={photoBusy}
            className="w-full p-6 rounded-2xl border-2 border-dashed border-stone-300 dark:border-white/15 flex flex-col items-center gap-2 text-stone-500 dark:text-stone-400 hover:border-[#ea4798] transition"
          >
            {photoBusy ? <Loader2 className="w-6 h-6 animate-spin" /> : <ImagePlus className="w-6 h-6" />}
            <span className="text-sm font-bold">Add a photo clue</span>
            <span className="text-xs">Crop it weird. Make them work for it.</span>
          </button>
        )}

        <input
          value={hint}
          onChange={(e) => setHint(e.target.value)}
          maxLength={140}
          placeholder="Optional hint… keep it cryptic"
          className="w-full px-4 py-2.5 rounded-xl border-2 border-stone-300 dark:border-white/15 bg-transparent text-sm"
        />

        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-stone-500 dark:text-stone-400 mb-2">Difficulty</p>
          <div className="flex gap-2">
            {(['easy', 'spicy', 'feral'] as SpyDifficulty[]).map((d) => (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                title={difficultyTagline(d)}
                className={`flex-1 px-3 py-2 rounded-xl text-sm font-black border-2 transition ${
                  difficulty === d ? DIFFICULTY_STYLES[d] : 'border-stone-300 dark:border-white/15 opacity-60'
                }`}
              >
                {difficultyLabel(d)}
              </button>
            ))}
          </div>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">{difficultyTagline(difficulty)}</p>
        </div>

        <button
          onClick={postSpy}
          disabled={status === 'posting' || !photoUrl}
          className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl font-black text-white bg-gradient-to-r from-[#2da2ee] to-[#ea4798] hover:brightness-110 disabled:opacity-60 transition shadow-lg"
        >
          {status === 'posting' ? <Loader2 className="w-5 h-5 animate-spin" /> : <MapPin className="w-5 h-5" />}
          Drop the spy
        </button>
      </div>

      {/* Feed */}
      <div className="max-w-md mx-auto space-y-4">
        <input
          ref={claimFileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const spyId = photoClaimSpy;
            pickPhoto(e.target.files?.[0], (url) => {
              if (spyId) claimFind(spyId, 'photo', url);
            });
            e.target.value = '';
          }}
        />
        <div className="flex items-center justify-between">
          <h3 className="font-black">Live spies near you</h3>
          <button
            onClick={() => position && loadSpies(position)}
            disabled={status === 'loading'}
            className="text-xs font-bold text-[#2da2ee] hover:underline disabled:opacity-60"
          >
            {status === 'loading' ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        {status === 'loading' && spies.length === 0 && (
          <div className="text-center p-8 text-stone-500 dark:text-stone-400">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
            <p className="text-sm">Scanning the neighborhood…</p>
          </div>
        )}

        {status === 'idle' && spies.length === 0 && (
          <div className="text-center p-8 rounded-2xl border-2 border-dashed border-stone-300 dark:border-white/15">
            <p className="font-bold">No spies in your 10 miles.</p>
            <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
              Be the chaos you want to see. Post the first one.
            </p>
          </div>
        )}

        {spies.map((spy) => (
          <div key={spy.id} className="rounded-2xl border-2 border-stone-300 dark:border-white/15 overflow-hidden">
            <img src={spy.photoUrl} alt="Spy photo clue" className="w-full object-cover max-h-64" />
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`px-2.5 py-1 rounded-full text-xs font-black border-2 ${DIFFICULTY_STYLES[spy.difficulty]}`}>
                  {difficultyLabel(spy.difficulty)}
                </span>
                <span className="text-xs text-stone-500 dark:text-stone-400 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> {spy.timeLeft || 'live now'}
                </span>
                <span className="text-xs text-stone-500 dark:text-stone-400 flex items-center gap-1">
                  <Navigation className="w-3.5 h-3.5" /> {spy.regionBucket} · {spy.approxMiles}
                </span>
              </div>
              {spy.hint && <p className="text-sm italic text-stone-600 dark:text-stone-300">“{spy.hint}”</p>}
              <div className="flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
                <Trophy className="w-3.5 h-3.5 text-[#ea4798]" />
                {spy.findCount === 0 ? 'Nobody found it yet. Could be you.' : `${spy.findCount} found it${spy.foundByMe ? ' — including you' : ''}`}
              </div>

              {!spy.foundByMe && (
                <div className="flex gap-2">
                  <button
                    onClick={() => claimFind(spy.id, 'gps')}
                    disabled={status === 'claiming'}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-black text-white bg-[#2da2ee] hover:brightness-110 disabled:opacity-60 transition"
                  >
                    {status === 'claiming' ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <MapPin className="w-4 h-4" />
                    )}
                    I was there
                  </button>
                  <button
                    onClick={() => startPhotoClaim(spy.id)}
                    disabled={status === 'claiming' || photoBusy}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-black text-white bg-[#ea4798] hover:brightness-110 disabled:opacity-60 transition"
                  >
                    <Camera className="w-4 h-4" />
                    Matching photo
                  </button>
                </div>
              )}
              {spy.foundByMe && (
                <p className="text-xs font-bold text-[#2da2ee] flex items-center gap-1.5">
                  <Check className="w-4 h-4" /> You cracked this one. Khaos points secured.
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Spy Me! sticker redeem */}
      <div className="max-w-md mx-auto p-5 rounded-2xl border-2 border-dashed border-[#ea4798]/50 space-y-3">
        <h3 className="font-black flex items-center gap-2">
          <QrCode className="w-5 h-5 text-[#ea4798]" /> "Spy Me!" sticker spot
        </h3>
        <p className="text-xs text-stone-500 dark:text-stone-400">
          See a "Spy Me!" bumper sticker in the wild? Paste its code. You both get Khaos points.
        </p>
        <div className="flex gap-2">
          <input
            value={qrPayload}
            onChange={(e) => setQrPayload(e.target.value)}
            placeholder="ispy:owner123"
            className="flex-1 px-4 py-2.5 rounded-xl border-2 border-stone-300 dark:border-white/15 bg-transparent text-sm font-mono"
          />
          <button
            onClick={spotSticker}
            disabled={spotting || !qrPayload.trim()}
            className="px-4 py-2.5 rounded-xl font-black text-white bg-gradient-to-r from-[#2da2ee] to-[#ea4798] hover:brightness-110 disabled:opacity-60 transition"
          >
            {spotting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Spot it'}
          </button>
        </div>
      </div>
    </div>
  );
}
