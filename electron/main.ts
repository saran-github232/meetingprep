import { app, BrowserWindow, Menu, ipcMain, shell } from "electron";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { GeminiProvider } from "./ai/GeminiProvider";
import { OpenAIProvider } from "./ai/OpenAIProvider";
import { AnthropicProvider } from "./ai/AnthropicProvider";
import { LocalProvider, DEFAULT_LOCAL_MODEL } from "./ai/LocalProvider";
import type { AIProvider } from "./ai/AIProvider";
import { registerIpcHandlers } from "./ipc/handlers";
import { loadEnvFile } from "./env";
import { buildAppMenu } from "./menu";
import * as db from "./db/db";
import type { AIProviderName } from "./db/db";

const __dirname = dirname(fileURLToPath(import.meta.url));

loadEnvFile();

const ENV_KEY_NAME: Record<AIProviderName, string> = {
  gemini: "GEMINI_API_KEY",
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  local: "", // Ollama needs no key — it's a local server
};

function buildProvider(name: AIProviderName): AIProvider | null {
  if (name === "local") return new LocalProvider(db.getSetting("local_model") ?? DEFAULT_LOCAL_MODEL);
  const apiKey = db.getApiKey(name) ?? process.env[ENV_KEY_NAME[name]];
  if (!apiKey) return null;
  if (name === "openai") return new OpenAIProvider(apiKey);
  if (name === "anthropic") return new AnthropicProvider(apiKey);
  return new GeminiProvider(apiKey);
}

// The active provider goes first; any other provider with a configured key follows as a
// fallback, so a single provider having a bad day (rate limits, an outage) doesn't stop
// answers — see handlers.ts, which tries each in order until one succeeds. Local (Ollama)
// sits last: if it's installed, a cloud outage silently degrades to offline answers; if it
// isn't, the connection to 127.0.0.1 is refused instantly and the chain moves on.
function getConfiguredProviders(): AIProvider[] {
  const active = db.getActiveProvider();
  const order: AIProviderName[] = [
    active,
    ...(["gemini", "openai", "anthropic", "local"] as const).filter((p) => p !== active),
  ];
  return order.map(buildProvider).filter((p): p is AIProvider => p !== null);
}

registerIpcHandlers(getConfiguredProviders);

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    show: true,
    backgroundColor: "#131210",
    title: "MeetingPrep AI",
    frame: false,
    webPreferences: {
      preload: join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Capture shield: excludes the window from screen capture / screen sharing
  // (WDA_EXCLUDEFROMCAPTURE on Windows, CGSSetWindowSharingType none on macOS)
  // while it stays fully visible on the local display.
  win.setContentProtection(db.getSetting("stealth") === "1");

  // Chromium's drag regions maximize/restore on double-click by themselves, bypassing
  // window:toggleMaximize — forward the resulting state so the custom titlebar's icon stays correct.
  win.on("maximize", () => win.webContents.send("window:maximizedChange", true));
  win.on("unmaximize", () => win.webContents.send("window:maximizedChange", false));

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(join(__dirname, "../dist/index.html"));
  }
}

// Custom titlebar (frame: false above) needs the window controls a native frame would
// otherwise provide, plus a way to still reach the app menu that a frame would show.
ipcMain.handle("window:minimize", () => BrowserWindow.getFocusedWindow()?.minimize());
ipcMain.handle("window:toggleMaximize", () => {
  const win = BrowserWindow.getFocusedWindow();
  if (!win) return;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});
ipcMain.handle("window:close", () => BrowserWindow.getFocusedWindow()?.close());
ipcMain.handle("window:isMaximized", () => BrowserWindow.getFocusedWindow()?.isMaximized() ?? false);
ipcMain.handle("window:showMenu", () => Menu.getApplicationMenu()?.popup());

app.whenReady().then(() => {
  buildAppMenu();
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
