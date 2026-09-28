import { create } from "zustand";
import { persist } from "zustand/middleware";
import { STORAGE_KEYS } from "@/lib/constants/storage-keys";

/** Pure UI state — kept separate from file processing and user data. */
interface UiState {
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  searchOpen: boolean;
  setSidebarCollapsed: (v: boolean) => void;
  setMobileNavOpen: (v: boolean) => void;
  setSearchOpen: (v: boolean) => void;
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      mobileNavOpen: false,
      searchOpen: false,
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
      setSearchOpen: (searchOpen) => set({ searchOpen }),
    }),
    { name: STORAGE_KEYS.ui, skipHydration: true, partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed }) },
  ),
);
