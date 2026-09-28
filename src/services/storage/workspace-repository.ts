import { createStore, del, entries, get, set, delMany, type UseStore } from "idb-keyval";
import type { FileFamily } from "@/types/files";

export type WorkspaceTag = "converted" | "compressed";

export interface WorkspaceItem {
  id: string;
  name: string;
  mime: string;
  family: FileFamily;
  size: number;
  originalSize?: number;
  createdAt: number;
  toolSlug: string;
  toolName: string;
  status: "completed" | "failed";
  tags: WorkspaceTag[];
  /** True when the processed file itself is stored locally and can be re-downloaded. */
  hasBlob: boolean;
  sourceNames: string[];
}

/**
 * Persistence boundary for the workspace. The default keeps everything in this
 * browser's IndexedDB (nothing is uploaded). A server/account-backed repository
 * can implement the same interface once authentication exists.
 */
export interface WorkspaceRepository {
  list(): Promise<WorkspaceItem[]>;
  put(item: WorkspaceItem, blob?: Blob): Promise<void>;
  rename(id: string, name: string): Promise<void>;
  remove(id: string): Promise<void>;
  getBlob(id: string): Promise<Blob | undefined>;
  clear(): Promise<void>;
  pruneOlderThan(ms: number): Promise<number>;
}

let store: UseStore | null = null;
const db = () => (store ??= createStore("fileforge-workspace", "items"));

export const localWorkspaceRepository: WorkspaceRepository = {
  async list() {
    const all = await entries<string, WorkspaceItem | Blob>(db());
    return all
      .filter(([k]) => typeof k === "string" && k.startsWith("item:"))
      .map(([, v]) => v as WorkspaceItem)
      .sort((a, b) => b.createdAt - a.createdAt);
  },
  async put(item, blob) {
    await set(`item:${item.id}`, item, db());
    if (blob) await set(`blob:${item.id}`, blob, db());
  },
  async rename(id, name) {
    const item = await get<WorkspaceItem>(`item:${id}`, db());
    if (item) await set(`item:${id}`, { ...item, name }, db());
  },
  async remove(id) {
    await del(`item:${id}`, db());
    await del(`blob:${id}`, db());
  },
  async getBlob(id) {
    return get<Blob>(`blob:${id}`, db());
  },
  async clear() {
    const all = await entries(db());
    await delMany(all.map(([k]) => k), db());
  },
  async pruneOlderThan(ms) {
    const cutoff = Date.now() - ms;
    const items = await this.list();
    const old = items.filter((i) => i.createdAt < cutoff);
    await delMany(old.flatMap((i) => [`item:${i.id}`, `blob:${i.id}`]), db());
    return old.length;
  },
};
