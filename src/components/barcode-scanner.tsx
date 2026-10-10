"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, ScanLine } from "lucide-react";
import { Button, Modal } from "./ui";

/**
 * USB / Bluetooth barcode scanners act like a keyboard: they type the code very fast and press
 * Enter. This hook catches such bursts anywhere on the page (when the cursor is not in a text box)
 * and calls onScan with the code.
 */
export function useBarcodeScanner(onScan: (code: string) => void, enabled = true) {
  const handler = useRef(onScan);
  handler.current = onScan;
  useEffect(() => {
    if (!enabled) return;
    let buffer = "";
    let last = 0;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      const now = Date.now();
      if (now - last > 60) buffer = ""; // people type slower than this; scanners are much faster
      last = now;
      if (e.key === "Enter") {
        if (buffer.length >= 4) {
          e.preventDefault();
          handler.current(buffer);
        }
        buffer = "";
        return;
      }
      if (e.key.length === 1) buffer += e.key;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}

/** Short beep so the cashier hears that a code was read. */
export function beep() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 1500;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.09);
    osc.onended = () => ctx.close();
  } catch {
    /* sound is optional */
  }
}

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };

/**
 * Camera barcode scanner. Uses the browser's built-in BarcodeDetector when available
 * (Chrome on Android/Mac/ChromeOS) and the ZXing library everywhere else.
 * `continuous` keeps the camera open for scanning many items (billing).
 */
export function CameraScanner({
  open,
  onClose,
  onScan,
  continuous = false,
  title = "Scan barcode",
}: {
  open: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
  continuous?: boolean;
  title?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  const [lastCode, setLastCode] = useState("");
  const handler = useRef(onScan);
  handler.current = onScan;
  // Kept in refs so a parent re-render does not restart the camera.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    setError("");
    setLastCode("");
    let stopped = false;
    let stream: MediaStream | null = null;
    let zxingControls: { stop: () => void } | null = null;
    let timer: number | undefined;
    let recent = { code: "", seenAt: 0 };

    const found = (code: string) => {
      // The camera reads a code many times per second. A code that is still in view (seen within
      // the last 1.2 s) is counted once; move it away and show it again to add another one.
      const now = Date.now();
      const stillInView = code === recent.code && now - recent.seenAt < 1200;
      recent = { code, seenAt: now };
      if (stillInView) return;
      beep();
      setLastCode(code);
      handler.current(code);
      if (!continuous) closeRef.current();
    };

    async function start() {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setError("The camera only works on a secure connection (https or this computer's localhost). Use a USB scanner, or open the app over https.");
        return;
      }
      try {
        const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
        if (BD) {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
          if (stopped) return;
          const video = videoRef.current!;
          video.srcObject = stream;
          await video.play();
          const detector = new BD({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "qr_code"] });
          const tick = async () => {
            if (stopped) return;
            try {
              const codes = await detector.detect(video);
              if (codes[0]?.rawValue) found(codes[0].rawValue);
            } catch {
              /* frame not ready */
            }
            timer = window.setTimeout(tick, 150);
          };
          tick();
        } else {
          const { BrowserMultiFormatReader } = await import("@zxing/browser");
          if (stopped) return;
          const reader = new BrowserMultiFormatReader();
          zxingControls = await reader.decodeFromConstraints(
            { video: { facingMode: { ideal: "environment" } }, audio: false },
            videoRef.current!,
            (result) => {
              if (result) found(result.getText());
            },
          );
          if (stopped) zxingControls.stop();
        }
      } catch (err) {
        const name = (err as Error).name;
        setError(
          name === "NotAllowedError"
            ? "Camera permission was refused. Allow the camera for this site in the browser settings."
            : name === "NotFoundError"
              ? "No camera found on this device."
              : "Could not start the camera.",
        );
      }
    }
    start();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      zxingControls?.stop();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open, continuous]);

  return (
    <Modal open={open} onClose={onClose} title={title} size="md">
      {error ? (
        <div className="flex flex-col items-center py-8 text-center">
          <CameraOff className="h-12 w-12 text-slate-400" />
          <p className="mt-3 text-sm text-slate-600">{error}</p>
        </div>
      ) : (
        <div>
          <div className="relative overflow-hidden rounded-2xl bg-black">
            <video ref={videoRef} className="aspect-[4/3] w-full object-cover" muted playsInline />
            <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 animate-pulse bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,.9)]" />
            <div className="pointer-events-none absolute inset-6 rounded-xl border-2 border-white/60" />
          </div>
          <p className="mt-3 flex items-center justify-center gap-2 text-sm text-slate-500">
            <ScanLine className="h-4 w-4" /> Hold the barcode inside the frame
          </p>
          {continuous && lastCode && (
            <p className="mt-2 text-center text-sm font-semibold text-emerald-700">Added: {lastCode}</p>
          )}
        </div>
      )}
      {continuous && (
        <Button className="mt-4 w-full" variant="outline" onClick={onClose}>
          Done scanning
        </Button>
      )}
    </Modal>
  );
}

/** Small camera button used next to search boxes. */
export function CameraButton({ onClick, label = "Scan with camera" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-600 shadow-sm hover:bg-slate-50 hover:text-brand-700"
    >
      <Camera className="h-5 w-5" />
    </button>
  );
}
