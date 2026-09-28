import { create } from "zustand";
import { localWorkspaceRepository, type WorkspaceItem, type WorkspaceRepository } from "@/services/storage/workspace-repository";
import { useSettings } from "./settings-store";
import { FORMATS } from "@/lib/file/formats";
import type { FileKind } from "@/types/files";
import type { ProcessResult } from "@/types/processing";
import type { ToolDefinition } from "@/types/tools";

interface WorkspaceState {
  items: WorkspaceItem[];
  loaded: boolean;
  load: () => Promise<void>;
  record: (tool: ToolDefinition, inputs: File[], result: ProcessResult) => Promise<void>;
  rename: (id: string, name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  clear: () => Promise<void>;
}

const repo: WorkspaceRepository = localWorkspaceRepository;

function familyOfMime(mime: string): WorkspaceItem["family"] {
  const base = mime.split(";")[0];
  const kind = (Object.keys(FORMATS) as FileKind[]).find((k) => FORMATS[k].mime === base);
  return kind ? FORMATS[kind].family : base.startsWith("text/") ? "text" : "other";
}

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  items: [],
  loaded: false,
  load: async () => {
    try {
      const { autoDeleteHours } = useSettings.getState();
      if (autoDeleteHours > 0) await repo.pruneOlderThan(autoDeleteHours * 3_600_000);
      set({ items: await repo.list(), loaded: true });
    } catch {
      set({ loaded: true }); // IndexedDB unavailable (private mode): workspace simply stays empty
    }
  },
  record: async (tool, inputs, result) => {
    const { workspaceHistory, workspaceKeepFiles } = useSettings.getState();
    if (!workspaceHistory) return;
    const originalSize = inputs.reduce((a, f) => a + f.size, 0);
    const tags: WorkspaceItem["tags"] = [];
    if (tool.category === "compression" || tool.alsoIn?.includes("compression")) tags.push("compressed");
    if (tool.category === "conversion" || tool.alsoIn?.includes("conversion")) tags.push("converted");
    const created: WorkspaceItem[] = [];
    try {
      for (const file of result.files) {
        const item: WorkspaceItem = {
          id: crypto.randomUUID(),
          name: file.name,
          mime: file.mime,
          family: familyOfMime(file.mime),
          size: file.size,
          originalSize: result.files.length === 1 ? originalSize : undefined,
          createdAt: Date.now(),
          toolSlug: tool.slug,
          toolName: tool.name,
          status: "completed",
          tags,
          hasBlob: workspaceKeepFiles,
          sourceNames: inputs.map((f) => f.name),
        };
        await repo.put(item, workspaceKeepFiles ? file.blob : undefined);
        created.push(item);
      }
      set({ items: [...created, ...get().items] });
    } catch {
      /* storage quota or unavailable — recording history is best-effort */
    }
  },
  rename: async (id, name) => {
    await repo.rename(id, name);
    set({ items: get().items.map((i) => (i.id === id ? { ...i, name } : i)) });
  },
  remove: async (id) => {
    await repo.remove(id);
    set({ items: get().items.filter((i) => i.id !== id) });
  },
  clear: async () => {
    await repo.clear();
    set({ items: [] });
  },
}));

export const getWorkspaceBlob = (id: string) => repo.getBlob(id);
