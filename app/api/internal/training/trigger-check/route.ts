import { NextResponse } from "next/server";

// GET /api/internal/training/trigger-check - server-side proxy that injects
// the internal key, so the browser never carries X-Internal-Key secrets.
export async function GET() {
  const apiHost =
    process.env.INTERNAL_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:8000";
  const key = process.env.INTERNAL_API_KEY || "test-internal-key";
  try {
    const res = await fetch(`${apiHost}/internal/training/trigger-check`, {
      headers: { "X-Internal-Key": key },
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ detail: "Training service unavailable" }, { status: 502 });
  }
}
