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
 */
export function useDictation(onFinal: (text: string) => void) {
  const supported = typeof window !== "undefined" && !!recognitionCtor();
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const wantListeningRef = useRef(false);

  const stop = useCallback(() => {
    wantListeningRef.current = false;
    setListening(false);
    setInterim("");
    try {
      recognitionRef.current?.stop();
    } catch {
      // already stopped
    }
  }, []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    setError(null);
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
    recognition.lang = navigator.language || "en-US";

    recognition.onresult = (event) => {
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) {
          const trimmed = text.trim();
          if (trimmed) onFinalRef.current(trimmed);
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
        setError("Microphone access was blocked. Allow it and try again.");
        return;
      }
      if (event.error === "network") {
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
  }, []);

  useEffect(
    () => () => {
      wantListeningRef.current = false;
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
