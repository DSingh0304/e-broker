import { useEffect } from "react";
import type { QueueItem } from "@/lib/api";
import { LOW_CONFIDENCE_THRESHOLD } from "@/lib/constants";

interface Props {
  item: QueueItem;
  focused?: boolean;
  onApprove: (imageId: string) => void;
  onSkip: (imageId: string) => void;
  onCorrect: (imageId: string) => void;
}

export function ReviewCard({ item, focused, onApprove, onSkip, onCorrect }: Props) {
  useEffect(() => {
    if (!focused) return;
    const handler = (e: KeyboardEvent) => {
      // Never hijack keystrokes while the reviewer is typing in a form field.
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      const key = e.key.toLowerCase();
      if (key === "a") onApprove(item.imageId);
      else if (key === "s") onSkip(item.imageId);
      else if (key === "c") onCorrect(item.imageId);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [focused, item.imageId, onApprove, onSkip, onCorrect]);

  const minConf = Math.min(...item.detections.map((d) => d.confidence), 1);
  const lowConf = minConf < LOW_CONFIDENCE_THRESHOLD;

  return (
    <article
      data-testid="queue-item"
      data-image-id={item.imageId}
      className="flex gap-4 rounded-lg border border-surface-border bg-surface-1 p-4"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.thumbnailUrl}
        alt={`Upload ${item.imageId}`}
        className="h-20 w-20 rounded object-cover"
      />
      <div className="flex-1">
        <p className="text-sm text-text-secondary">
          {new Date(item.uploadedAt).toISOString().slice(0, 10)} · {item.reviewStatus}
        </p>
        <ul className="mt-1">
          {item.detections.map((d, i) => (
            <li key={i} className="text-sm">
              <span className="capitalize">{d.className}</span>{" "}
              <span className="font-mono">({d.confidence.toFixed(2)})</span>
            </li>
          ))}
        </ul>
        {lowConf && (
          <p className="mt-1 text-xs font-medium text-brand-amber">
            Low confidence - needs review
          </p>
        )}
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            aria-label="Approve"
            onClick={() => onApprove(item.imageId)}
            className="min-h-[44px] rounded bg-brand-green px-3 py-1 text-sm font-semibold"
          >
            ✓ Approve
          </button>
          <button
            type="button"
            aria-label="Correct"
            onClick={() => onCorrect(item.imageId)}
            className="min-h-[44px] rounded border border-surface-border px-3 py-1 text-sm"
          >
            Correct
          </button>
          <button
            type="button"
            aria-label="Skip"
            onClick={() => onSkip(item.imageId)}
            className="min-h-[44px] rounded border border-surface-border px-3 py-1 text-sm"
          >
            ✗ Skip
          </button>
        </div>
      </div>
    </article>
  );
}
