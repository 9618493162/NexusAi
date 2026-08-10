// Shared speech playback manager. Only one spoken reply plays at a time: any
// new playback (auto-spoken reply, replay button) cuts off whatever is playing,
// so rapid messages never produce overlapping voices.

let currentAudio: HTMLAudioElement | null = null;

export function stopCurrentSpeech(): void {
  if (currentAudio) {
    const audio = currentAudio;
    currentAudio = null;
    try { audio.pause(); } catch { /* ignore */ }
    // Fire the end handler so the interrupted caller can reset its UI state
    // (e.g. the replay button's progress bar and playing flag).
    try { audio.dispatchEvent(new Event("ended")); } catch { /* ignore */ }
  }
  try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
}

interface PlaySpeechOptions {
  onEnd?: () => void;
  onError?: () => void;
}

// Stops any current playback, then plays the blob. Returns the Audio element
// so callers can attach progress listeners. The object URL is revoked and the
// registry cleaned up automatically when playback ends or fails.
export function playSpeech(blob: Blob, options?: PlaySpeechOptions): HTMLAudioElement {
  stopCurrentSpeech();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  currentAudio = audio;
  const finish = () => {
    if (currentAudio === audio) currentAudio = null;
    URL.revokeObjectURL(url);
    options?.onEnd?.();
  };
  audio.onended = finish;
  audio.onerror = () => {
    finish();
    options?.onError?.();
  };
  audio.play().catch(() => {
    finish();
    options?.onError?.();
  });
  return audio;
}
