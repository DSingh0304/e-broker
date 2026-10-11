// e2e/scripts/crawl.mjs - visit every frontend route in Chromium (desktop +
// mobile), log console errors, page errors, failed requests and bad statuses.
// Usage: node e2e/scripts/crawl.mjs
import { chromium, devices } from "@playwright/test";

const BASE = "http://localhost:3000";
const IMG = "00eba354-4283-4b0f-a1b3-543b28b532f6"; // seeded, has detections

const PUBLIC = ["/", "/scan", "/recyclers", `/result/${IMG}`, "/auth/login", "/auth/register"];
const KABADI = ["/dashboard", "/dashboard/inbox", "/vendor/market"];
const VENDOR = ["/vendor/dashboard", "/vendor/market", "/vendor/bids"];
const ADMIN = ["/admin", "/admin/queue", `/admin/labeller/${IMG}`, "/admin/models", "/admin/training"];
const API = ["/api/recyclers", `/api/detect/${IMG}`, `/api/images/${IMG}`];
const DOWNLOADS = [`/api/passport/${IMG}`];

const LOGINS = {
  kabadi: { phone: "+919876543210", password: "kabadi123" },
  vendor: { phone: "+91123456000", password: "vendor123" },
  admin: { phone: "+919999900001", password: "admin123" },
};

async function loginAs(browser, creds) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  await page.goto(`${BASE}/auth/login`);
  await page.fill("#login-phone", creds.phone);
  await page.fill("#login-password", creds.password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/auth/login"), { timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);
  const state = await ctx.storageState();
  await ctx.close();
  return { state, problems, landed: true };
}

async function crawl(browser, name, state, routes, viewport) {
  const ctx = await browser.newContext({ ...viewport, storageState: state });
  const findings = [];
  for (const route of routes) {
    const page = await ctx.newPage();
    const errors = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`console: ${m.text().slice(0, 160)}`);
    });
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 160)}`));
    page.on("requestfailed", (r) => {
      // Next.js RSC prefetches (?_rsc=) abort on navigation/close - noise.
      // SSE agent streams are long-lived by design; abort-on-teardown is noise.
      const url = r.url().replace(BASE, "");
      const aborted = r.failure()?.errorText === "net::ERR_ABORTED";
      if (aborted && (url.includes("?_rsc=") || url.includes("/api/agent/"))) return;
      errors.push(`reqfail: ${url} ${r.failure()?.errorText}`);
    });
    page.on("response", (r) => {
      if (r.status() >= 400 && !r.url().includes("/__next")) {
        errors.push(`http-${r.status()}: ${r.url().replace(BASE, "").slice(0, 100)}`);
      }
    });
    try {
      await page.goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 30000 });
      if (route.startsWith("/result/")) {
        // Wait for the agent SSE to reach a terminal state instead of an
        // arbitrary sleep - proves the stream delivers in-browser.
        await page
          .waitForFunction(
            () =>
              document.body.innerText.includes("Priced against live scrap rates.") ||
              document.body.innerText.includes("AI insights unavailable"),
            { timeout: 120000 }
          )
          .catch(() => errors.push("agent: stream did not reach a terminal state in 120s"));
      } else {
        await page.waitForTimeout(1500);
      }
    } catch (e) {
      errors.push(`nav: ${String(e).split("\n")[0].slice(0, 140)}`);
    }
    findings.push({ route, errors });
    await page.close();
  }
  await ctx.close();
  return findings;
}

const browser = await chromium.launch();
let fails = 0;
try {
  for (const [role, creds] of Object.entries(LOGINS)) {
    const { problems } = await loginAs(browser, creds);
    console.log(`login ${role}: OK${problems.length ? ` BUT ${problems.join("; ")}` : ""}`);
    if (problems.length) fails += problems.length;
  }

  const contexts = [
    ["anon", undefined, [...PUBLIC, ...API], undefined],
    ["anon-downloads", undefined, [], undefined],
    ["kabadi-desktop", (await loginAs(browser, LOGINS.kabadi)).state, [...PUBLIC, ...KABADI], undefined],
    ["vendor-desktop", (await loginAs(browser, LOGINS.vendor)).state, [...PUBLIC, ...VENDOR], undefined],
    ["admin-desktop", (await loginAs(browser, LOGINS.admin)).state, [...PUBLIC, ...ADMIN], undefined],
    ["anon-mobile", undefined, [...PUBLIC], devices["Pixel 7"]],
    ["admin-mobile", (await loginAs(browser, LOGINS.admin)).state, ["/admin/queue", "/recyclers", "/scan"], devices["Pixel 7"]],
  ];

  for (const [name, state, routes, viewport] of contexts) {
    console.log(`\n## ${name}`);
    if (name === "anon-downloads") {
      const ctx = await browser.newContext();
      for (const dl of DOWNLOADS) {
        const res = await ctx.request.get(`${BASE}${dl}`);
        const ok = res.status() === 200 && (res.headers()["content-type"] || "").includes("pdf");
        console.log(ok ? `  PASS ${dl} (pdf download)` : `  FAIL ${dl} status=${res.status()}`);
        if (!ok) fails += 1;
      }
      await ctx.close();
      continue;
    }
    const findings = await crawl(browser, name, state, routes, viewport);
    for (const { route, errors } of findings) {
      if (errors.length === 0) {
        console.log(`  PASS ${route}`);
      } else {
        fails += errors.length;
        console.log(`  FAIL ${route}`);
        for (const e of errors.slice(0, 6)) console.log(`       - ${e}`);
      }
    }
  }
} finally {
  await browser.close();
}
console.log(`\nTOTAL PROBLEMS: ${fails}`);
process.exit(fails === 0 ? 0 : 1);
