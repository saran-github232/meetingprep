import { BrowserWindow, dialog } from "electron";
import { writeFileSync } from "node:fs";

// Saves text to a user-chosen path via the native save dialog — no extra dependency needed.
export async function saveMarkdown(content: string, suggestedName: string): Promise<boolean> {
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: suggestedName,
    filters: [{ name: "Markdown", extensions: ["md"] }],
  });
  if (canceled || !filePath) return false;
  writeFileSync(filePath, content, "utf-8");
  return true;
}

// Renders HTML off-screen and prints it to PDF via Electron's built-in printToPDF —
// avoids pulling in a PDF-generation library.
export async function savePdf(html: string, suggestedName: string): Promise<boolean> {
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: suggestedName,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (canceled || !filePath) return false;

  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const buffer = await win.webContents.printToPDF({});
    writeFileSync(filePath, buffer);
    return true;
  } finally {
    win.destroy();
  }
}
