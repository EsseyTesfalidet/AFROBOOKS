'use client';

import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { Download, Share, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function subscribeDisplayMode(onChange: () => void) {
  const standalone = window.matchMedia('(display-mode: standalone)');
  standalone.addEventListener('change', onChange);
  return () => standalone.removeEventListener('change', onChange);
}

function getInstallEnvironment() {
  if (window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true) return 'standalone';
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ? 'ios' : 'browser';
}

export default function InstallPWA() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const environment = useSyncExternalStore(subscribeDisplayMode, getInstallEnvironment, () => 'browser');
  const isIOS = environment === 'ios';
  const [installing, setInstalling] = useState(false);
  const guide = useRef<HTMLDialogElement>(null);
  const guideId = useId();
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed || environment === 'standalone' || (!isIOS && !prompt)) return null;

  async function handleInstall() {
    if (isIOS) {
      guide.current?.showModal();
      return;
    }
    if (!prompt) return;
    setInstalling(true);
    try {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === 'accepted') setInstalled(true);
    } catch {
      // The browser can withdraw a previously offered installation prompt.
    } finally {
      setPrompt(null);
      setInstalling(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleInstall}
        disabled={installing}
        aria-label="Install AfroBooks"
        aria-haspopup={isIOS ? 'dialog' : undefined}
        aria-controls={isIOS ? guideId : undefined}
        title="Install AfroBooks"
        className="flex h-11 w-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-[#342c20] bg-[#231e16] text-xs font-medium text-[#e9bd73] transition-opacity hover:opacity-80 focus-visible:outline-[#e9bd73] disabled:opacity-50 sm:w-auto sm:px-3"
      >
        <Download size={16} aria-hidden="true" />
        <span className="hidden sm:inline">Install App</span>
      </button>
      {isIOS && (
        <dialog
          ref={guide}
          id={guideId}
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          className="m-auto max-h-[calc(100dvh-2rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl border border-[#342c20] bg-[#141412] p-5 text-[#f5f2eb] shadow-2xl backdrop:bg-black/70 sm:p-6"
          onClick={event => {
            if (event.target !== event.currentTarget) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            if (event.clientX < bounds.left || event.clientX > bounds.right ||
                event.clientY < bounds.top || event.clientY > bounds.bottom) guide.current?.close();
          }}
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <h2 id={titleId} className="pt-2 text-lg font-semibold leading-snug">Add AfroBooks to your Home Screen</h2>
            <button type="button" onClick={() => guide.current?.close()} aria-label="Close installation instructions"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[#a8a49c] hover:bg-white/5 focus-visible:outline-[#e9bd73]">
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          <p id={descriptionId} className="mb-5 text-sm leading-relaxed text-[#a8a49c]">
            Open afrobs.com in Safari on your iPhone or iPad, then:
          </p>
          <ol className="list-decimal space-y-4 pl-5 text-sm leading-relaxed marker:text-[#e9bd73]">
            <li className="pl-1">Open the <strong>Share</strong> menu <Share size={16} className="inline-block align-text-bottom text-[#e9bd73]" aria-hidden="true" />. It may be inside Safari&apos;s page menu.</li>
            <li className="pl-1">Choose <strong>Add to Home Screen</strong>. If it is missing, scroll down to <strong>Edit Actions</strong> to add it.</li>
            <li className="pl-1">Leave <strong>Open as Web App</strong> on if shown, then tap <strong>Add</strong>.</li>
          </ol>
          <button type="button" onClick={() => guide.current?.close()}
            className="mt-6 min-h-11 w-full rounded-xl bg-[#e9bd73] px-4 py-3 text-sm font-semibold text-[#141412] hover:bg-[#f1cd91] focus-visible:outline-[#f5f2eb]">
            Got it
          </button>
        </dialog>
      )}
    </>
  );
}
