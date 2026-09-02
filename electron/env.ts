import { app } from "electron";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

function envPath(): string {
  return join(app.getAppPath(), ".env");
}

// Minimal .env loader (KEY=VALUE per line) — avoids pulling in a dependency for this.
export function loadEnvFile() {
  const path = envPath();
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

// Persists a key into the project's .env file (dev-time convenience — the Settings
// page also saves an encrypted copy to the DB, which getProvider() prefers).
export function setEnvKey(key: string, value: string) {
  const path = envPath();
  const lines = existsSync(path) ? readFileSync(path, "utf-8").split("\n") : [];
  const idx = lines.findIndex((l) => l.trim().startsWith(`${key}=`));
  const entry = `${key}=${value}`;
  if (idx === -1) lines.push(entry);
  else lines[idx] = entry;
  writeFileSync(path, lines.join("\n"), "utf-8");
  process.env[key] = value;
}
