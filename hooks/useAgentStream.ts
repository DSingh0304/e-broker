// hooks/useAgentStream.ts — SSE stream of Strands agent insights.
// Shows detection boxes immediately, then progressively enhances with
// pricing / toxicity / recyclers / EPR as the agent thinks.
"use client";

import { useEffect, useState } from "react";
import { API_BASE, type AgentResult, type ThinkingStep } from "@/lib/api";

type Status = "idle" | "streaming" | "done" | "cached" | "error";

interface SSEEvent {
  type: string;
  message?: string;
  name?: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  text?: string;
  data?: AgentResult;
}

export function useAgentStream(imageId: string, lat: number, lng: number) {
  const [steps, setSteps] = useState<ThinkingStep[]>([]);
  const [result, setResult] = useState<AgentResult | null>(null);
  const [status, setStatus] = useState<Status>("idle");

  useEffect(() => {
    if (!imageId) return;
    const url = `${API_BASE}/api/agent/${imageId}/stream?lat=${lat}&lng=${lng}`;
    const es = new EventSource(url);

    es.onmessage = (e) => {
      let event: SSEEvent;
      try {
        event = JSON.parse(e.data) as SSEEvent;
      } catch {
        return;
      }
      switch (event.type) {
        case "status":
          if (event.message === "started") setStatus("streaming");
          if (event.message === "cached") setStatus("cached");
          if (event.message === "done" || event.message === "partial" || event.message === "error") {
            setStatus(event.message === "done" ? "done" : "error");
            es.close();
          }
          break;
        case "tool_call":
          setSteps((prev) => [
            ...prev,
            { type: "tool_call", name: event.name ?? "tool", payload: event.input ?? {} },
          ]);
          break;
        case "tool_result":
          setSteps((prev) => [
            ...prev,
            { type: "tool_result", name: event.name ?? "tool", payload: event.output ?? {} },
          ]);
          break;
        case "result":
          if (event.data) setResult(event.data);
          break;
        default:
          break;
      }
    };

    es.onerror = () => {
      setStatus("error");
      es.close();
    };
    return () => es.close();
  }, [imageId, lat, lng]);

  return { steps, result, status };
}
