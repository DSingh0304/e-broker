export type TrainingEvent =
  | { type: "epoch"; epoch: number; total: number; loss: number; mAP50: number }
  | { type: "done"; metrics: { mAP50: number; [k: string]: number } }
  | { type: "error"; message: string };

export function parseSSEEvent(raw: string): TrainingEvent | null {
  const match = raw.match(/data:\s*(\{.*\})/s);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]) as TrainingEvent;
    if (!parsed || typeof parsed !== "object" || !("type" in parsed)) return null;
    if (!["epoch", "done", "error"].includes((parsed as { type: string }).type))
      return null;
    return parsed;
  } catch {
    return null;
  }
}

export function subscribeToTraining(
  runId: string,
  onEvent: (e: TrainingEvent) => void,
  onError?: (err: unknown) => void
): () => void {
  const src = new EventSource(`/api/admin/training/${runId}/stream`);
  let buffer = "";
  src.onmessage = (msg) => {
    buffer += `data: ${msg.data}\n\n`;
    const ev = parseSSEEvent(buffer);
    buffer = "";
    if (ev) onEvent(ev);
  };
  src.onerror = (err) => {
    onError?.(err);
    src.close();
  };
  return () => src.close();
}
