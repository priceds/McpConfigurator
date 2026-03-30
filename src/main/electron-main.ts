import { app, BrowserWindow, ipcMain, nativeTheme } from "electron";
import path from "node:path";
import { ManagedStore } from "./services/managed-store";
import { McpService } from "./services/mcp-service";
import { PRESETS } from "./services/presets";
import type { McpServerDraft, TargetKind } from "../shared/types";

const managedStore = new ManagedStore(path.join(app.getPath("userData"), "managed-servers.json"));
const mcpService = new McpService(managedStore);

function createWindow(): BrowserWindow {
  nativeTheme.themeSource = "dark";

  const window = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1200,
    minHeight: 760,
    title: "MCP Configurator",
    backgroundColor: "#09111f",
    vibrancy: "under-window",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "electron-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    void window.loadURL(devServerUrl);
    window.webContents.openDevTools({ mode: "detach" });
  } else {
    void window.loadFile(path.join(app.getAppPath(), "dist", "index.html"));
  }

  return window;
}

function registerIpcHandlers(): void {
  ipcMain.handle("mcp:detect-targets", () => mcpService.detectTargets());
  ipcMain.handle("mcp:validate", (_, draft: McpServerDraft) => mcpService.validateServerDraft(draft));
  ipcMain.handle("mcp:test", (_, draft: McpServerDraft, target: TargetKind) =>
    mcpService.testServerDraft(draft, target)
  );
  ipcMain.handle("mcp:preview", (_, draft: McpServerDraft, targets: TargetKind[]) =>
    mcpService.previewConfigPatch(draft, targets)
  );
  ipcMain.handle("mcp:apply", (_, draft: McpServerDraft, targets: TargetKind[]) =>
    mcpService.applyConfigPatch(draft, targets)
  );
  ipcMain.handle("mcp:list-managed", () => mcpService.listManagedServers());
  ipcMain.handle("mcp:remove", (_, id: string, targets?: TargetKind[]) =>
    mcpService.removeManagedServer(id, targets)
  );
  ipcMain.handle("mcp:list-presets", () => PRESETS);
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
