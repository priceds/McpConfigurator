import { contextBridge, ipcRenderer } from "electron";
import type { AppApi, McpServerDraft, TargetKind } from "../shared/types";

const api: AppApi = {
  detectTargets: () => ipcRenderer.invoke("mcp:detect-targets"),
  validateServerDraft: (draft: McpServerDraft) => ipcRenderer.invoke("mcp:validate", draft),
  testServerDraft: (draft: McpServerDraft, target: TargetKind) =>
    ipcRenderer.invoke("mcp:test", draft, target),
  previewConfigPatch: (draft: McpServerDraft, targets: TargetKind[]) =>
    ipcRenderer.invoke("mcp:preview", draft, targets),
  applyConfigPatch: (draft: McpServerDraft, targets: TargetKind[]) =>
    ipcRenderer.invoke("mcp:apply", draft, targets),
  listManagedServers: () => ipcRenderer.invoke("mcp:list-managed"),
  removeManagedServer: (id: string, targets?: TargetKind[]) =>
    ipcRenderer.invoke("mcp:remove", id, targets),
  listPresets: () => ipcRenderer.invoke("mcp:list-presets")
};

contextBridge.exposeInMainWorld("mcpConfigurator", api);
