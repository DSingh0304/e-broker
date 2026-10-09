"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  onCapture: (file: File) => void;
  onClose: () => void;
}

// Live camera viewfinder (getUserMedia) filling its container edge to edge,
// with overlaid capture controls like a native camera app.
export function CameraCapture({ onCapture, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("unsupported");
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch {
        if (!cancelled) setError("Camera unavailable. Check permissions, or go back and upload a photo instead.");
      }
    }
    start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) onCapture(new File([blob], "capture.jpg", { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92
    );
  };

  if (error) {
    return (
      <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 p-8 text-center lg:min-h-[520px]">
        <div role="alert" className="text-sm text-brand-red">
          <p>{error}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="min-h-[44px] rounded-lg border border-pcb-copper px-5 font-sans font-bold hover:bg-pcb-copper/10"
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="relative min-h-[420px] overflow-hidden bg-black lg:min-h-[520px]">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        aria-label="Live camera viewfinder"
        data-testid="camera-viewfinder"
        className="absolute inset-0 h-full w-full object-cover"
      />
      {/* corner brackets */}
      <div aria-hidden className="pointer-events-none absolute inset-4">
        {["left-0 top-0 border-l-4 border-t-4 rounded-tl-lg", "right-0 top-0 border-r-4 border-t-4 rounded-tr-lg", "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-lg", "bottom-0 right-0 border-b-4 border-r-4 rounded-br-lg"].map((c) => (
          <span key={c} className={`absolute h-10 w-10 border-pcb-accent ${c}`} />
        ))}
      </div>
      {/* controls */}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-4 bg-gradient-to-t from-black/80 to-transparent px-5 pb-5 pt-12">
        <button
          type="button"
          onClick={onClose}
          className="min-h-[48px] rounded-lg border border-white/40 px-5 font-sans text-sm font-bold text-white hover:bg-white/10"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={capture}
          aria-label="Capture photo"
          className="h-[72px] w-[72px] rounded-full border-4 border-white bg-pcb-accent transition-transform hover:scale-105 active:scale-95"
        >
          <span className="sr-only">Capture photo</span>
        </button>
        <span aria-hidden className="w-[92px]" />
      </div>
    </div>
  );
}
