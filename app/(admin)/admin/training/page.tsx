"use client";

import { useEffect, useRef, useState } from "react";
import { fetchModels, fetchTrainingRuns, triggerTraining } from "@/lib/api";
import { MetricsChart } from "@/components/admin/MetricsChart";

interface StreamData {
  status: string;
  metrics: Record<string, any>;
}

interface RunRow {
  id: string;
  status: string;
  epochs: number;
  dataset_images: number | null;
  triggered_at: string | null;
  completed_at: string | null;
  map50: number | null;
}

function adminToken(): string {
  return process.env.NEXT_PUBLIC_ADMIN_TOKEN || "dev-admin-token";
}

export default function TrainingPage() {
  const [runId, setRunId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("idle");
  const [metrics, setMetrics] = useState<Record<string, any>>({});
  const [starting, setStarting] = useState(false);
  const [newLabelsCount, setNewLabelsCount] = useState<number | null>(null);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [perClass, setPerClass] = useState<Record<string, number> | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Label count via the server-side proxy (no secrets in the browser).
    fetch("/api/internal/training/trigger-check")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.new_labels !== undefined) setNewLabelsCount(data.new_labels);
      })
      .catch(() => {});

    fetchTrainingRuns()
      .then((d) => setRuns(d.runs))
      .catch(() => {});

    fetchModels()
      .then((m) => {
        const pc = m.deployed?.per_class ?? m.candidates?.[0]?.per_class ?? null;
        if (pc && Object.keys(pc).length > 0) setPerClass(pc);
      })
      .catch(() => {});

    return () => esRef.current?.close();
  }, []);

  const startRun = async () => {
    setStarting(true);
    setErrorMsg(null);
    try {
      const { runId: id } = await triggerTraining();
      setRunId(id);
      setStatus("queued");

      // EventSource cannot send Authorization headers - the backend accepts
      // the same dev bypass token as a ?token= query parameter.
      const src = new EventSource(
        `/api/admin/training/${id}/stream?token=${encodeURIComponent(adminToken())}`
      );
      esRef.current = src;

      src.addEventListener("status", (e: MessageEvent) => {
        try {
          const data: StreamData = JSON.parse(e.data);
          setStatus(data.status);
          setMetrics(data.metrics || {});
        } catch (err) {
          console.error("SSE parse error:", err);
        }
      });

      src.addEventListener("complete", (e: MessageEvent) => {
        try {
          const data: StreamData = JSON.parse(e.data);
          setStatus(data.status);
          setMetrics(data.metrics || {});
        } catch {}
        src.close();
        fetchTrainingRuns()
          .then((d) => setRuns(d.runs))
          .catch(() => {});
      });

      src.addEventListener("error", () => {
        setStatus((s) => (s === "done" ? s : "error"));
        src.close();
      });
    } catch (err: any) {
      setErrorMsg(err?.message || "Training trigger failed. A run may already be active.");
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-pcb-copper/20 pb-4">
        <div>
          <h1 className="text-2xl font-mono font-bold text-pcb-gold">
            Training pipeline
          </h1>
          <p className="text-xs font-mono text-pcb-gold/60 mt-1">
            YOLO retraining jobs with live progress - runs on this machine
          </p>
        </div>
        <button
          type="button"
          disabled={starting || status === "running" || status === "queued"}
          onClick={startRun}
          className="rounded bg-pcb-copper px-5 py-2.5 text-xs font-mono font-bold text-pcb-dark hover:bg-pcb-gold disabled:opacity-50 transition-colors shadow-lg"
        >
          {starting ? "Triggering…" : "Start new training run"}
        </button>
      </div>

      {errorMsg && (
        <div role="alert" className="rounded border border-status-danger/40 bg-status-danger/10 p-4 text-xs font-mono text-status-danger">
          {errorMsg}
        </div>
      )}

      {/* Dataset Health */}
      <section className="rounded bg-surface-1 p-5 border border-pcb-copper/30 space-y-3" aria-label="Dataset health">
        <h2 className="text-sm font-mono font-bold text-pcb-gold uppercase border-b border-pcb-copper/20 pb-2">
          Dataset health &amp; auto-trigger threshold
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono text-xs">
          <div>
            <span className="text-pcb-gold/60 block">New labels since last run</span>
            <span className="text-lg font-bold text-pcb-copper">
              {newLabelsCount === null ? "-" : `${newLabelsCount} ready`}
            </span>
          </div>
          <div>
            <span className="text-pcb-gold/60 block">Auto-trigger threshold</span>
            <span className="text-lg font-bold text-pcb-silver">200 labels</span>
          </div>
          <div>
            <span className="text-pcb-gold/60 block">Recorded runs</span>
            <span className="text-lg font-bold text-pcb-silver">{runs.length}</span>
          </div>
        </div>
      </section>

      {/* Live Run Monitor */}
      {runId && (
        <section className="rounded bg-surface-1 p-5 border border-pcb-copper/30 space-y-3" aria-label="Live run" aria-live="polite">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-mono font-bold text-pcb-gold uppercase">
              Live training progress (run {runId.slice(0, 8)})
            </h2>
            <span
              className={`text-xs font-mono font-bold px-2 py-0.5 rounded uppercase ${
                status === "running"
                  ? "bg-status-warning/20 text-status-warning animate-pulse"
                  : status === "done"
                  ? "bg-status-success/20 text-status-success"
                  : status === "error"
                  ? "bg-status-danger/20 text-status-danger"
                  : "bg-pcb-copper/20 text-pcb-copper"
              }`}
            >
              {status}
            </span>
          </div>

          <div role="progressbar" aria-valuenow={status === "done" ? 100 : 50} aria-valuemin={0} aria-valuemax={100} className="h-3 rounded bg-surface-0 overflow-hidden border border-pcb-copper/30">
            <div
              className="h-full bg-pcb-gold transition-all duration-500 motion-reduce:transition-none"
              style={{ width: status === "done" ? "100%" : status === "running" ? "65%" : "15%" }}
            />
          </div>

          <p className="font-mono text-xs text-pcb-silver">
            Status: <span className="font-bold text-pcb-gold">{status}</span> ·{" "}
            Metrics collected: <span className="font-bold text-pcb-copper">{Object.keys(metrics).length}</span>
          </p>
        </section>
      )}

      {/* Per-class Metrics Chart */}
      <section className="rounded bg-surface-1 p-5 border border-pcb-copper/30 space-y-3" aria-label="Per-class progress">
        <h2 className="text-sm font-mono font-bold text-pcb-gold uppercase border-b border-pcb-copper/20 pb-2">
          Per-class mAP evaluation
        </h2>
        <MetricsChart data={perClass} />
      </section>

      {/* Run History Table */}
      <section className="rounded bg-surface-1 p-5 border border-pcb-copper/30 space-y-3" aria-label="Run history">
        <h2 className="text-sm font-mono font-bold text-pcb-gold uppercase border-b border-pcb-copper/20 pb-2">
          Training runs
        </h2>
        {runs.length === 0 ? (
          <p className="text-xs font-mono text-pcb-gold/60">
            No training runs recorded yet. Trigger the first run above.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table data-testid="run-history-table" className="w-full text-xs font-mono text-left">
              <thead>
                <tr className="border-b border-pcb-copper/20 text-pcb-copper">
                  <th className="py-2" scope="col">Triggered</th>
                  <th className="py-2" scope="col">Epochs</th>
                  <th className="py-2" scope="col">mAP50</th>
                  <th className="py-2" scope="col">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pcb-copper/10">
                {runs.map((r) => (
                  <tr key={r.id} className="hover:bg-pcb-copper/10">
                    <td className="py-2 text-pcb-silver">
                      {r.triggered_at ? new Date(r.triggered_at).toLocaleString() : "-"}
                    </td>
                    <td className="py-2 text-pcb-gold">{r.epochs}</td>
                    <td className="py-2 text-status-success font-bold">
                      {r.map50 !== null && r.map50 !== undefined ? r.map50.toFixed(3) : "-"}
                    </td>
                    <td className="py-2">
                      <span className="bg-pcb-copper/20 text-pcb-copper px-2 py-0.5 rounded font-bold uppercase">
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
