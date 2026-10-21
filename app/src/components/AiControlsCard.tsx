// AI Controls — master Gemini consent + per-feature toggles.
//
// Master switch on top; per-feature toggles below. Everything defaults OFF:
// nothing generative runs until the user says so, feature by feature.
// Mount in settings: <AiControlsCard userId={user.id} />
import React, { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  MessageCircle,
  Image as ImageIcon,
  Video,
  Music,
  Mic,
  Activity,
} from 'lucide-react';
import {
  AiFeature,
  AI_FEATURES,
  AI_CONSENT_CHANGED_EVENT,
  AI_FEATURES_CHANGED_EVENT,
  getAiConsent,
  setAiConsent,
  setAiConsentUser,
  getAiFeatures,
  setAiFeature,
} from '../services/aiConsent';

interface Props {
  userId?: string | null;
}

const FEATURE_META: Record<AiFeature, { title: string; blurb: string; Icon: React.ComponentType<{ size?: number | string; className?: string }> }> = {
  chat: {
    title: 'Gemini chat',
    blurb: 'A real back-and-forth conversation. Separate from The Intent.',
    Icon: MessageCircle,
  },
  image: {
    title: 'Image Studio',
    blurb: 'Make images from text prompts.',
    Icon: ImageIcon,
  },
  video: {
    title: 'Video Studio',
    blurb: 'Make short video clips.',
    Icon: Video,
  },
  music: {
    title: 'Music Studio',
    blurb: 'Make music and sound bits.',
    Icon: Music,
  },
  transcribe: {
    title: 'Transcription',
    blurb: 'Turn voice notes into text.',
    Icon: Mic,
  },
  diagnose: {
    title: 'Gemini diagnostics',
    blurb: 'Let Gemini help read your patterns in The Intent.',
    Icon: Activity,
  },
};

function Toggle({
  on,
  onChange,
  disabled,
  label,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
        on ? 'bg-[#ea4798]' : 'bg-stone-300'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
          on ? 'left-[22px]' : 'left-0.5'
        }`}
      />
    </button>
  );
}

export const AiControlsCard: React.FC<Props> = ({ userId }) => {
  const [consent, setConsentState] = useState<'unknown' | 'granted' | 'declined'>(() => getAiConsent(userId));
  const [features, setFeaturesState] = useState<Record<AiFeature, boolean>>(() => getAiFeatures(userId));

  const refresh = useCallback(() => {
    setConsentState(getAiConsent(userId));
    setFeaturesState(getAiFeatures(userId));
  }, [userId]);

  useEffect(() => {
    setAiConsentUser(userId ?? null);
    refresh();
  }, [userId, refresh]);

  useEffect(() => {
    window.addEventListener(AI_CONSENT_CHANGED_EVENT, refresh);
    window.addEventListener(AI_FEATURES_CHANGED_EVENT, refresh);
    return () => {
      window.removeEventListener(AI_CONSENT_CHANGED_EVENT, refresh);
      window.removeEventListener(AI_FEATURES_CHANGED_EVENT, refresh);
    };
  }, [refresh]);

  const masterOn = consent === 'granted';

  const flipMaster = (next: boolean) => {
    setAiConsent(userId, next ? 'granted' : 'declined');
    refresh();
  };

  const flipFeature = (f: AiFeature, next: boolean) => {
    setAiFeature(userId, f, next);
    refresh();
  };

  return (
    <div className="w-full rounded-2xl border-2 border-[#ea4798]/40 bg-[#faf7f0] dark:bg-[#000a15] p-6 shadow-xl">
      <div className="flex items-center gap-3 mb-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#ea4798] to-[#2da2ee] text-white shrink-0">
          <Sparkles size={20} />
        </span>
        <div>
          <h2 className="text-lg font-black text-slate-900 dark:text-stone-100">AI Controls</h2>
          <p className="text-xs text-slate-500 dark:text-stone-400">
            Nothing generative runs until you say so.
          </p>
        </div>
      </div>

      {/* Master switch */}
      <div className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-stone-200 dark:border-stone-700 bg-white/60 dark:bg-white/5 px-4 py-3">
        <div>
          <p className="text-sm font-bold text-slate-900 dark:text-stone-100">Google Gemini</p>
          <p className="text-xs text-slate-500 dark:text-stone-400">
            The master switch. Flip it on, then pick which features get to play.
          </p>
        </div>
        <Toggle on={masterOn} onChange={flipMaster} label="Google Gemini master switch" />
      </div>

      {/* Per-feature toggles */}
      <div className={`mt-3 space-y-2 ${masterOn ? '' : 'opacity-60'}`}>
        {AI_FEATURES.map((f) => {
          const meta = FEATURE_META[f];
          const Icon = meta.Icon;
          return (
            <div
              key={f}
              className="flex items-center justify-between gap-4 rounded-xl border border-stone-200 dark:border-stone-700 bg-white/60 dark:bg-white/5 px-4 py-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#2da2ee]/15 text-[#2da2ee] shrink-0">
                  <Icon size={16} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 dark:text-stone-100">{meta.title}</p>
                  <p className="text-xs text-slate-500 dark:text-stone-400 truncate">{meta.blurb}</p>
                </div>
              </div>
              <Toggle
                on={masterOn && features[f]}
                onChange={(next) => flipFeature(f, next)}
                disabled={!masterOn}
                label={`${meta.title} toggle`}
              />
            </div>
          );
        })}
      </div>

      {!masterOn && (
        <p className="mt-3 text-xs text-slate-500 dark:text-stone-400">
          Flip the master switch to unlock the feature toggles.
        </p>
      )}
      <p className="mt-2 text-[11px] text-slate-400 dark:text-stone-500">
        Saying no is fine — the rest of the app works exactly the same. Gemini only
        ever sees what you submit to a feature you've switched on.
      </p>
    </div>
  );
};
