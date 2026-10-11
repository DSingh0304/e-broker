import Link from "next/link";

interface Group {
  heading: string;
  links: { href: string; label: string }[];
}

const GROUPS: Group[] = [
  {
    heading: "Sell",
    links: [
      { href: "/scan", label: "Scan e-waste" },
      { href: "/dashboard", label: "My operations" },
      { href: "/dashboard/inbox", label: "Offer inbox" },
    ],
  },
  {
    heading: "Buy",
    links: [
      { href: "/vendor/market", label: "Market feed" },
      { href: "/vendor/dashboard", label: "Command center" },
      { href: "/vendor/bids", label: "My bids" },
    ],
  },
  {
    heading: "Network",
    links: [
      { href: "/recyclers", label: "Certified recyclers" },
      { href: "/scan", label: "Start a scan" },
    ],
  },
  {
    heading: "System",
    links: [
      { href: "/admin", label: "Admin overview" },
      { href: "/admin/queue", label: "Review queue" },
      { href: "/admin/training", label: "Training" },
      { href: "/admin/models", label: "Models" },
    ],
  },
  {
    heading: "Account",
    links: [
      { href: "/auth/login", label: "Log in" },
      { href: "/auth/register", label: "Create account" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t-2 border-pcb-copper bg-pcb-green">
      <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-12 md:grid-cols-[1.4fr_repeat(5,1fr)]">
        <div>
          <p className="font-display text-lg font-bold">E-BROKER</p>
          <p className="mt-2 max-w-xs text-sm text-text-secondary">
            Photograph e-waste, get a fair AI-priced valuation, and route it to
            certified recyclers - safely and profitably.
          </p>
        </div>
        {GROUPS.map((g) => (
          <nav key={g.heading} aria-label={`Footer - ${g.heading}`}>
            <h2 className="font-display text-xs font-bold uppercase tracking-widest text-pcb-accent">
              {g.heading}
            </h2>
            <ul className="mt-2 space-y-1">
              {g.links.map((l) => (
                <li key={l.href + l.label}>
                  <Link
                    href={l.href}
                    className="inline-flex min-h-[32px] items-center text-sm text-text-secondary underline-offset-4 hover:text-pcb-gold hover:underline"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-pcb-copper/30">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-text-secondary">
          <p>© 2026 E-Broker. Turn e-waste into value.</p>
          <p className="flex items-center gap-2">
            <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-brand-green" />
            <span>All systems nominal</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
