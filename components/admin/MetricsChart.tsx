"use client";

import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from "recharts";

export function MetricsChart({ data }: { data?: Record<string, number> | null }) {
  const rows = Object.entries(data ?? {})
    .filter(([, v]) => typeof v === "number" && Number.isFinite(v))
    .map(([cls, mAP]) => ({ cls, mAP }))
    .sort((a, b) => b.mAP - a.mAP);

  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-xs font-mono text-pcb-gold/60">
        No per-class metrics recorded yet — they appear after the first
        evaluated training run.
      </p>
    );
  }

  return (
    <div className="h-64" role="img" aria-label="Per-class mAP bar chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical">
          <XAxis type="number" domain={[0, 1]} />
          <YAxis type="category" dataKey="cls" width={110} />
          <Bar dataKey="mAP" fill="#22C55E" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
