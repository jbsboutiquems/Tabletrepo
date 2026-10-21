// AI Studio — Video tab. Veo via our own /api/studio/video endpoints
// (generate → poll status → download through the server proxy).
//
// Long renders survive tab switches and reloads: the in-flight operation
// name is persisted and polling resumes on mount. Polling stops after a
// sane cap (~30 min) or repeated check failures, with plain-language
// status the whole way — never a bare "Failed to fetch".
import React, { useState, useEffect, useRef } from 'react';
import { Video, Upload, Download, Clock } from 'lucide-react';
import { studioApi, fileToDataUrl, StudioNotConfiguredError } from './studioApi';
import { StudioSectionTitle, StudioError, StudioNotConfiguredCard, StudioGenerateButton, PromptTextarea, PINK, TEAL } from './StudioShared';

const POLL_INTERVAL_MS = 8000;
const MAX_POLLS = 225; // ~30 minutes — Veo renders rarely run longer
const MAX_POLL_FAILURES = 5; // consecutive check failures before we surface it
const INFLIGHT_OP_KEY = 'lifeos:studio:video:inflight';

function loadInflightOp(): string | null {
  try {
    return localStorage.getItem(INFLIGHT_OP_KEY);
  } catch {
    return null;
  }
}

function saveInflightOp(op: string | null) {
  try {
    if (op) localStorage.setItem(INFLIGHT_OP_KEY, op);
    else localStorage.removeItem(INFLIGHT_OP_KEY);
  } catch {
    /* ignore */
  }
}

export const VideoStudio: React.FC = () => {
  const [prompt, setPrompt] = useState('Cinematic aerial shot skimming over a misty pine forest into golden morning sunlight, slow and dreamy.');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [sourcePhoto, setSourcePhoto] = useState<string | null>(null);
  const [sourceMime, setSourceMime] = useState<string>('image/png');
  const [busy, setBusy] = useState(false);
  const [operationName, setOperationName] = useState<string | null>(null);
  const [statusText, setStatusText] = useState('');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);
  const failCountRef = useRef(0);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  // Resume a render that was still going when the tab unmounted or reloaded.
  useEffect(() => {
    const saved = loadInflightOp();
    if (saved) {
      setOperationName(saved);
      setStatusText('Picking up your render — checking progress…');
      startPolling(saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const pollStatus = async (opName: string) => {
    pollCountRef.current += 1;
    if (pollCountRef.current > MAX_POLLS) {
      stopPolling();
      saveInflightOp(null);
      setStatusText('');
      setError('That render ran long — it\u2019ll land in your studio library when it finishes. Safe to wander off.');
      return;
    }
    try {
      const res = await studioApi.videoStatus(opName);
      failCountRef.current = 0;
      if (res.done) {
        stopPolling();
        saveInflightOp(null);
        if (res.error) {
          const detail = typeof res.error === 'string' ? res.error : res.error?.message;
          setError(detail ? `The render hit a wall: ${detail}` : 'The render hit a wall on Google\u2019s side — try a simpler scene.');
          setStatusText('');
          return;
        }
        setStatusText('Render complete — pulling it down…');
        setDownloading(true);
        try {
          const url = await studioApi.downloadVideo(opName);
          setVideoUrl(url);
          setStatusText('Ready. Saved to your studio library.');
        } catch (dlErr: any) {
          setError(dlErr.message || 'Could not download the video.');
          setStatusText('');
        } finally {
          setDownloading(false);
        }
      } else {
        setStatusText('Rendering… this usually takes a few minutes. Feel free to wander off; I\u2019ll keep checking.');
      }
    } catch (e: any) {
      if (e instanceof StudioNotConfiguredError) {
        stopPolling();
        saveInflightOp(null);
        setNotConfigured(true);
        return;
      }
      // Transient check failures stay quiet for a while — then surface.
      failCountRef.current += 1;
      if (failCountRef.current >= MAX_POLL_FAILURES) {
        stopPolling();
        setStatusText('');
        setError('The progress check keeps failing — your render is still going on Google\u2019s side. Reopen this tab and I\u2019ll pick it back up.');
      }
    }
  };

  const startPolling = (opName: string) => {
    stopPolling();
    pollCountRef.current = 0;
    failCountRef.current = 0;
    pollRef.current = setInterval(() => pollStatus(opName), POLL_INTERVAL_MS);
    void pollStatus(opName);
  };

  const handleGenerate = async () => {
    stopPolling();
    setBusy(true);
    setVideoUrl(null);
    setOperationName(null);
    setStatusText('Sending your scene to the render farm…');
    setError(null);
    try {
      const res = await studioApi.generateVideo({
        prompt,
        aspectRatio,
        imageBase64: sourcePhoto || undefined,
        mimeType: sourceMime
      });
      setOperationName(res.operationName);
      saveInflightOp(res.operationName);
      setStatusText('Render started — checking progress…');
      startPolling(res.operationName);
    } catch (e: any) {
      if (e instanceof StudioNotConfiguredError) setNotConfigured(true);
      else setError(e.message || 'Video generation failed.');
      setStatusText('');
    } finally {
      setBusy(false);
    }
  };

  const handlePhotoPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setSourcePhoto(await fileToDataUrl(file));
      setSourceMime(file.type || 'image/png');
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (notConfigured) return <StudioNotConfiguredCard />;

  return (
    <div className="space-y-4">
      <StudioSectionTitle
        icon={<Video size={20} />}
        title="Video Studio"
        blurb="Type a scene, get a cinematic clip. Optionally start from one of your own photos."
      />
      <PromptTextarea value={prompt} onChange={setPrompt} placeholder="Describe the scene…" rows={3} />

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Frame:</span>
        {(['16:9', '9:16'] as const).map((a) => (
          <button
            key={a}
            onClick={() => setAspectRatio(a)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold border-2 transition ${
              aspectRatio === a ? 'text-white' : 'text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700'
            }`}
            style={aspectRatio === a ? { background: `linear-gradient(135deg, ${TEAL}, ${PINK})`, borderColor: 'transparent' } : undefined}
          >
            {a === '16:9' ? '16:9 landscape' : '9:16 vertical'}
          </button>
        ))}
        <label className="inline-flex items-center gap-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 cursor-pointer hover:border-pink-400">
          <Upload size={16} /> {sourcePhoto ? 'Swap start photo' : 'Start from a photo (optional)'}
          <input type="file" accept="image/*" className="hidden" onChange={handlePhotoPick} />
        </label>
        {sourcePhoto && (
          <img src={sourcePhoto} alt="video start frame" className="w-16 h-16 rounded-lg object-cover border border-slate-300 dark:border-slate-700" />
        )}
      </div>

      {error && <StudioError message={error} />}
      <StudioGenerateButton onClick={handleGenerate} busy={busy} busyLabel="Sending…" label="Render video" icon={<Video size={16} />} />

      {statusText && (
        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <Clock size={15} className="animate-pulse" style={{ color: TEAL }} />
          {statusText}
        </div>
      )}

      {videoUrl && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
          <video controls src={videoUrl} className="rounded-xl w-full max-h-[420px] bg-black" />
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500 dark:text-slate-400">Operation logged in your studio library — you can re-download it from there.</p>
            <a
              href={videoUrl}
              download={`offscript-video-${Date.now()}.mp4`}
              className="inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
              style={{ color: PINK }}
            >
              <Download size={14} /> Save to device
            </a>
          </div>
        </div>
      )}
      {!videoUrl && operationName && downloading && (
        <p className="text-sm text-slate-500 dark:text-slate-400">Fetching your finished render…</p>
      )}
    </div>
  );
};
