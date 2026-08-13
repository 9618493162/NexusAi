/**
 * Onboarding completion state, kept per-user in localStorage.
 *
 * The backend has no onboarding field, so per the "prefer safe frontend
 * persistence before touching the database" rule this lives client-side,
 * keyed by user id — switching accounts on the same device re-shows the
 * flow only for accounts that haven't completed it.
 */
import { useOnboardingStore } from "@/store/onboarding.store";

export interface OnboardingRecord {
  /** Epoch ms when the user finished (or skipped) onboarding. */
  completedAt: number;
  /** Interest ids chosen in step 2 (used to personalize the dashboard). */
  interests: string[];
}

const KEY = "nexusai-onboarding";

type OnboardingMap = Record<string, OnboardingRecord>;

function readAll(): OnboardingMap {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed as OnboardingMap;
    }
  } catch {
    /* storage unavailable/corrupt — treat as no onboarding */
  }
  return {};
}

function writeAll(map: OnboardingMap): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* storage unavailable — ignore; onboarding would re-show next time */
  }
}

export function isOnboarded(userId: string): boolean {
  const record = readAll()[userId];
  return !!record && typeof record.completedAt === "number";
}

export function completeOnboarding(userId: string, interests: string[]): void {
  const map = readAll();
  map[userId] = { completedAt: Date.now(), interests: interests.slice(0, 8) };
  writeAll(map);
  // Notify reactive consumers (the onboarding gate) so the app shell mounts
  // immediately instead of waiting for a route change.
  useOnboardingStore.getState().bump();
}

/** Interests chosen during onboarding for this user (empty if skipped/none). */
export function getOnboardingInterests(userId: string): string[] {
  return readAll()[userId]?.interests ?? [];
}
