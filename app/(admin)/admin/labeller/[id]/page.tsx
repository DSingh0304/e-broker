"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LabelCanvas } from "@/components/admin/LabelCanvas";
import { fetchDetections, saveLabels, type LabelPayload } from "@/lib/api";

export default function LabellerPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const [initial, setInitial] = useState<LabelPayload[] | null>(null);
  const [imageUrl] = useState<string>(`/api/images/${id}`);

  useEffect(() => {
    // The annotation canvas always draws on the stored upload bytes.
    fetchDetections(id)
      .then((d) => {
        setInitial(
          d.detections.map((det) => ({
            className: det.className,
            bbox: {
              xc: (det.bbox.x1 + det.bbox.x2) / 2,
              yc: (det.bbox.y1 + det.bbox.y2) / 2,
              w: det.bbox.x2 - det.bbox.x1,
              h: det.bbox.y2 - det.bbox.y1,
            },
          }))
        );
      })
      .catch(() => setInitial([]));
  }, [id]);

  if (!initial) {
    return (
      <div className="p-8 text-center font-mono text-xs text-pcb-gold/70" aria-live="polite">
        ⚡ Loading annotation canvas for {id}...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between border-b border-pcb-copper/20 pb-4">
        <div className="flex items-center gap-4">
          <Link
            href="/admin/queue"
            className="rounded border border-pcb-copper/40 px-3 py-1.5 text-xs font-mono font-bold text-pcb-gold hover:bg-pcb-copper/20 transition-colors"
          >
            ← Back to Queue
          </Link>
          <h1 className="font-mono text-xl font-bold text-pcb-gold">
            🏷 ANNOTATION CANVAS: <span className="text-pcb-copper">{id.slice(0, 8)}</span>
          </h1>
        </div>
      </header>

      <LabelCanvas
        imageUrl={imageUrl}
        initialLabels={initial}
        onSave={async (labels) => {
          await saveLabels(id, labels);
          router.push("/admin/queue");
        }}
      />
    </div>
  );
}
