// Shared display formatting: currency, relative time, class labels.
// One home for the helpers previously copy-pasted across pages.

/** Indian-rupee whole amounts: 2400 -> "₹2,400". */
export const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/** Machine class id -> human label: "copper_cable" -> "copper cable". */
export const label = (c: string) => c.replace(/_/g, " ");

/** ISO timestamp -> short relative time ("5m ago", "3d ago", "11 Oct"). */
export function timeAgo(iso: string | null): string {
  if (!iso) return "recently";
  const mins = Math.max(0, (Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${Math.max(1, Math.floor(mins))}m ago`;
  const hrs = mins / 60;
  if (hrs < 24) return `${Math.floor(hrs)}h ago`;
  const days = hrs / 24;
  if (days < 30) return `${Math.floor(days)}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
