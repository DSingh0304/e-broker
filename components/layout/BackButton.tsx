import Link from "next/link";

/**
 * One back button for every page. Two tones so it stays legible on
 * dark bands and cream paper without reinventing the style per page.
 */
export function BackButton({
  href,
  label,
  tone = "dark",
  ariaLabel,
}: {
  href: string;
  label: string;
  tone?: "dark" | "light";
  ariaLabel?: string;
}) {
  const styles =
    tone === "dark"
      ? "border-pcb-copper text-pcb-gold hover:bg-pcb-copper/10"
      : "border-[#0F3B2C] text-[#0F3B2C] hover:bg-[#0F3B2C]/5";
  return (
    <Link
      href={href}
      aria-label={ariaLabel ?? `Back: ${label}`}
      className={`inline-flex min-h-[44px] items-center rounded-lg border px-4 font-display text-sm font-bold uppercase ${styles}`}
    >
      <span aria-hidden="true" className="mr-2">←</span>
      {label}
    </Link>
  );
}
