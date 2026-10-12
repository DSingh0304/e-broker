import { NextResponse } from "next/server";

export const runtime = "edge";

// POST /api/auth/register - proxies to FastAPI so the browser never needs
// the backend URL or internal keys. The NextAuth catch-all would otherwise
// swallow this path with a 400.
export async function POST(req: Request) {
  const apiHost =
    process.env.INTERNAL_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:8000";
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ detail: "Invalid JSON body" }, { status: 400 });
  }
  try {
    const res = await fetch(`${apiHost}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ detail: "Registration service unavailable" }, { status: 502 });
  }
}
