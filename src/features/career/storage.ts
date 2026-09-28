import { STORAGE_KEYS } from "@/lib/constants/storage-keys";
import { readJson, removeKey, writeJson } from "@/lib/storage/local";
import type { Resume } from "./resume-model";

/**
 * Resume data is sensitive. Versions are stored only when the user explicitly
 * saves them ("Save to My Resumes"), and only in this browser. The working
 * draft lives in sessionStorage and disappears when the tab is closed.
 */
export const resumeRepository = {
  list(): Resume[] {
    return readJson<Resume[]>(STORAGE_KEYS.resumes, []).sort((a, b) => b.updatedAt - a.updatedAt);
  },
  get(id: string): Resume | undefined {
    return this.list().find((r) => r.id === id);
  },
  save(r: Resume): boolean {
    const all = readJson<Resume[]>(STORAGE_KEYS.resumes, []);
    const i = all.findIndex((x) => x.id === r.id);
    const next = { ...r, updatedAt: Date.now() };
    if (i >= 0) all[i] = next;
    else all.push(next);
    return writeJson(STORAGE_KEYS.resumes, all);
  },
  remove(id: string): void {
    writeJson(STORAGE_KEYS.resumes, readJson<Resume[]>(STORAGE_KEYS.resumes, []).filter((r) => r.id !== id));
  },
};

export const draftStore = {
  load: (): Resume | null => readJson<Resume | null>(STORAGE_KEYS.resumeDraft, null, "session"),
  save: (r: Resume) => writeJson(STORAGE_KEYS.resumeDraft, r, "session"),
  clear: () => removeKey(STORAGE_KEYS.resumeDraft, "session"),
};

export interface SavedJobDescription {
  id: string;
  title: string;
  text: string;
  savedAt: number;
}

export interface SavedAnalysis {
  id: string;
  resumeName: string;
  jobTitle: string | null;
  score: number;
  match: number | null;
  savedAt: number;
}

export interface SavedCoverLetter {
  id: string;
  company: string;
  jobTitle: string;
  body: string;
  savedAt: number;
}

function collection<T extends { id: string }>(key: string) {
  return {
    list: (): T[] => readJson<T[]>(key, []),
    add: (item: T) => writeJson(key, [item, ...readJson<T[]>(key, []).filter((x) => x.id !== item.id)].slice(0, 100)),
    remove: (id: string) => writeJson(key, readJson<T[]>(key, []).filter((x) => x.id !== id)),
    clear: () => removeKey(key),
  };
}

export const jobDescriptions = collection<SavedJobDescription>(STORAGE_KEYS.jobDescriptions);
export const analyses = collection<SavedAnalysis>(STORAGE_KEYS.analyses);
export const coverLetters = collection<SavedCoverLetter>(STORAGE_KEYS.coverLetters);

/** Delete every piece of career data stored in this browser. */
export function clearAllCareerData(): void {
  removeKey(STORAGE_KEYS.resumes);
  draftStore.clear();
  jobDescriptions.clear();
  analyses.clear();
  coverLetters.clear();
}
