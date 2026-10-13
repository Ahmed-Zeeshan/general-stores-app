"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Speech in the browser (Chrome / Edge on PC and Android): listening turns speech into text, speaking
 * reads an answer aloud. Recognition needs the internet (the browser sends the sound to its speech
 * service) and the microphone allowed on https:// or localhost.
 */

type RecognitionResult = { isFinal: boolean; length: number; [i: number]: { transcript: string } };
type RecognitionEvent = { resultIndex: number; results: { length: number; [i: number]: RecognitionResult } };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type RecognitionCtor = new () => Recognition;

function ctor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type VoiceLang = "ur-PK" | "en-PK";
const LANG_KEY = "dukaan:voice-lang";

export function getVoiceLang(): VoiceLang {
  try {
    return localStorage.getItem(LANG_KEY) === "en-PK" ? "en-PK" : "ur-PK";
  } catch {
    return "ur-PK";
  }
}
export function setVoiceLang(l: VoiceLang) {
  try {
    localStorage.setItem(LANG_KEY, l);
  } catch {
    /* ignore */
  }
}

const ERRORS: Record<string, string> = {
  "not-allowed": "The microphone is blocked. Allow it in the browser (the lock / camera icon in the address bar).",
  "service-not-allowed": "The microphone is blocked. Allow it in the browser (the lock / camera icon in the address bar).",
  network: "Voice needs the internet. Check the connection and try again.",
  "no-speech": "Nothing was heard. Press the mic and speak again.",
  "audio-capture": "No microphone found. Plug one in and try again.",
};

/** Listen once: `start(onText)` gets the best text and the other possibilities. */
export function useSpeech() {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState("");
  const rec = useRef<Recognition | null>(null);
  useEffect(() => setSupported(!!ctor()), []);
  useEffect(() => () => rec.current?.abort(), []);

  const start = useCallback((onText: (text: string, alternatives: string[]) => void, lang: VoiceLang = getVoiceLang()) => {
    const C = ctor();
    if (!C) return setError("Voice works in Chrome or Edge.");
    if (typeof navigator !== "undefined" && navigator.onLine === false) return setError(ERRORS.network);
    const old = rec.current;
    rec.current = null;
    old?.abort();
    const r = new C();
    r.lang = lang;
    r.continuous = false;
    r.interimResults = true;
    r.maxAlternatives = 3;
    let done = false;
    r.onresult = (e) => {
      let text = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal && !done) {
          done = true;
          const alts = Array.from({ length: res.length }, (_, k) => res[k].transcript.trim()).filter(Boolean);
          setInterim("");
          onText(alts[0] ?? "", alts.slice(1));
          return;
        }
        text += res[0].transcript;
      }
      setInterim(text);
    };
    r.onerror = (e) => {
      if (e.error !== "aborted") setError(ERRORS[e.error] ?? "Could not hear that. Try again.");
    };
    r.onend = () => {
      // An older listen that ends late must not switch off the new one.
      if (rec.current !== r) return;
      setListening(false);
      rec.current = null;
    };
    setError("");
    setInterim("");
    setListening(true);
    rec.current = r;
    try {
      r.start();
    } catch {
      setListening(false);
    }
  }, []);
  const stop = useCallback(() => rec.current?.stop(), []);
  return { supported, listening, interim, error, start, stop, setError };
}

/** Reads text aloud (an Urdu voice when the computer has one, otherwise the Roman Urdu text in English). */
export function speak(urdu: string, roman: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const voices = window.speechSynthesis.getVoices();
  const ur = voices.find((v) => v.lang.toLowerCase().startsWith("ur"));
  const u = new SpeechSynthesisUtterance(ur ? urdu : roman);
  if (ur) u.voice = ur;
  else {
    const en = voices.find((v) => /en-(in|pk|gb)/i.test(v.lang)) ?? voices.find((v) => v.lang.toLowerCase().startsWith("en"));
    if (en) u.voice = en;
  }
  u.rate = 0.95;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}
