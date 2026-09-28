import { STORAGE_KEYS } from "@/lib/constants/storage-keys";
import { readJson, removeKey, writeJson } from "@/lib/storage/local";
import { nextAvailableNumber, type NumberingSettings } from "./calc";
import { KIND_CONFIG, type BusinessDocKind, type BusinessDocument, type Party } from "./model";

/**
 * Persistence for business documents. This local implementation keeps data in
 * this browser only; an account-backed repository can implement the same shape.
 */
export interface BusinessRepository {
  list(kind?: BusinessDocKind): BusinessDocument[];
  get(id: string): BusinessDocument | undefined;
  save(doc: BusinessDocument): void;
  remove(id: string): void;
}

export const businessRepository: BusinessRepository = {
  list(kind) {
    const all = readJson<BusinessDocument[]>(STORAGE_KEYS.businessDocs, []);
    return (kind ? all.filter((d) => d.kind === kind) : all).sort((a, b) => b.updatedAt - a.updatedAt);
  },
  get(id) {
    return readJson<BusinessDocument[]>(STORAGE_KEYS.businessDocs, []).find((d) => d.id === id);
  },
  save(doc) {
    const all = readJson<BusinessDocument[]>(STORAGE_KEYS.businessDocs, []);
    const i = all.findIndex((d) => d.id === doc.id);
    const next = { ...doc, updatedAt: Date.now() };
    if (i >= 0) all[i] = next;
    else all.push(next);
    if (!writeJson(STORAGE_KEYS.businessDocs, all)) throw new Error("storage full");
  },
  remove(id) {
    writeJson(STORAGE_KEYS.businessDocs, readJson<BusinessDocument[]>(STORAGE_KEYS.businessDocs, []).filter((d) => d.id !== id));
  },
};

// ---------- remembered business profile (opt-in) ----------
export interface BusinessProfile {
  party: Party;
  logo: string | null;
  currency: string;
  accent: string;
  paymentInstructions: string;
  terms: string;
}

export const loadProfile = (): BusinessProfile | null => readJson<BusinessProfile | null>(STORAGE_KEYS.businessProfile, null);
export const saveProfile = (p: BusinessProfile): boolean => writeJson(STORAGE_KEYS.businessProfile, p);
export const forgetProfile = (): void => removeKey(STORAGE_KEYS.businessProfile);

// ---------- numbering ----------
export function loadNumbering(kind: BusinessDocKind): NumberingSettings {
  const all = readJson<Partial<Record<BusinessDocKind, NumberingSettings>>>(STORAGE_KEYS.numbering, {});
  return all[kind] ?? { prefix: KIND_CONFIG[kind].prefix, includeYear: true, padding: 4, next: 1 };
}

export function saveNumbering(kind: BusinessDocKind, s: NumberingSettings): void {
  const all = readJson<Partial<Record<BusinessDocKind, NumberingSettings>>>(STORAGE_KEYS.numbering, {});
  writeJson(STORAGE_KEYS.numbering, { ...all, [kind]: s });
}

export function usedNumbers(kind: BusinessDocKind, exceptId?: string): Set<string> {
  return new Set(businessRepository.list(kind).filter((d) => d.id !== exceptId).map((d) => d.number));
}

export function suggestNumber(kind: BusinessDocKind): string {
  return nextAvailableNumber(loadNumbering(kind), usedNumbers(kind)).number;
}

/** After saving a new document, advance the counter past its number. */
export function advanceNumbering(kind: BusinessDocKind): void {
  const s = loadNumbering(kind);
  const { next } = nextAvailableNumber(s, usedNumbers(kind));
  saveNumbering(kind, { ...s, next });
}
