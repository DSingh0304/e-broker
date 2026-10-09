"use client";

import { useRef, useState } from "react";

interface Props {
  onFile: (file: File) => void;
  loading?: boolean;
  error?: string | null;
  title?: string;
  hint?: string;
  className?: string;
}

export function UploadZone({
  onFile,
  loading,
  error,
  title = "Click to open from computer",
  hint = "or drag and drop a photo here",
  className = "",
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  return (
    <div className={className}>
      <div
        role="button"
        tabIndex={loading ? -1 : 0}
        aria-disabled={loading}
        aria-describedby="scan-upload-hint"
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onFile(f);
        }}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        className={`flex h-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center ${
          error
            ? "border-brand-red"
            : dragOver
              ? "border-brand-green"
              : "border-surface-border"
        } ${loading ? "opacity-70" : ""}`}
      >
        {loading ? (
          <p aria-live="polite">Analyzing… Identifying components…</p>
        ) : (
          <>
            <svg aria-hidden width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-pcb-accent">
              <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1" />
              <path d="M12 4v12" />
              <path d="m8 8 4-4 4 4" />
            </svg>
            <p className="text-lg font-semibold">{title}</p>
            <p id="scan-upload-hint" className="text-sm text-text-secondary">
              {hint}
            </p>
          </>
        )}
        <label htmlFor="scan-upload" className="sr-only">
          Upload e-waste photo
        </label>
        <input
          ref={inputRef}
          id="scan-upload"
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
      </div>
      {error && (
        <div role="alert" className="mt-2 text-brand-red">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="mt-1 min-h-[44px] rounded border border-surface-border px-3 py-1"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
