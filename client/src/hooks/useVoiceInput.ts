import { useCallback, useEffect, useRef, useState } from "react";

interface RecognitionResultLike {
  readonly isFinal: boolean;
  readonly 0: { readonly transcript: string };
}

interface RecognitionEventLike {
  readonly resultIndex: number;
  readonly results: {
    readonly length: number;
    readonly [index: number]: RecognitionResultLike;
  };
}

interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type RecognitionConstructor = new () => RecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  }
}

export function useVoiceInput(
  onFinalTranscript: (transcript: string, requestId: string) => void,
  onError: (message: string) => void,
) {
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const finalTranscriptRef = useRef(onFinalTranscript);
  const errorRef = useRef(onError);
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isSupported, setIsSupported] = useState(true);

  useEffect(() => {
    finalTranscriptRef.current = onFinalTranscript;
    errorRef.current = onError;
  }, [onFinalTranscript, onError]);

  useEffect(() => {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      setIsSupported(false);
      return;
    }

    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      let interim = "";
      let finalText = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (!result) continue;
        if (result.isFinal) finalText += result[0].transcript;
        else interim += result[0].transcript;
      }
      setInterimTranscript(interim);
      if (finalText.trim()) {
        setInterimTranscript("");
        finalTranscriptRef.current(finalText.trim(), `voice_${crypto.randomUUID()}`);
      }
    };
    recognition.onerror = (event) => {
      setIsListening(false);
      errorRef.current(`Microphone: ${event.error}`);
    };
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;

    return () => {
      recognition.abort();
      recognitionRef.current = null;
    };
  }, []);

  const startListening = useCallback(() => {
    if (!recognitionRef.current || isListening) return;
    window.speechSynthesis?.cancel();
    setInterimTranscript("Listening…");
    setIsListening(true);
    try {
      recognitionRef.current.start();
    } catch {
      setIsListening(false);
      errorRef.current("The microphone could not be started. Please try again.");
    }
  }, [isListening]);

  const stopListening = useCallback(() => {
    if (!recognitionRef.current || !isListening) return;
    recognitionRef.current.stop();
    setIsListening(false);
  }, [isListening]);

  return { isListening, interimTranscript, isSupported, startListening, stopListening };
}
