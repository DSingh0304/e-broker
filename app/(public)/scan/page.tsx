"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CameraCapture } from "@/components/scan/CameraCapture";
import { UploadZone } from "@/components/scan/UploadZone";
import { Mascot } from "@/components/brand/Mascot";
import { BackButton } from "@/components/layout/BackButton";
import { fetchDetections, scanImageUrl, uploadImage } from "@/lib/api";

type Stage = "idle" | "camera" | "preview" | "analyzing" | "error";
type Phase = "uploading" | "detecting" | "done";

const STEPS = ["Capture", "Review", "Results"] as const;

function stepIndex(stage: Stage): number {
  if (stage === "preview" || stage === "analyzing" || stage === "error") return 1;
  return 0;
}

function GuideTip({ stage }: { stage: Stage }) {
  const tip =
    stage === "preview"
      ? "Looks sharp? Analyze it — or retake if it's blurry or dark."
      : stage === "analyzing"
        ? "Reading every component. This usually takes a few seconds."
        : stage === "error"
          ? "That didn't go through. Your photo is safe — try again."
          : "Good light and a flat lay is all Kabadi needs.";
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-pcb-copper/40 bg-black/25 p-4">
      <Mascot progress={0} className="h-16 w-16 shrink-0" />
      <p aria-live="polite" className="font-sans text-sm leading-relaxed text-pcb-gold">
        <span className="font-display text-xs font-bold uppercase tracking-widest text-pcb-accent">Kabadi says</span>
        <br />
        {tip}
      </p>
    </div>
  );
}

function CameraIcon() {
  return (
    <svg aria-hidden width="22" height="22" viewBox="0 0 16 16" fill="none">
      <rect x="1.5" y="4" width="13" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="8.5" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 4 6.5 2.5h3L10.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export default function ScanPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("idle");
  const [phase, setPhase] = useState<Phase>("uploading");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const selectFile = (f: File) => {
    if (!f.type.startsWith("image/")) {
      setError("That file isn't an image. Choose a JPG, PNG, or WebP photo.");
      setStage("error");
      return;
    }
    if (f.size > 15 * 1024 * 1024) {
      setError("That photo is over 15 MB. Retake it at a lower resolution.");
      setStage("error");
      return;
    }
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(f);
    });
    setFile(f);
    setError(null);
    setStage("preview");
  };

  const analyzeFile = async (f: File) => {
    setStage("analyzing");
    setPhase("uploading");
    setError(null);
    try {
      const { imageId } = await uploadImage(f);
      setPhase("detecting");
      await fetchDetections(imageId);
      setPhase("done");
      router.push(`/result/${imageId}`);
    } catch {
      setError("Upload failed. Check your connection, then try again — your photo is still here.");
      setStage("error");
    }
  };

  const handleUrlScan = async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      setError("Select an image first.");
      setStage("error");
      return;
    }
    setStage("analyzing");
    setPhase("uploading");
    setError(null);
    try {
      const { imageId } = await scanImageUrl(trimmed);
      setPhase("detecting");
      await fetchDetections(imageId);
      setPhase("done");
      router.push(`/result/${imageId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not fetch that image URL. Check the link.");
      setStage("error");
    }
  };

  const retake = () => {
    setFile(null);
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
    setError(null);
    setStage("idle");
  };

  const analyzing = stage === "analyzing";
  const currentStep = analyzing ? 2 : stepIndex(stage);

  return (
    <div className="bg-[#0B100E] text-[#EDE6D2]">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-10">
      {/* header + stepper */}
      <header className="flex flex-wrap items-center gap-3">
        <BackButton href="/" label="Back" tone="dark" ariaLabel="Back to home" />
        <h1 className="font-display text-xl font-bold uppercase text-pcb-accent sm:text-2xl">Scan your e-waste</h1>
      </header>

      <nav aria-label="Scan progress" className="mt-5">
        <ol className="flex items-center gap-2">
          {STEPS.map((s, i) => {
            const done = i < currentStep;
            const now = i === currentStep;
            return (
              <li key={s} className="flex flex-1 items-center gap-2 last:flex-none" aria-current={now ? "step" : undefined}>
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-display text-sm font-bold ${
                    done ? "bg-brand-green text-black" : now ? "bg-pcb-accent text-black" : "border border-pcb-copper/50 text-text-secondary"
                  }`}
                >
                  {done ? "✓" : i + 1}
                </span>
                <span className={`font-display text-xs font-bold uppercase tracking-widest sm:text-sm ${now || done ? "text-pcb-gold" : "text-text-secondary"}`}>
                  {s}
                </span>
                {i < STEPS.length - 1 && <span aria-hidden className={`mx-1 h-0.5 flex-1 rounded ${done ? "bg-brand-green" : "bg-pcb-copper/30"}`} />}
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        {/* ── stage (common region) ─────────────────────────── */}
        <section aria-label="Photo stage" aria-busy={analyzing} className="overflow-hidden rounded-2xl border-2 border-pcb-copper/60 bg-black/40">
          {stage === "camera" && !analyzing && (
            <CameraCapture
              onCapture={(f) => {
                setStage("preview");
                selectFile(f);
              }}
              onClose={() => setStage("idle")}
            />
          )}

          {stage === "preview" && previewUrl && (
            <figure className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="Your e-waste photo, ready to analyze" className="max-h-[52vh] w-full object-contain bg-black" />
              <figcaption className="flex items-center justify-between gap-2 border-t border-pcb-copper/40 px-4 py-2 font-sans text-xs text-text-secondary">
                <span className="truncate">{file?.name ?? "photo"}</span>
                <span className="shrink-0">{file ? (file.size >= 1048576 ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`) : ""}</span>
              </figcaption>
            </figure>
          )}

          {analyzing && (
            <div className="relative" aria-live="polite">
              {previewUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={previewUrl} alt="" className="max-h-[52vh] w-full object-contain bg-black opacity-60" />
              ) : (
                <div className="flex h-64 items-center justify-center">Loading…</div>
              )}
              <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="h-16 w-full bg-gradient-to-b from-transparent via-brand-green/40 to-transparent motion-safe:animate-[scanline_1.6s_ease-in-out_infinite]" />
              </div>
              <p className="absolute inset-x-0 top-4 text-center font-display text-sm font-bold uppercase tracking-widest text-pcb-gold">
                Analyzing…
              </p>
            </div>
          )}

          {(stage === "idle" || stage === "error") && (
            <div className="relative min-h-[420px] lg:min-h-[520px]">
              <UploadZone onFile={selectFile} loading={false} error={null} className="absolute inset-3" />
            </div>
          )}

          {stage === "error" && error && (
            <div role="alert" className="border-t border-brand-red/50 bg-brand-red/10 px-4 py-3 sm:px-6">
              <p className="font-sans text-sm text-brand-red">{error}</p>
            </div>
          )}
        </section>

        {/* ── actions + guide (proximity) ───────────────────── */}
        <div className="flex flex-col gap-4">
          <GuideTip stage={stage} />

          {stage === "idle" && (
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => setStage("camera")}
                className="inline-flex min-h-[60px] items-center justify-center gap-3 rounded-xl bg-pcb-accent px-6 font-sans text-lg font-bold text-black hover:brightness-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D98C53]"
              >
                <CameraIcon />
                Take a photo
              </button>
              <button
                type="button"
                onClick={() => document.getElementById("scan-upload")?.click()}
                className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl border border-pcb-copper px-6 font-sans font-bold hover:bg-pcb-copper/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D98C53]"
              >
                Choose from gallery
              </button>
              <details className="rounded-xl border border-pcb-copper/40 px-4 py-3">
                <summary className="cursor-pointer font-display text-sm font-bold uppercase tracking-wide hover:text-pcb-accent">
                  Or paste an image link
                </summary>
                <div className="mt-3 flex gap-2">
                  <label htmlFor="scan-url" className="sr-only">Paste image URL</label>
                  <input
                    id="scan-url"
                    type="url"
                    autoComplete="off"
                    spellCheck={false}
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://…"
                    className="min-h-[44px] w-full min-w-0 flex-1 rounded-lg border border-pcb-copper bg-black/30 px-3 text-pcb-gold outline-none focus:border-pcb-accent"
                  />
                  <button type="button" onClick={handleUrlScan} className="min-h-[44px] shrink-0 rounded-lg bg-pcb-accent px-5 font-display text-sm font-bold uppercase text-black hover:brightness-90">
                    Execute
                  </button>
                </div>
              </details>
            </div>
          )}

          {stage === "camera" && (
            <p className="font-sans text-sm text-text-secondary">
              Point at your scrap and tap capture — you&apos;ll review the photo before anything uploads.
            </p>
          )}

          {stage === "preview" && (
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => file && analyzeFile(file)}
                disabled={!file}
                className="min-h-[60px] rounded-xl bg-pcb-accent px-6 font-sans text-lg font-bold text-black hover:brightness-90 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D98C53]"
              >
                Analyze this photo
              </button>
              <button
                type="button"
                onClick={retake}
                className="min-h-[52px] rounded-xl border border-pcb-copper px-6 font-sans font-bold hover:bg-pcb-copper/10"
              >
                Retake
              </button>
            </div>
          )}

          {analyzing && (
            <ol aria-label="Analysis progress" className="space-y-2 rounded-2xl border border-pcb-copper/40 bg-black/25 p-4">
              {[
                { key: "uploading", label: "Uploading photo" },
                { key: "detecting", label: "Detecting components" },
                { key: "done", label: "Opening your results" },
              ].map((s) => {
                const order: Phase[] = ["uploading", "detecting", "done"];
                const reached = order.indexOf(phase) >= order.indexOf(s.key as Phase);
                const live = phase === s.key && phase !== "done";
                return (
                  <li key={s.key} className="flex items-center gap-3 font-sans text-sm" aria-current={live ? "step" : undefined}>
                    <span aria-hidden className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${reached ? "bg-brand-green text-black" : "border border-pcb-copper/50 text-text-secondary"}`}>
                      {reached ? "✓" : ""}
                    </span>
                    <span className={reached ? "text-pcb-gold" : "text-text-secondary"}>
                      {s.label}{live ? "…" : ""}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}

          {stage === "error" && (
            <div className="flex flex-col gap-3">
              {file && previewUrl ? (
                <button
                  type="button"
                  onClick={() => analyzeFile(file)}
                  className="min-h-[52px] rounded-xl bg-pcb-accent px-6 font-sans font-bold text-black hover:brightness-90"
                >
                  Try again
                </button>
              ) : null}
              <button
                type="button"
                onClick={retake}
                className="min-h-[52px] rounded-xl border border-pcb-copper px-6 font-sans font-bold hover:bg-pcb-copper/10"
              >
                Use a different photo
              </button>
            </div>
          )}

          {/* tips: chunked trio (hidden while the camera fills the stage) */}
          {stage !== "camera" && (
          <section aria-label="Photo tips" className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            {[
              { t: "Good light", d: "Daylight beats flash." },
              { t: "Flat lay", d: "Spread items, plain base." },
              { t: "Pile on", d: "Many items, one photo." },
            ].map((tip) => (
              <div key={tip.t} className="rounded-xl border border-pcb-copper/30 bg-black/20 p-3">
                <h2 className="font-display text-xs font-bold uppercase tracking-widest text-pcb-accent">{tip.t}</h2>
                <p className="mt-1 font-sans text-xs leading-snug text-text-secondary">{tip.d}</p>
              </div>
            ))}
          </section>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
