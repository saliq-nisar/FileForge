import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { STORAGE_KEYS } from "@/lib/constants/storage-keys";

export type ThemePreference = "light" | "dark" | "system";
export type MotionPreference = "system" | "reduced" | "full";

export interface UserPreferences {
  theme: ThemePreference;
  motion: MotionPreference;
  defaultCompressionLevel: "low" | "recommended" | "strong";
  defaultImageQuality: number;
  defaultImageFormat: "original" | "jpeg" | "png" | "webp" | "avif";
  /** Record processed files in the local workspace (this browser only). */
  workspaceHistory: boolean;
  /** Also keep the processed files themselves (IndexedDB, this browser only). */
  workspaceKeepFiles: boolean;
  /** Auto-delete local workspace entries after N hours (0 = never). */
  autoDeleteHours: number;
  shortcutsEnabled: boolean;
  showShortcutHints: boolean;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  theme: "system",
  motion: "system",
  defaultCompressionLevel: "recommended",
  defaultImageQuality: 80,
  defaultImageFormat: "original",
  workspaceHistory: true,
  workspaceKeepFiles: false,
  autoDeleteHours: 24,
  shortcutsEnabled: true,
  showShortcutHints: true,
};

interface SettingsState extends UserPreferences {
  update: (patch: Partial<UserPreferences>) => void;
  reset: () => void;
}


export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_PREFERENCES,
      update: (patch) => set(patch),
      reset: () => set(DEFAULT_PREFERENCES),
    }),
    {
      name: STORAGE_KEYS.settings,
      version: 1,
      // Rehydrated after mount (AppShell) so server and first client render match.
      skipHydration: true,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ update: _u, reset: _r, ...prefs }) => prefs,
    },
  ),
);

export function applyAppearance(theme: ThemePreference, motion: MotionPreference): void {
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  if (motion === "system") document.documentElement.removeAttribute("data-motion");
  else document.documentElement.setAttribute("data-motion", motion);
}
