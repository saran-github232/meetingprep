import { useCallback, useEffect, useRef, useState } from "react";

export interface AudioInputDevice {
  deviceId: string;
  label: string;
}

export interface AudioLatencyMetrics {
  captureMs: number;
  transcriptionMs: number;
  aiMs?: number;
  totalMs?: number;
}

export type MicrophoneState =
  | "off"
  | "requesting"
  | "ready"
  | "listening"
  | "processing"
  | "transcribing"
  | "answering"
  | "error";

export interface AudioQuestionResult {
  questionId: string;
  transcript: string;
  provider: string;
  metrics: AudioLatencyMetrics;
}

/**
 * Lists available microphone devices.
 */
export async function getAudioInputDevices(): Promise<AudioInputDevice[]> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
    return [];
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputs = devices.filter((d) => d.kind === "audioinput");
    return inputs.map((d, index) => ({
      deviceId: d.deviceId,
      label: d.label || `Microphone ${index + 1}${d.deviceId === "default" ? " (Default)" : ""}`,
    }));
  } catch {
    return [];
  }
}

/**
 * Returns supported MediaRecorder MIME type in Chromium/Electron.
 */
function getSupportedAudioMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return "";
}

/**
 * Converts a Blob to base64 string without data: prefix.
 */
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1] ?? "";
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Formats errors into user-friendly explanations.
 */
function formatAudioError(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
      return "Microphone permission denied. Allow microphone access in Windows Settings → Privacy & Security → Microphone.";
    }
    if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
      return "No microphone found. Please connect a microphone or headset and try again.";
    }
    if (err.name === "NotReadableError" || err.name === "TrackStartError") {
      return "Microphone is in use by another application or Windows audio driver error.";
    }
    if (err.name === "OverconstrainedError") {
      return "Selected microphone is no longer available. Reverting to default microphone.";
    }
    if (err.name === "AbortError") {
      return "Microphone access was aborted.";
    }
    return err.message;
  }
  return String(err);
}

export interface UseAudioQuestionOptions {
  onQuestionDetected: (result: AudioQuestionResult) => void;
  language?: string;
  silenceThresholdMs?: number; // e.g. 1400ms
  autoProcessOnSilence?: boolean; // default true
}

/**
 * Unified low-latency audio question capture hook for Interview Coach and Practice.
 *
 * Implements:
 * 1. Selected audio device persistence & fallback
 * 2. MediaRecorder recording with Web Audio API VAD (Voice Activity Detection)
 * 3. Silence detection for automatic question completion
 * 4. IPC transcription via OpenAI Whisper / Gemini Flash / NVIDIA
 * 5. Full latency metrics tracking
 * 6. Deduplication and safe cleanup
 */
export function useAudioQuestionCapture(options: UseAudioQuestionOptions) {
  const [state, setState] = useState<MicrophoneState>("off");
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<AudioInputDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [volumeLevel, setVolumeLevel] = useState<number>(0);
  const [lastMetrics, setLastMetrics] = useState<AudioLatencyMetrics | null>(null);
  const [detectedQuestion, setDetectedQuestion] = useState<string | null>(null);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Active session references
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadIntervalRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const captureStartTimeRef = useRef<number>(0);
  const hasSpokenRef = useRef<boolean>(false);
  const lastSpeechTimeRef = useRef<number>(0);
  const activeProcessingIdRef = useRef<string | null>(null);
  const isStoppingRef = useRef<boolean>(false);

  // Load saved device setting and enumerate devices
  const refreshDevices = useCallback(async () => {
    try {
      const list = await getAudioInputDevices();
      setDevices(list);
      let saved = "";
      if (window.api?.settings) {
        saved = (await window.api.settings.get("audio_device_id")) ?? "";
      }
      if (saved && list.some((d) => d.deviceId === saved)) {
        setSelectedDeviceId(saved);
      } else if (list.length > 0) {
        setSelectedDeviceId(list[0].deviceId);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    refreshDevices();
    if (typeof navigator !== "undefined" && navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener("devicechange", refreshDevices);
      return () => {
        navigator.mediaDevices.removeEventListener("devicechange", refreshDevices);
      };
    }
  }, [refreshDevices]);

  const selectDevice = useCallback(async (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    if (window.api?.settings) {
      await window.api.settings.set("audio_device_id", deviceId);
    }
  }, []);

  // Cleanup all audio resources
  const releaseStream = useCallback(() => {
    if (vadIntervalRef.current) {
      window.clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch {
        // ignore
      }
      audioContextRef.current = null;
    }
    analyserRef.current = null;

    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try {
        recorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    recorderRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      streamRef.current = null;
    }
    setVolumeLevel(0);
  }, []);

  // Process captured audio and transcribe
  const finishAndProcessAudio = useCallback(async () => {
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;

    const processingId = activeProcessingIdRef.current;
    if (!processingId) {
      releaseStream();
      setState("off");
      isStoppingRef.current = false;
      return;
    }

    const captureDuration = Date.now() - captureStartTimeRef.current;
    setState("processing");

    // Stop recorder to flush final chunk
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
        try {
          recorder.stop();
        } catch {
          resolve();
        }
      });
    }

    releaseStream();

    const chunks = chunksRef.current;
    chunksRef.current = [];

    if (chunks.length === 0) {
      setState("ready");
      isStoppingRef.current = false;
      return;
    }

    const mimeType = chunks[0]?.type || getSupportedAudioMimeType() || "audio/webm";
    const audioBlob = new Blob(chunks, { type: mimeType });

    // Guard against tiny blips / accidental clicks (< 0.25s)
    if (audioBlob.size < 500) {
      setState("ready");
      isStoppingRef.current = false;
      return;
    }

    setState("transcribing");
    const txStart = Date.now();

    try {
      const base64 = await blobToBase64(audioBlob);
      if (!window.api?.audio?.transcribe) {
        throw new Error("Audio transcription IPC handler not available.");
      }

      const txResult = await window.api.audio.transcribe(
        base64,
        mimeType,
        optionsRef.current.language
      );

      const txDuration = Date.now() - txStart;
      const cleanText = (txResult.text || "").trim();

      if (!cleanText) {
        setError("No speech detected in audio. Please speak clearly into the microphone.");
        setState("ready");
        isStoppingRef.current = false;
        return;
      }

      const metrics: AudioLatencyMetrics = {
        captureMs: captureDuration,
        transcriptionMs: txDuration,
        totalMs: captureDuration + txDuration,
      };

      setLastMetrics(metrics);
      setDetectedQuestion(cleanText);
      setState("answering");

      // Deliver to caller
      optionsRef.current.onQuestionDetected({
        questionId: processingId,
        transcript: cleanText,
        provider: txResult.provider,
        metrics,
      });

      setState("ready");
    } catch (err) {
      const msg = formatAudioError(err);
      setError(msg);
      setState("error");
    } finally {
      isStoppingRef.current = false;
      activeProcessingIdRef.current = null;
    }
  }, [releaseStream]);

  // Stop recording manually
  const stopListening = useCallback(() => {
    if (state === "listening") {
      finishAndProcessAudio();
    } else {
      releaseStream();
      setState("off");
      activeProcessingIdRef.current = null;
    }
  }, [state, finishAndProcessAudio, releaseStream]);

  // Start listening
  const startListening = useCallback(async () => {
    setError(null);
    setState("requesting");
    releaseStream();
    chunksRef.current = [];
    hasSpokenRef.current = false;
    lastSpeechTimeRef.current = 0;
    isStoppingRef.current = false;

    const processingId = `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    activeProcessingIdRef.current = processingId;

    try {
      // 1. Check Electron/OS permission
      if (window.api?.audio?.requestPermission) {
        await window.api.audio.requestPermission();
      }

      // 2. getUserMedia with selected device or default
      let constraints: MediaStreamConstraints = {
        audio: selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : true,
        video: false,
      };

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (deviceErr) {
        // Fall back to default microphone if selected device was disconnected
        if (selectedDeviceId) {
          constraints = { audio: true, video: false };
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          setSelectedDeviceId("");
        } else {
          throw deviceErr;
        }
      }

      streamRef.current = stream;
      captureStartTimeRef.current = Date.now();

      // 3. Setup Web Audio API VAD (Voice Activity Detection)
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        const audioCtx = new AudioCtx();
        audioContextRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        analyserRef.current = analyser;

        const buffer = new Uint8Array(analyser.frequencyBinCount);
        const silenceLimit = optionsRef.current.silenceThresholdMs ?? 1400;
        const autoStop = optionsRef.current.autoProcessOnSilence ?? true;

        vadIntervalRef.current = window.setInterval(() => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(buffer);
          let sum = 0;
          for (let i = 0; i < buffer.length; i++) {
            sum += buffer[i];
          }
          const avg = sum / buffer.length;
          const level = Math.min(100, Math.round((avg / 128) * 100));
          setVolumeLevel(level);

          const now = Date.now();
          // Speech detected threshold
          if (level > 8) {
            hasSpokenRef.current = true;
            lastSpeechTimeRef.current = now;
          } else if (hasSpokenRef.current && autoStop && lastSpeechTimeRef.current > 0) {
            // Check if silence has persisted after speech
            const elapsedSilence = now - lastSpeechTimeRef.current;
            const totalDuration = now - captureStartTimeRef.current;
            if (elapsedSilence >= silenceLimit && totalDuration >= 800) {
              // Silence detected after speech: complete question automatically!
              finishAndProcessAudio();
            }
          }
        }, 60);
      }

      // 4. Setup MediaRecorder
      const mimeType = getSupportedAudioMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.start(200); // 200ms slices for smooth data collection
      setState("listening");
    } catch (err) {
      const msg = formatAudioError(err);
      setError(msg);
      setState("error");
      releaseStream();
    }
  }, [selectedDeviceId, releaseStream, finishAndProcessAudio]);

  // Toggle listening
  const toggleListening = useCallback(() => {
    if (state === "listening") {
      stopListening();
    } else {
      startListening();
    }
  }, [state, stopListening, startListening]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      releaseStream();
    };
  }, [releaseStream]);

  return {
    state,
    error,
    devices,
    selectedDeviceId,
    selectDevice,
    volumeLevel,
    lastMetrics,
    detectedQuestion,
    startListening,
    stopListening,
    toggleListening,
    refreshDevices,
  };
}
