import { NextResponse } from "next/server";

// Catch-all backend proxy: /api/* (except deeper routes like /api/auth/*,
// which Next.js matches first) forwards to FastAPI. Replaces next.config
// rewrites with a debuggable hop - upstream URL + status are logged and
// connection failures surface as 502 with the attempted target.
const HOP_BY_HOP = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailer", "transfer-encoding", "upgrade", "host", "content-length",
]);

function target(path: string[], search: string): string {
  const apiHost =
    process.env.INTERNAL_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:8000";
  return `${apiHost}/${path.join("/")}${search}`;
}

async function proxy(req: Request, path: string[]) {
  const url = new URL(req.url);
  const upstream = target(path, url.search);
  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) headers.set(key, value);
  });
  let body: BodyInit | undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    body = await req.arrayBuffer();
  }
  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(upstream, {
      method: req.method,
      headers,
      body,
      // @ts-expect-error duplex required for streamed request bodies
      duplex: body ? "half" : undefined,
      redirect: "manual",
    });
  } catch (err) {
    console.error(`[api-proxy] ${req.method} ${url.pathname} -> ${upstream}: ${err}`);
    return NextResponse.json(
      { detail: `Backend unreachable at ${upstream}` },
      { status: 502 },
    );
  }
  const outHeaders = new Headers();
  upstreamRes.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) outHeaders.set(key, value);
  });
  if (!outHeaders.has("cache-control")) outHeaders.set("cache-control", "no-store");
  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    headers: outHeaders,
  });
}

export async function GET(req: Request, ctx: { params: { proxy: string[] } }) {
  return proxy(req, ctx.params.proxy);
}
export async function POST(req: Request, ctx: { params: { proxy: string[] } }) {
  return proxy(req, ctx.params.proxy);
}
export async function PUT(req: Request, ctx: { params: { proxy: string[] } }) {
  return proxy(req, ctx.params.proxy);
}
export async function PATCH(req: Request, ctx: { params: { proxy: string[] } }) {
  return proxy(req, ctx.params.proxy);
}
export async function DELETE(req: Request, ctx: { params: { proxy: string[] } }) {
  return proxy(req, ctx.params.proxy);
}
