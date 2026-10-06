import { GoogleGenerativeAI } from "@google/generative-ai";

export interface TranscribeParams {
  audioBase64: string;
  mimeType?: string;
  language?: string;
}

export interface TranscribeResult {
  text: string;
  provider: string;
  latencyMs: number;
}

export interface TranscriptionContext {
  getSetting?: (key: string) => string | null | undefined;
  getActiveProvider?: () => string;
  getApiKey?: (provider: "openai" | "gemini" | "nvidia") => string | null;
  forceTestMode?: boolean;
}

export const TEST_QUESTIONS = [
  "What is data annotation and what steps do you take to maintain high labeling quality across large audio datasets?",
  "How do you handle ambiguous speech, overlapping speakers, or background noise when annotating audio?",
  "Can you explain the difference between verbatim and clean-read transcription guidelines?",
  "Describe a complex project from your resume where you applied your primary technical skills.",
  "How do you evaluate and optimize inter-annotator agreement in machine learning data pipelines?",
  "How would you handle missing labels or inconsistent tagging in an audio classification dataset?",
];

let testQuestionIndex = 0;

function providerEnvKey(provider: "openai" | "gemini" | "nvidia"): string {
  if (provider === "openai") return "OPENAI_API_KEY";
  if (provider === "gemini") return "GEMINI_API_KEY";
  return "NVIDIA_API_KEY";
}

function isTestMode(setting?: string | null): boolean {
  return setting === "1" || setting === "true";
}

function resolveKey(
  provider: "openai" | "gemini" | "nvidia",
  ctx?: TranscriptionContext
): string | null {
  const fromCtx = ctx?.getApiKey?.(provider);
  if (fromCtx?.trim()) return fromCtx.trim();
  const envName = providerEnvKey(provider);
  return envName && process.env[envName] ? process.env[envName]!.trim() : null;
}

function resolveTestMode(ctx?: TranscriptionContext): boolean {
  if (ctx?.forceTestMode !== undefined) return ctx.forceTestMode;
  const raw = ctx?.getSetting?.("coach_test_mode");
  return isTestMode(raw);
}

function resolveActiveProvider(ctx?: TranscriptionContext): string {
  return ctx?.getActiveProvider?.() ?? "gemini";
}

/**
 * Checks which audio transcription provider is currently available.
 */
export function getAvailableTranscriptionProvider(ctx?: TranscriptionContext): {
  hasProvider: boolean;
  providerName: string | null;
} {
  if (resolveTestMode(ctx)) {
    return { hasProvider: true, providerName: "Test Mode (Deterministic)" };
  }
  const active = resolveActiveProvider(ctx);
  if (active === "openai" && resolveKey("openai", ctx)) {
    return { hasProvider: true, providerName: "OpenAI Whisper" };
  }
  if (active === "gemini" && resolveKey("gemini", ctx)) {
    return { hasProvider: true, providerName: "Gemini Flash Audio" };
  }
  if (resolveKey("openai", ctx)) {
    return { hasProvider: true, providerName: "OpenAI Whisper" };
  }
  if (resolveKey("gemini", ctx)) {
    return { hasProvider: true, providerName: "Gemini Flash Audio" };
  }
  if (resolveKey("nvidia", ctx)) {
    return { hasProvider: true, providerName: "NVIDIA Whisper" };
  }
  return { hasProvider: false, providerName: null };
}

/**
 * Transcribes audio bytes using the fastest available audio transcription provider.
 */
export async function transcribeAudio(
  params: TranscribeParams,
  ctx?: TranscriptionContext
): Promise<TranscribeResult> {
  const start = Date.now();
  const mimeType = params.mimeType || "audio/webm";

  // 1. Test Mode (zero external quota, instantaneous deterministic response)
  if (resolveTestMode(ctx)) {
    const question = TEST_QUESTIONS[testQuestionIndex % TEST_QUESTIONS.length];
    testQuestionIndex++;
    return {
      text: question,
      provider: "Test Mode",
      latencyMs: Date.now() - start,
    };
  }

  const active = resolveActiveProvider(ctx);
  const errors: string[] = [];

  // Provider candidates ordered by active preference
  const candidates: Array<"openai" | "gemini" | "nvidia"> = [];
  if (active === "openai" || active === "gemini" || active === "nvidia") {
    candidates.push(active);
  }
  for (const p of ["openai", "gemini", "nvidia"] as const) {
    if (!candidates.includes(p)) candidates.push(p);
  }

  for (const provider of candidates) {
    const key = resolveKey(provider, ctx);
    if (!key) continue;

    try {
      if (provider === "openai") {
        const buffer = Buffer.from(params.audioBase64, "base64");
        const blob = new Blob([buffer], { type: mimeType });
        const form = new FormData();
        form.append("file", blob, "audio.webm");
        form.append("model", "whisper-1");
        if (params.language && params.language !== "auto") {
          const langCode = params.language.split("-")[0].toLowerCase();
          form.append("language", langCode);
        }

        const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}` },
          body: form,
          signal: AbortSignal.timeout(12_000),
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`OpenAI Whisper (${res.status}): ${errText.slice(0, 200)}`);
        }

        const data = (await res.json()) as { text?: string };
        const text = (data.text ?? "").trim();
        return {
          text,
          provider: "OpenAI Whisper",
          latencyMs: Date.now() - start,
        };
      }

      if (provider === "gemini") {
        const genAI = new GoogleGenerativeAI(key);
        const modelNames = ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-1.5-flash"];
        let lastErr: Error | null = null;

        for (const mName of modelNames) {
          try {
            const model = genAI.getGenerativeModel({ model: mName });
            const prompt = params.language && params.language !== "auto"
              ? `You are an expert audio transcription service. Transcribe the following spoken audio verbatim in ${params.language}. Output ONLY the transcribed words with no markdown formatting, quotes, commentary, or timestamps. If the audio is silent or unintelligible, output nothing.`
              : `You are an expert audio transcription service. Transcribe the following spoken audio verbatim. Output ONLY the transcribed words with no markdown formatting, quotes, commentary, or timestamps. If the audio is silent or unintelligible, output nothing.`;

            const result = await model.generateContent([
              {
                inlineData: {
                  data: params.audioBase64,
                  mimeType,
                },
              },
              { text: prompt },
            ]);

            const text = result.response.text().trim();
            return {
              text,
              provider: `Gemini Audio (${mName})`,
              latencyMs: Date.now() - start,
            };
          } catch (err) {
            lastErr = err instanceof Error ? err : new Error(String(err));
          }
        }
        if (lastErr) throw lastErr;
      }

      if (provider === "nvidia") {
        const buffer = Buffer.from(params.audioBase64, "base64");
        const blob = new Blob([buffer], { type: mimeType });
        const form = new FormData();
        form.append("file", blob, "audio.webm");
        form.append("model", "openai/whisper-large-v3");
        if (params.language && params.language !== "auto") {
          form.append("language", params.language.split("-")[0].toLowerCase());
        }

        const res = await fetch("https://integrate.api.nvidia.com/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}` },
          body: form,
          signal: AbortSignal.timeout(12_000),
        });

        if (res.ok) {
          const data = (await res.json()) as { text?: string };
          const text = (data.text ?? "").trim();
          return {
            text,
            provider: "NVIDIA Whisper",
            latencyMs: Date.now() - start,
          };
        }
        const errText = await res.text();
        throw new Error(`NVIDIA Whisper (${res.status}): ${errText.slice(0, 200)}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${provider}: ${msg}`);
    }
  }

  const detail = errors.length > 0 ? ` Errors encountered: ${errors.join("; ")}` : "";
  throw new Error(
    `No audio transcription provider succeeded. Please ensure an OpenAI or Gemini API key is configured in Settings → AI Provider.${detail}`
  );
}
