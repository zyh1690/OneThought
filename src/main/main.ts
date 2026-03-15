import { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, nativeImage, type IpcMainInvokeEvent } from "electron";
import path from "node:path";
import fs from "node:fs";
import { ConfigService } from "./services/configService";
import { ThoughtRepository } from "./services/thoughtRepository";
import { BackupService } from "./services/backupService";
import { LlmService } from "./services/llmService";
import type { AppConfig, QueryOptions, Thought } from "./types";

const configService = new ConfigService();
const repository = new ThoughtRepository();
const backupService = new BackupService(repository);
const llmService = new LlmService();

let mainWindow: BrowserWindow | null = null;
let quickWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) win.loadURL(devUrl);
  else win.loadFile(path.join(__dirname, "../renderer/index.html"));
  return win;
}

function createQuickWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 520,
    height: 220,
    frame: false,
    resizable: false,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) win.loadURL(`${devUrl}?quick=1`);
  else win.loadFile(path.join(__dirname, "../renderer/index.html"), { search: "?quick=1" });
  return win;
}

function toggleQuickWindow(): void {
  if (!quickWindow) quickWindow = createQuickWindow();
  if (quickWindow.isVisible()) {
    quickWindow.hide();
    return;
  }
  quickWindow.show();
  quickWindow.focus();
}

function setupTray(): void {
  const iconPath = path.join(process.cwd(), "build/icon.ico");
  const icon = fs.existsSync(iconPath) ? iconPath : nativeImage.createEmpty();
  tray = new Tray(icon);
  const menu = Menu.buildFromTemplate([
    { label: "快速记录", click: () => toggleQuickWindow() },
    { label: "打开主界面", click: () => mainWindow?.show() },
    { type: "separator" },
    { label: "退出", click: () => app.quit() }
  ]);
  tray.setToolTip("OneThought");
  tray.setContextMenu(menu);
  tray.on("double-click", () => mainWindow?.show());
}

function applyAutoLaunch(enabled: boolean): void {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    args: ["--minimized"]
  });
}

function applyHotkey(shortcut: string): boolean {
  globalShortcut.unregisterAll();
  return globalShortcut.register(shortcut, () => {
    toggleQuickWindow();
  });
}

function setupIpc(): void {
  ipcMain.handle("config:get", () => configService.getConfig());
  ipcMain.handle("config:update", (_e: IpcMainInvokeEvent, patch: Partial<AppConfig>) => {
    const next = configService.updateConfig(patch);
    if (Object.hasOwn(patch, "autoLaunch")) applyAutoLaunch(Boolean(next.autoLaunch));
    if (Object.hasOwn(patch, "hotkey")) {
      const ok = applyHotkey(next.hotkey);
      return { config: next, hotkeyRegistered: ok };
    }
    return { config: next, hotkeyRegistered: true };
  });

  ipcMain.handle("thought:create", (_e, payload: { content: string; tags?: string[]; source?: "quick_input" | "main_ui" }) => {
    const thought = repository.create(payload.content, payload.tags ?? [], payload.source ?? "main_ui");
    mainWindow?.webContents.send("thought:updated");
    return thought;
  });
  ipcMain.handle("thought:update", (_e: IpcMainInvokeEvent, id: string, patch: Partial<Thought>) => {
    const thought = repository.update(id, patch);
    mainWindow?.webContents.send("thought:updated");
    return thought;
  });
  ipcMain.handle("thought:archive", (_e: IpcMainInvokeEvent, id: string, archived: boolean) => {
    const thought = repository.archive(id, archived);
    mainWindow?.webContents.send("thought:updated");
    return thought;
  });
  ipcMain.handle("thought:list", (_e: IpcMainInvokeEvent, options: QueryOptions) => repository.queryGrouped(options));
  ipcMain.handle("thought:listAll", () => repository.getAll());
  ipcMain.handle("thought:compact", () => repository.compact());

  ipcMain.handle("backup:create", async (_e: IpcMainInvokeEvent, reason?: string) => backupService.createBackup(reason));
  ipcMain.handle("backup:list", () => backupService.listBackups());
  ipcMain.handle("backup:restore", async (_e: IpcMainInvokeEvent, filename: string) => {
    await backupService.restoreBackup(filename);
    repository.initialize();
    mainWindow?.webContents.send("thought:updated");
    return true;
  });

  ipcMain.handle("llm:generate", async (_e: IpcMainInvokeEvent, payload: { from: string; to: string; tags?: string[]; archived?: boolean | null; type: "summary" | "mindmap"; forceRefresh?: boolean }) => {
    const all = repository.getAll();
    const from = payload.from;
    const to = payload.to;
    const tags = payload.tags ?? [];
    const archived = payload.archived ?? null;
    const thoughts = all.filter((item) => {
      const ts = +new Date(item.created_at);
      if (ts < +new Date(from) || ts > +new Date(to)) return false;
      if (typeof archived === "boolean" && item.archived !== archived) return false;
      if (tags.length > 0 && !item.tags.some((t) => tags.includes(t))) return false;
      return true;
    });
    return llmService.generate(thoughts, configService.getConfig(), {
      from,
      to,
      tags,
      archived,
      type: payload.type,
      forceRefresh: Boolean(payload.forceRefresh)
    });
  });
}

app.whenReady().then(async () => {
  repository.initialize();
  const config = configService.getConfig();
  applyAutoLaunch(config.autoLaunch);

  mainWindow = createMainWindow();
  quickWindow = createQuickWindow();
  if (process.argv.includes("--minimized")) mainWindow.hide();

  setupTray();
  setupIpc();
  applyHotkey(config.hotkey);
  await backupService.runAutoDaily(config);
});

app.on("window-all-closed", () => {
  // Keep tray app alive on Windows.
});

app.on("before-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("activate", () => {
  if (!mainWindow) mainWindow = createMainWindow();
  mainWindow.show();
});
