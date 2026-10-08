"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

type Role = "KABADIWALA" | "VENDOR" | null;

function roleOf(session: unknown): Role {
  const user = (session as { user?: { role?: string } } | null)?.user;
  if (user?.role === "VENDOR" || user?.role === "KABADIWALA") return user.role;
  return null;
}

interface Tab {
  href: string;
  label: string;
  match: string;
}

const PUBLIC_TABS: Tab[] = [
  { href: "/scan", label: "Scan", match: "/scan" },
  { href: "/recyclers", label: "Recyclers", match: "/recyclers" },
  { href: "/vendor/market", label: "Market", match: "/vendor/market" },
];

const SELL_TABS: Tab[] = [
  { href: "/dashboard", label: "My Operations", match: "/dashboard" },
  { href: "/dashboard/inbox", label: "Inbox", match: "/dashboard/inbox" },
];

const BUY_TABS: Tab[] = [
  { href: "/vendor/dashboard", label: "Command Center", match: "/vendor/dashboard" },
  { href: "/vendor/bids", label: "My Bids", match: "/vendor/bids" },
];

function BrandMark() {
  return (
    <svg
      aria-hidden
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-pcb-accent"
    >
      <path d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
    </svg>
  );
}

function TabLink({ tab, pathname, onNavigate }: { tab: Tab; pathname: string; onNavigate?: () => void }) {
  const active = pathname === tab.match || (tab.match !== "/" && pathname.startsWith(tab.match + "/"));
  return (
    <Link
      href={tab.href}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={`min-h-[44px] inline-flex items-center rounded-md px-3 font-display text-sm font-bold uppercase tracking-wide transition-colors hover:text-pcb-accent ${
        active ? "text-pcb-accent underline underline-offset-8 decoration-2" : "text-pcb-gold"
      }`}
    >
      {tab.label}
    </Link>
  );
}

export function SiteNav() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open ]);

  const role = status === "authenticated" ? roleOf(session) : null;
  const desktopTabs: Tab[] = [
    ...PUBLIC_TABS,
    ...(role === "KABADIWALA" ? SELL_TABS : []),
    ...(role === "VENDOR" ? BUY_TABS : []),
  ];

  return (
    <header className="sticky top-0 z-50 border-b-2 border-pcb-copper bg-pcb-green/95 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-2 px-4 py-2">
        <Link href="/" className="flex min-h-[44px] items-center gap-2 font-display text-lg font-bold tracking-tight" aria-label="E-Broker home">
          <BrandMark />
          <span>E-BROKER</span>
        </Link>

        <nav aria-label="Primary" className="ml-4 hidden items-center gap-1 lg:flex">
          {desktopTabs.map((t) => (
            <TabLink key={t.href} tab={t} pathname={pathname} />
          ))}
        </nav>

        <div className="ml-auto hidden items-center gap-2 lg:flex">
          {status === "authenticated" ? (
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/" })}
              className="min-h-[44px] rounded-md border border-pcb-copper px-4 font-display text-sm font-bold uppercase hover:bg-pcb-copper/10"
            >
              Sign out
            </button>
          ) : (
            <>
              <Link
                href="/auth/login"
                className="inline-flex min-h-[44px] items-center rounded-md border border-pcb-copper px-4 font-display text-sm font-bold uppercase hover:bg-pcb-copper/10"
              >
                Log in
              </Link>
              <Link
                href="/scan"
                className="inline-flex min-h-[44px] items-center rounded-md bg-pcb-accent px-4 font-display text-sm font-bold uppercase text-black hover:brightness-90"
              >
                Scan e-waste
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          aria-expanded={open}
          aria-controls="site-nav-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
          className="ml-auto inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-pcb-copper lg:hidden"
        >
          <svg aria-hidden width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            {open ? <path d="M3 3l10 10M13 3L3 13" /> : <path d="M2 4.5h12M2 8h12M2 11.5h12" />}
          </svg>
        </button>
      </div>

      {open && (
        <nav id="site-nav-menu" aria-label="Site map" className="border-t border-pcb-copper/40 px-4 pb-6 pt-2 lg:hidden">
          <div className="grid gap-5 sm:grid-cols-2">
            <section aria-label="Scan and discover">
              <h2 className="font-display text-xs font-bold uppercase tracking-widest text-pcb-accent">Scan &amp; Discover</h2>
              <ul className="mt-1">
                {PUBLIC_TABS.map((t) => (
                  <li key={t.href}>
                    <TabLink tab={t} pathname={pathname} onNavigate={() => setOpen(false)} />
                  </li>
                ))}
              </ul>
            </section>
            <section aria-label="Sell">
              <h2 className="font-display text-xs font-bold uppercase tracking-widest text-pcb-accent">Sell</h2>
              <ul className="mt-1">
                {SELL_TABS.map((t) => (
                  <li key={t.href}>
                    <TabLink tab={t} pathname={pathname} onNavigate={() => setOpen(false)} />
                  </li>
                ))}
              </ul>
            </section>
            <section aria-label="Buy">
              <h2 className="font-display text-xs font-bold uppercase tracking-widest text-pcb-accent">Buy</h2>
              <ul className="mt-1">
                {BUY_TABS.map((t) => (
                  <li key={t.href}>
                    <TabLink tab={t} pathname={pathname} onNavigate={() => setOpen(false)} />
                  </li>
                ))}
              </ul>
            </section>
            <section aria-label="Account">
              <h2 className="font-display text-xs font-bold uppercase tracking-widest text-pcb-accent">Account</h2>
              <ul className="mt-1">
                {status === "authenticated" ? (
                  <li>
                    <button
                      type="button"
                      onClick={() => signOut({ callbackUrl: "/" })}
                      className="inline-flex min-h-[44px] items-center rounded-md px-3 font-display text-sm font-bold uppercase tracking-wide hover:text-pcb-accent"
                    >
                      Sign out
                    </button>
                  </li>
                ) : (
                  <>
                    <li>
                      <TabLink tab={{ href: "/auth/login", label: "Log in", match: "/auth/login" }} pathname={pathname} onNavigate={() => setOpen(false)} />
                    </li>
                    <li>
                      <TabLink tab={{ href: "/auth/register", label: "Create account", match: "/auth/register" }} pathname={pathname} onNavigate={() => setOpen(false)} />
                    </li>
                  </>
                )}
              </ul>
            </section>
          </div>
        </nav>
      )}
    </header>
  );
}
