"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { approveQueueItem, fetchQueue, skipQueueItem, type QueueItem } from "@/lib/api";
import { ReviewCard } from "@/components/admin/ReviewCard";

export default function QueuePage() {
  const router = useRouter();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>("pending");
  const [focusedIndex, setFocusedIndex] = useState<number>(0);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchQueue({ page, sort: "confidence_asc", status });
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      console.error("Failed to load queue:", err);
    }
  }, [page, status]);

  useEffect(() => {
    load();
  }, [load]);

  const removeFromList = (imageId: string) => {
    setItems((prev) => prev.filter((i) => i.imageId !== imageId));
    setTotal((t) => Math.max(0, t - 1));
  };

  const handleApprove = async (imageId: string) => {
    setActionError(null);
    try {
      await approveQueueItem(imageId);
      removeFromList(imageId);
    } catch {
      setActionError("Could not approve that item — it is still in the queue. Try again.");
    }
  };

  const handleSkip = async (imageId: string) => {
    setActionError(null);
    try {
      await skipQueueItem(imageId);
      removeFromList(imageId);
    } catch {
      setActionError("Could not skip that item — it is still in the queue. Try again.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-pcb-copper/20 pb-4">
        <div>
          <h1 className="text-2xl font-mono font-bold text-pcb-gold">
            📋 REVIEW QUEUE
          </h1>
          <p aria-live="polite" className="text-xs font-mono text-pcb-gold/60 mt-1">
            {total} item(s) awaiting review for status: <span className="font-bold text-pcb-copper">{status.toUpperCase()}</span>
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <label htmlFor="queue-status" className="text-xs font-mono text-pcb-gold/70">Filter Status:</label>
          <select
            id="queue-status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="rounded bg-surface-1 border border-pcb-copper/30 px-3 py-1.5 text-xs font-mono text-pcb-gold focus:outline-none focus:border-pcb-gold"
          >
            <option value="pending">Pending Review</option>
            <option value="approved">Approved</option>
            <option value="corrected">Corrected</option>
            <option value="skipped">Skipped</option>
          </select>
        </div>
      </div>

      {/* Keyboard shortcut legend */}
      <div className="rounded bg-surface-1 p-3 border border-pcb-copper/30 flex items-center justify-between text-xs font-mono text-pcb-silver">
        <span>⚡ Keyboard Shortcuts (top card): <kbd className="bg-pcb-copper/20 text-pcb-gold px-1.5 py-0.5 rounded">A</kbd> Approve · <kbd className="bg-pcb-copper/20 text-pcb-gold px-1.5 py-0.5 rounded">C</kbd> Correct · <kbd className="bg-pcb-copper/20 text-pcb-gold px-1.5 py-0.5 rounded">S</kbd> Skip</span>
        <span>Page {page} of {Math.max(1, Math.ceil(total / 50))}</span>
      </div>

      {/* Queue items list */}
      {actionError && (
        <div role="alert" className="rounded border border-status-danger/40 bg-status-danger/10 p-3 text-xs font-mono text-status-danger">
          {actionError}
        </div>
      )}
      <div className="grid gap-4">
        {items.length === 0 ? (
          <div className="rounded bg-surface-1 p-8 text-center border border-pcb-copper/20">
            <p className="text-sm font-mono text-pcb-gold/60">
              No items in queue for status: {status}.
            </p>
          </div>
        ) : (
          items.map((item, idx) => (
            <div
              key={item.imageId}
              onClick={() => setFocusedIndex(idx)}
              className={idx === focusedIndex ? "ring-2 ring-pcb-gold rounded-lg" : ""}
            >
              <ReviewCard
                item={item}
                focused={idx === focusedIndex}
                onApprove={handleApprove}
                onSkip={handleSkip}
                onCorrect={(id) => router.push(`/admin/labeller/${id}`)}
              />
            </div>
          ))
        )}
      </div>

      {/* Pagination Controls */}
      {total > 50 && (
        <div className="flex items-center justify-center gap-4 pt-4">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded border border-pcb-copper/40 px-4 py-2 text-xs font-mono text-pcb-gold disabled:opacity-40 hover:bg-pcb-copper/20 transition-colors"
          >
            ← Previous Page
          </button>
          <span className="text-xs font-mono text-pcb-copper">
            Page {page} of {Math.ceil(total / 50)}
          </span>
          <button
            disabled={page >= Math.ceil(total / 50)}
            onClick={() => setPage((p) => p + 1)}
            className="rounded border border-pcb-copper/40 px-4 py-2 text-xs font-mono text-pcb-gold disabled:opacity-40 hover:bg-pcb-copper/20 transition-colors"
          >
            Next Page →
          </button>
        </div>
      )}
    </div>
  );
}
