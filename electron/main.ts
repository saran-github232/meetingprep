import { app, BrowserWindow, shell } from "electron";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { GeminiProvider } from "./ai/GeminiProvider";
import { OpenAIProvider } from "./ai/OpenAIProvider";
import { AnthropicProvider } from "./ai/AnthropicProvider";
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
};

function buildProvider(name: AIProviderName): AIProvider | null {
  const apiKey = db.getApiKey(name) ?? process.env[ENV_KEY_NAME[name]];
  if (!apiKey) return null;
  if (name === "openai") return new OpenAIProvider(apiKey);
  if (name === "anthropic") return new AnthropicProvider(apiKey);
  return new GeminiProvider(apiKey);
}

// The active provider goes first; any other provider with a configured key follows as a
// fallback, so a single provider having a bad day (rate limits, an outage) doesn't stop
// answers — see handlers.ts, which tries each in order until one succeeds.
function getConfiguredProviders(): AIProvider[] {
  const active = db.getActiveProvider();
  const order: AIProviderName[] = [active, ...(["gemini", "openai", "anthropic"] as const).filter((p) => p !== active)];
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
