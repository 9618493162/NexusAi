import { create } from "zustand";

/**
 * Version bump so components that gate on the localStorage onboarding flag
 * (which is not reactive) re-render the instant it changes — e.g. the app
 * shell mounts as soon as the user finishes onboarding, even when the
 * current route doesn't change.
 */
interface OnboardingState {
  version: number;
  bump: () => void;
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  version: 0,
  bump: () => set((s) => ({ version: s.version + 1 })),
}));
