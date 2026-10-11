"use client";

import { useEffect, useState } from "react";
import { fetchModels, deployModel, rejectModel, type ModelsResponse, type ModelVersionData } from "@/lib/api";
import { UNIFIED_CLASSES } from "@/lib/constants";

export default function ModelsPage() {
  const [data, setData] = useState<ModelsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadModels = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetchModels();
      setData(res);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to load models");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadModels();
  }, []);

  const handleDeploy = async (versionId: string) => {
    setActionId(versionId);
    setErrorMsg(null);
    try {
      await deployModel(versionId);
      await loadModels();
    } catch (err: any) {
      setErrorMsg(err.message || "Deploy failed");
    } finally {
      setActionId(null);
    }
  };

  const handleReject = async (versionId: string) => {
    setActionId(versionId);
    setErrorMsg(null);
    try {
      await rejectModel(versionId);
      await loadModels();
    } catch (err: any) {
      setErrorMsg(err.message || "Reject failed");
    } finally {
      setActionId(null);
    }
  };

  const deployed = data?.deployed;
  const candidates = (data?.candidates || []).filter((c) => c.map50 !== null && c.map50 !== undefined);
  const candidatesNoMetric = (data?.candidates || []).filter(
    (c) => c.map50 === null || c.map50 === undefined
  );
  const activeCandidate = candidates[0];

  const fmtPct = (v: number | null | undefined) =>
    v === null || v === undefined ? "-" : `${(v * 100).toFixed(1)}%`;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between border-b border-pcb-copper/20 pb-4">
        <div>
          <h1 className="text-2xl font-mono font-bold text-pcb-gold">
            📦 MODEL VERSIONS &amp; DEPLOYMENTS
          </h1>
          <p className="text-xs font-mono text-pcb-gold/60 mt-1">
            YOLO26m Object Detection Model Lifecycle &amp; Per-Class mAP Evaluation
          </p>
        </div>
        <button
          type="button"
          onClick={loadModels}
          disabled={loading}
          className="rounded border border-pcb-copper/40 px-3 py-1.5 text-xs font-mono font-bold text-pcb-gold hover:bg-pcb-copper/20 transition-colors"
        >
          🔄 Refresh
        </button>
      </div>

      {errorMsg && (
        <div className="rounded bg-status-danger/20 border border-status-danger/40 p-4 text-xs font-mono text-status-danger">
          ⚠️ Error: {errorMsg}
        </div>
      )}

      {/* Deployed Model Card */}
      <div className="rounded bg-surface-1 p-5 border border-pcb-copper/30 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono uppercase bg-status-success/20 text-status-success px-2 py-0.5 rounded font-bold">
              ● Currently Deployed
            </span>
            <h2 className="text-lg font-mono font-bold text-pcb-gold mt-1">
              Version: {deployed ? deployed.version : "No deployment yet"}
            </h2>
          </div>
          <div className="text-right">
            <span className="text-xs font-mono text-pcb-copper">mAP50 Baseline</span>
            <div className="text-2xl font-mono font-bold text-status-success">
              {deployed?.map50 !== null && deployed?.map50 !== undefined ? (deployed.map50 * 100).toFixed(1) + "%" : "-"}
            </div>
          </div>
        </div>
        {deployed?.deployed_at && (
          <p className="text-xs font-mono text-pcb-gold/50">
            Deployed at: {new Date(deployed.deployed_at).toLocaleString()} by {deployed.approved_by || "System"}
          </p>
        )}
      </div>

      {/* Candidate Evaluation Section */}
      {activeCandidate ? (
        <section data-testid="candidate-model" className="rounded bg-surface-1 p-5 border border-pcb-copper/30 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] font-mono uppercase bg-status-warning/20 text-status-warning px-2 py-0.5 rounded font-bold">
                ★ Top Candidate Model
              </span>
              <h2 className="text-lg font-mono font-bold text-pcb-gold mt-1">
                Version: {activeCandidate.version} ({activeCandidate.s3_key})
              </h2>
            </div>
            <div className="text-right">
              <span className="text-xs font-mono text-pcb-gold/60">Candidate mAP50</span>
              <div className="text-2xl font-mono font-bold text-pcb-gold">
                {fmtPct(activeCandidate.map50)}
                {deployed?.map50 !== null && deployed?.map50 !== undefined && activeCandidate.map50 !== null && activeCandidate.map50 !== undefined && (
                  <span className={`text-xs ml-2 ${activeCandidate.map50 >= deployed.map50 ? "text-status-success" : "text-status-danger"}`}>
                    ({activeCandidate.map50 >= deployed.map50 ? "+" : ""}
                    {((activeCandidate.map50 - deployed.map50) * 100).toFixed(1)}%)
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Per-class breakdown table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono text-left">
              <thead>
                <tr className="border-b border-pcb-copper/20 text-pcb-copper">
                  <th className="py-2" scope="col">Class Name</th>
                  <th className="py-2" scope="col">Deployed mAP50</th>
                  <th className="py-2" scope="col">Candidate mAP50</th>
                  <th className="py-2" scope="col">Delta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pcb-copper/10">
                {UNIFIED_CLASSES.map((cls) => {
                  const oldVal = deployed?.per_class?.[cls] ?? null;
                  const newVal = activeCandidate.per_class?.[cls] ?? activeCandidate.map50;
                  if (oldVal === null || oldVal === undefined || newVal === null || newVal === undefined) {
                    return (
                      <tr key={cls} className="hover:bg-pcb-copper/10">
                        <td className="py-2 font-bold text-pcb-silver capitalize">{cls}</td>
                        <td className="py-2 text-pcb-gold/70">{fmtPct(oldVal)}</td>
                        <td className="py-2 font-bold text-pcb-gold">{fmtPct(newVal)}</td>
                        <td className="py-2 font-bold text-pcb-gold/50">-</td>
                      </tr>
                    );
                  }
                  const delta = (newVal as number) - (oldVal as number);
                  return (
                    <tr key={cls} className="hover:bg-pcb-copper/10">
                      <td className="py-2 font-bold text-pcb-silver capitalize">{cls}</td>
                      <td className="py-2 text-pcb-gold/70">{fmtPct(oldVal)}</td>
                      <td className="py-2 font-bold text-pcb-gold">{fmtPct(newVal)}</td>
                      <td className={`py-2 font-bold ${delta >= 0 ? "text-status-success" : "text-status-danger"}`}>
                        {delta >= 0 ? "+" : ""}
                        {(delta * 100).toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              data-testid="deploy-btn"
              disabled={actionId === activeCandidate.id}
              onClick={() => handleDeploy(activeCandidate.id)}
              className="rounded bg-pcb-copper px-5 py-2.5 text-xs font-mono font-bold text-pcb-dark hover:bg-pcb-gold disabled:opacity-50 transition-colors shadow-lg"
            >
              {actionId === activeCandidate.id ? "Deploying..." : "✓ Approve & Deploy Model"}
            </button>
            <button
              type="button"
              disabled={actionId === activeCandidate.id}
              onClick={() => handleReject(activeCandidate.id)}
              className="rounded border border-status-danger/40 px-5 py-2.5 text-xs font-mono font-bold text-status-danger hover:bg-status-danger/10 disabled:opacity-50 transition-colors"
            >
              ✗ Reject Model
            </button>
          </div>
        </section>
      ) : candidatesNoMetric.length > 0 ? (
        <div className="rounded bg-surface-1 p-6 text-center border border-pcb-copper/20">
          <p className="text-xs font-mono text-pcb-gold/60">
            {candidatesNoMetric.length} recorded version(s) have no evaluation metrics yet -
            they appear here once training reports mAP scores.
          </p>
        </div>
      ) : (
        <div className="rounded bg-surface-1 p-6 text-center border border-pcb-copper/20">
          <p className="text-xs font-mono text-pcb-gold/60">
            No candidate models available for deployment comparison.
          </p>
        </div>
      )}

      {/* History table */}
      {candidates.length > 1 && (
        <div className="rounded bg-surface-1 p-5 border border-pcb-copper/30 space-y-3">
          <h3 className="text-sm font-mono font-bold text-pcb-gold uppercase border-b border-pcb-copper/20 pb-2">
            Other Candidates History ({candidates.length - 1})
          </h3>
          <div className="divide-y divide-pcb-copper/10">
            {candidates.slice(1).map((cand) => (
              <div key={cand.id} className="py-2 flex items-center justify-between text-xs font-mono">
                <div>
                  <span className="font-bold text-pcb-silver">{cand.version}</span>
                  <span className="text-pcb-gold/50 ml-2">({cand.s3_key})</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-pcb-gold font-bold">mAP50: {fmtPct(cand.map50)}</span>
                  <button
                    type="button"
                    onClick={() => handleDeploy(cand.id)}
                    className="text-pcb-copper hover:underline text-[10px]"
                  >
                    Deploy
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
