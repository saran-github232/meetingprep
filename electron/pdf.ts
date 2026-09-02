import { BrowserWindow, dialog } from "electron";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { PDFParse } from "pdf-parse";

export interface ImportedResume {
  text: string;
  fileName: string;
  pages: number;
}

/** Ask the user for a PDF resume and extract its text. Resolves null when canceled. */
export async function importResumePdf(webContents: Electron.WebContents): Promise<ImportedResume | null> {
  const win = BrowserWindow.fromWebContents(webContents);
  const options = {
    title: "Choose a resume PDF",
    filters: [{ name: "PDF files", extensions: ["pdf"] }],
    properties: ["openFile"] as ("openFile")[],
  };
  const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
  if (picked.canceled || picked.filePaths.length === 0) return null;

  const filePath = picked.filePaths[0];
  const data = new Uint8Array(await readFile(filePath));
  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText();
    const text = result.text
      .split("\n")
      .filter((line) => !/^--\s*\d+\s+of\s+\d+\s*--$/.test(line.trim()))
      .join("\n")
      .replace(/\r/g, "")
      .replace(/[ \t]+$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (!text) {
      throw new Error(
        "No text could be extracted — this PDF looks like a scan or an image. Export it as text or paste your resume instead."
      );
    }
    return { text, fileName: basename(filePath), pages: result.pages?.length ?? 0 };
  } finally {
    await parser.destroy().catch(() => {});
  }
}
