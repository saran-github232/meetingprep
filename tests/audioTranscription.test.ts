import test from "node:test";
import assert from "node:assert/strict";
import {
  transcribeAudio,
  getAvailableTranscriptionProvider,
  TEST_QUESTIONS,
} from "../electron/audio/transcription.ts";
import { practiceTutorPrompt } from "../electron/ai/promptTemplates.ts";

test("Audio Transcription and Microphone Pipeline", async (t) => {
  await t.test("1. Test mode returns deterministic question with latency measurement", async () => {
    const available = getAvailableTranscriptionProvider({ forceTestMode: true });
    assert.equal(available.hasProvider, true);
    assert.match(available.providerName ?? "", /Test Mode/);

    const result = await transcribeAudio(
      {
        audioBase64: "dGVzdC1hdWRpby1ieXRlcw==",
        mimeType: "audio/webm",
        language: "en",
      },
      { forceTestMode: true }
    );

    assert.ok(result.text.length > 10);
    assert.equal(result.provider, "Test Mode");
    assert.ok(result.latencyMs >= 0);
    assert.ok(TEST_QUESTIONS.includes(result.text));
  });

  await t.test("2. Provider detection respects active provider and configured keys", () => {
    // No keys configured
    const none = getAvailableTranscriptionProvider({
      forceTestMode: false,
      getApiKey: () => null,
      getActiveProvider: () => "local",
    });
    assert.equal(none.hasProvider, false);
    assert.equal(none.providerName, null);

    // OpenAI key configured
    const openai = getAvailableTranscriptionProvider({
      forceTestMode: false,
      getActiveProvider: () => "openai",
      getApiKey: (p) => (p === "openai" ? "sk-test" : null),
    });
    assert.equal(openai.hasProvider, true);
    assert.equal(openai.providerName, "OpenAI Whisper");

    // Gemini key configured
    const gemini = getAvailableTranscriptionProvider({
      forceTestMode: false,
      getActiveProvider: () => "gemini",
      getApiKey: (p) => (p === "gemini" ? "AIza-test" : null),
    });
    assert.equal(gemini.hasProvider, true);
    assert.equal(gemini.providerName, "Gemini Flash Audio");
  });

  await t.test("3. Audio transcription rotates through data annotation and interview questions in test mode", async () => {
    const q1 = await transcribeAudio(
      { audioBase64: "YQ==", mimeType: "audio/webm" },
      { forceTestMode: true }
    );
    const q2 = await transcribeAudio(
      { audioBase64: "Yg==", mimeType: "audio/webm" },
      { forceTestMode: true }
    );

    assert.ok(q1.text.length > 0);
    assert.ok(q2.text.length > 0);
    assert.notEqual(q1.text, q2.text);
  });

  await t.test("4. Practice tutor prompt includes data annotation and speech task guidance", () => {
    const prompt = practiceTutorPrompt([], "interview-ready", {
      resumeText: "Audio Quality & Transcription Specialist with 4 years experience",
      jobTitle: "Data Annotation Lead",
      company: "SpeechAI",
      jobDescription: "Lead speech transcription and audio annotation pipelines.",
      requiredSkills: "Audio labeling, WER evaluation, Guidelines design",
      techStack: "Praat, Audacity, Python",
      experienceLevel: "Senior",
      analysis: null,
    });

    assert.match(prompt, /audio-based tasks/i);
    assert.match(prompt, /data labeling/i);
    assert.match(prompt, /Data Annotation Lead/);
    assert.match(prompt, /Audio Quality & Transcription Specialist/);
  });
});
