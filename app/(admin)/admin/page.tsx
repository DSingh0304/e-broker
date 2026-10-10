"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getAdminStats } from "@/lib/api";

interface AdminStatsData {
  pending_count: number;
  approved_labels: number;
  deployed_model: string | null;
  map50: number | null;
  training_status: string;
  recent_activity: Array<{
    id: string;
    title: string;
    subtitle: string;
    time: string;
    status: string;
  }>;
}

export default function AdminHome() {
  const [stats, setStats] = useState<AdminStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    async function loadStats() {
      try {
        const data = await getAdminStats();
        setStats(data);
      } catch (err) {
        console.error("Failed to fetch admin stats:", err);
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-pcb-copper/20 pb-4">
        <div>
          <h1 className="text-2xl font-mono font-bold text-pcb-gold">
            ⚙ COMMAND CENTER
          </h1>
          <p className="text-xs text-pcb-gold/60 mt-1 font-mono">
            E-Waste Detection & Model Lifecycle Management
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/admin/queue"
            className="rounded bg-pcb-copper px-4 py-2 text-xs font-mono font-bold text-pcb-dark hover:bg-pcb-gold transition-colors"
          >
            Review Queue →
          </Link>
          <Link
            href="/admin/training"
            className="rounded border border-pcb-copper/40 px-4 py-2 text-xs font-mono text-pcb-gold hover:border-pcb-gold transition-colors"
          >
            Launch Training ⚡
          </Link>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded border border-pcb-copper/30 bg-surface-1 p-4 shadow-lg">
          <span className="text-xs font-mono text-pcb-gold/60 uppercase">
            Pending Review
          </span>
          <div className="text-3xl font-mono font-bold text-status-warning mt-1">
            {loading ? "..." : stats?.pending_count ?? 0}
          </div>
          <Link
            href="/admin/queue"
            className="text-xs font-mono text-pcb-gold hover:underline mt-2 inline-block"
          >
            Go to Queue →
          </Link>
        </div>

        <div className="rounded border border-pcb-copper/30 bg-surface-1 p-4 shadow-lg">
          <span className="text-xs font-mono text-pcb-gold/60 uppercase">
            Approved Labels
          </span>
          <div className="text-3xl font-mono font-bold text-status-success mt-1">
            {loading ? "..." : stats?.approved_labels ?? 0}
          </div>
          <span className="text-xs font-mono text-pcb-gold/50 mt-2 block">
            Dataset Total
          </span>
        </div>

        <div className="rounded border border-pcb-copper/30 bg-surface-1 p-4 shadow-lg">
          <span className="text-xs font-mono text-pcb-gold/60 uppercase">
            Deployed Model
          </span>
          <div className="text-3xl font-mono font-bold text-pcb-copper mt-1">
            {loading ? "..." : stats?.deployed_model ?? "—"}
          </div>
          <div className="text-xs font-mono text-pcb-gold/70 mt-2">
            mAP50:{" "}
            <span className="font-bold">
              {stats?.map50 !== null && stats?.map50 !== undefined
                ? (stats.map50 * 100).toFixed(1) + "%"
                : "—"}
            </span>
          </div>
        </div>

        <div className="rounded border border-pcb-copper/30 bg-surface-1 p-4 shadow-lg">
          <span className="text-xs font-mono text-pcb-gold/60 uppercase">
            Training Status
          </span>
          <div className="flex items-center gap-2 mt-1">
            <span className="h-3 w-3 rounded-full bg-status-success animate-pulse"></span>
            <span className="text-xl font-mono font-bold text-pcb-gold">
              {loading ? "..." : stats?.training_status ?? "Idle"}
            </span>
          </div>
          <Link
            href="/admin/training"
            className="text-xs font-mono text-pcb-gold hover:underline mt-2 inline-block"
          >
            View Pipeline →
          </Link>
        </div>
      </div>

      {/* Main Content Grid */}
      {loadError && (
        <div role="alert" className="rounded border border-status-danger/40 bg-status-danger/10 p-4 text-xs font-mono text-status-danger">
          Could not reach the admin API. Check that the backend is running, then refresh.
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Activity Feed */}
        <div className="lg:col-span-2 rounded border border-pcb-copper/30 bg-surface-1 p-5 shadow-lg space-y-4">
          <h2 className="text-base font-mono font-bold text-pcb-gold flex items-center justify-between">
            <span>📋 RECENT QUEUE ACTIVITY</span>
            <Link href="/admin/queue" className="text-xs text-pcb-copper hover:underline font-normal">
              View All
            </Link>
          </h2>

          <div className="divide-y divide-pcb-copper/10">
            {loading ? (
              <div className="p-4 text-xs font-mono text-pcb-gold/50">Loading activity...</div>
            ) : stats?.recent_activity && stats.recent_activity.length > 0 ? (
              stats.recent_activity.map((item) => (
                <div key={item.id} className="py-3 flex items-center justify-between">
                  <div>
                    <Link href={`/admin/labeller/${item.id}`} className="font-mono text-sm font-bold text-pcb-gold hover:underline">
                      {item.title}
                    </Link>
                    <p className="text-xs text-pcb-silver/70 font-mono mt-0.5">
                      {item.subtitle}
                    </p>
                  </div>
                  <div className="text-right">
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-[10px] font-mono font-bold uppercase ${
                        item.status === "approved"
                          ? "bg-status-success/20 text-status-success"
                          : item.status === "corrected"
                          ? "bg-pcb-copper/20 text-pcb-copper"
                          : "bg-status-warning/20 text-status-warning"
                      }`}
                    >
                      {item.status}
                    </span>
                    <span className="text-[10px] font-mono text-pcb-gold/40 block mt-1">
                      {new Date(item.time).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-4 text-xs font-mono text-pcb-gold/50">No recent activity.</div>
            )}
          </div>
        </div>

        {/* Quick Actions Panel */}
        <div className="rounded border border-pcb-copper/30 bg-surface-1 p-5 shadow-lg space-y-4">
          <h2 className="text-base font-mono font-bold text-pcb-gold">
            ⚡ QUICK ACTIONS
          </h2>
          <div className="space-y-2">
            <Link
              href="/admin/queue"
              className="block rounded border border-pcb-copper/30 p-3 hover:bg-pcb-copper/10 transition-colors"
            >
              <div className="text-sm font-mono font-bold text-pcb-gold">
                1. Review Pending Images
              </div>
              <p className="text-xs text-pcb-silver/60 mt-1">
                Verify bounding box detections and approve labels for retraining.
              </p>
            </Link>

            <Link
              href="/admin/models"
              className="block rounded border border-pcb-copper/30 p-3 hover:bg-pcb-copper/10 transition-colors"
            >
              <div className="text-sm font-mono font-bold text-pcb-gold">
                2. Model Version Control
              </div>
              <p className="text-xs text-pcb-silver/60 mt-1">
                Compare candidate models against baseline and manage deployments.
              </p>
            </Link>

            <Link
              href="/admin/training"
              className="block rounded border border-pcb-copper/30 p-3 hover:bg-pcb-copper/10 transition-colors"
            >
              <div className="text-sm font-mono font-bold text-pcb-gold">
                3. Training Runs
              </div>
              <p className="text-xs text-pcb-silver/60 mt-1">
                Monitor active epoch metrics and trigger new training jobs.
              </p>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
