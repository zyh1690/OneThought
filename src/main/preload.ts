import { contextBridge, ipcRenderer } from "electron";
import type { AppConfig, QueryOptions, Thought } from "./types";

const api = {
  getConfig: (): Promise<AppConfig> => ipcRenderer.invoke("config:get"),
  updateConfig: (patch: Partial<AppConfig>) => ipcRenderer.invoke("config:update", patch),
  createThought: (payload: { content: string; tags?: string[]; source?: "quick_input" | "main_ui" }) =>
    ipcRenderer.invoke("thought:create", payload),
  updateThought: (id: string, patch: Partial<Thought>) => ipcRenderer.invoke("thought:update", id, patch),
  archiveThought: (id: string, archived: boolean) => ipcRenderer.invoke("thought:archive", id, archived),
  listThoughts: (options: QueryOptions) => ipcRenderer.invoke("thought:list", options),
  listAllThoughts: () => ipcRenderer.invoke("thought:listAll"),
  compactThoughts: () => ipcRenderer.invoke("thought:compact"),
  createBackup: (reason?: string) => ipcRenderer.invoke("backup:create", reason),
  listBackups: () => ipcRenderer.invoke("backup:list"),
  restoreBackup: (filename: string) => ipcRenderer.invoke("backup:restore", filename),
  generateLlm: (payload: {
    from: string;
    to: string;
    tags: string[];
    archived: boolean | null;
    type: "summary" | "mindmap";
    forceRefresh?: boolean;
  }) => ipcRenderer.invoke("llm:generate", payload),
  onThoughtUpdated: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("thought:updated", handler);
    return () => ipcRenderer.off("thought:updated", handler);
  }
};

contextBridge.exposeInMainWorld("oneThought", api);

export type OneThoughtApi = typeof api;
