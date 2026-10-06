import { useCallback, useEffect, useRef, useState } from "react";

/* ---------------------------------------------------------------------------
 * Minimal local typings for the Web Speech API — used instead of the DOM lib's
 * own (inconsistently available) SpeechRecognition types.
 * ------------------------------------------------------------------------- */
interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionResultListLike {
  length: number;
  [index: number]: SpeechRecognitionResultLike;
}
interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
}
interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
}
interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function recognitionCtor(): SpeechRecognitionCtor | undefined {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

/**
 * Live mic dictation. Final phrases are delivered through `onFinal` (kept in a ref so
 * the callback can change without re-arming the recognizer); interim text is exposed
 * separately for display. Chromium ends the service after silence, so listening
 * auto-restarts until `stop()` is called.
 *
 * `lang` (BCP-47, e.g. "te-IN") picks the recognition language; it defaults to the
 * system language. Changing it only takes effect on the next `start()` — the
 * recognizer is (re)created per session, which is what makes the switch reliable.
 */
export function useDictation(onFinal: (text: string) => void, lang?: string) {
  const isElectron = typeof window !== "undefined" && !!window.api?.audio?.transcribe;
  const webSpeechSupported = typeof window !== "undefined" && !!recognitionCtor();
  const supported = isElectron || webSpeechSupported;

  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;
  const langRef = useRef(lang);
  langRef.current = lang;

  // MediaRecorder state for Electron
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Web Speech fallback state
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const wantListeningRef = useRef(false);
  const networkErrorCountRef = useRef(0);

  const stop = useCallback(() => {
    wantListeningRef.current = false;
    setListening(false);
    setInterim("");

    void (async () => {
      // Stop MediaRecorder if running in Electron
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        try {
          await new Promise<void>((resolve) => {
            if (!recorderRef.current) return resolve();
            recorderRef.current.onstop = () => resolve();
            try {
              recorderRef.current.stop();
            } catch {
              resolve();
            }
          });
        } catch {
          // ignore
        }
      }

      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => {
          try {
            t.stop();
          } catch {
            // ignore
          }
        });
        mediaStreamRef.current = null;
      }

      // Process recorded audio if we have chunks
      const chunks = chunksRef.current;
      chunksRef.current = [];
      if (chunks.length > 0 && window.api?.audio?.transcribe) {
        try {
          const audioBlob = new Blob(chunks, { type: chunks[0]?.type || "audio/webm" });
          if (audioBlob.size > 800) {
            const reader = new FileReader();
            reader.onloadend = async () => {
              const dataUrl = reader.result as string;
              const base64 = dataUrl.split(",")[1] ?? "";
              try {
                const res = await window.api.audio.transcribe(base64, audioBlob.type, langRef.current);
                const clean = (res.text ?? "").trim();
                if (clean) onFinalRef.current(clean);
              } catch (txErr) {
                setError(txErr instanceof Error ? txErr.message : String(txErr));
              }
            };
            reader.readAsDataURL(audioBlob);
          }
        } catch {
          // ignore
        }
      }
    })();

    try {
      recognitionRef.current?.stop();
    } catch {
      // already stopped
    }
  }, []);

  const start = useCallback(async () => {
    setError(null);
    networkErrorCountRef.current = 0;
    chunksRef.current = [];

    // 1. Electron Native Audio Capture & Transcription
    if (isElectron) {
      try {
        if (window.api?.audio?.requestPermission) {
          await window.api.audio.requestPermission();
        }

        let savedDeviceId = "";
        if (window.api?.settings) {
          savedDeviceId = (await window.api.settings.get("audio_device_id")) ?? "";
        }

        const constraints: MediaStreamConstraints = {
          audio: savedDeviceId ? { deviceId: { exact: savedDeviceId } } : true,
          video: false,
        };

        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        }

        mediaStreamRef.current = stream;

        const mimeType = [
          "audio/webm;codecs=opus",
          "audio/webm",
          "audio/ogg;codecs=opus",
          "",
        ].find((t) => !t || (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t))) || "";

        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        recorderRef.current = recorder;

        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            chunksRef.current.push(event.data);
          }
        };

        recorder.start(200);
        setListening(true);
        wantListeningRef.current = true;
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Microphone error: ${msg}`);
        setListening(false);
        return;
      }
    }

    // 2. Web Speech API fallback for browser environment
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // stale instance
      }
    }
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = langRef.current || navigator.language || "en-US";

    recognition.onresult = (event) => {
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) {
          const trimmed = text.trim();
          if (trimmed) {
            networkErrorCountRef.current = 0;
            onFinalRef.current(trimmed);
          }
        } else {
          interimText += text;
        }
      }
      setInterim(interimText.trim());
    };

    recognition.onerror = (event) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        wantListeningRef.current = false;
        setListening(false);
        setError("Microphone access was blocked. Allow it in system settings and try again.");
        return;
      }
      if (event.error === "network") {
        networkErrorCountRef.current += 1;
        if (networkErrorCountRef.current <= 3) return;
        wantListeningRef.current = false;
        setListening(false);
        setError("Speech service needs a network connection.");
        return;
      }
      setError(`Speech recognition error: ${event.error}`);
    };

    recognition.onend = () => {
      setInterim("");
      if (wantListeningRef.current) {
        try {
          recognition.start();
          return;
        } catch {
          // restart race — drop through to stop
        }
      }
      setListening(false);
    };

    recognitionRef.current = recognition;
    wantListeningRef.current = true;
    try {
      recognition.start();
      setListening(true);
    } catch {
      wantListeningRef.current = false;
      setListening(false);
      setError("Could not start the microphone.");
    }
  }, [isElectron]);

  useEffect(
    () => () => {
      wantListeningRef.current = false;
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      try {
        recorderRef.current?.stop();
      } catch {
        // already stopped
      }
      try {
        recognitionRef.current?.abort();
      } catch {
        // already stopped
      }
    },
    []
  );

  return { supported, listening, interim, error, start, stop };
}

/** Read text aloud with the OS voice. Speaking stops automatically on unmount. */
export function useSpeaker() {
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  const [speaking, setSpeaking] = useState(false);

  const stopSpeaking = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [supported]);

  const speak = useCallback(
    (text: string) => {
      if (!supported || !text.trim()) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1;
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      setSpeaking(true);
      window.speechSynthesis.speak(utterance);
    },
    [supported]
  );

  useEffect(
    () => () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    },
    []
  );

  return { supported, speaking, speak, stopSpeaking };
}
