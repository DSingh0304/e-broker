import type { Detection } from "@/lib/api";

interface Props {
  detections: Detection[];
}

export function HazardAlert({ detections }: Props) {
  const hazards = detections.filter((d) => d.toxicity?.level === "hazardous");
  if (hazards.length === 0) return null;
  return (
    <section
      role="alert"
      data-testid="hazard-badge"
      className="rounded-xl border border-[#B42318]/40 bg-[#B42318]/5 p-4"
    >
      <h2 className="flex items-center gap-1.5 font-semibold text-[#B42318]">
        <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M8 1.5 15 14H1L8 1.5Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M8 6v3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="8" cy="12" r="0.9" fill="currentColor" />
        </svg>
        <span>Hazard Summary</span>
      </h2>
      <ul className="mt-1 text-sm text-[#132019]">
        {hazards.map((d) => (
          <li key={d.id}>
            <span className="capitalize">{d.className}</span> contains{" "}
            {d.toxicity?.notes ?? "hazardous materials"} - do not incinerate. Requires a certified e-waste
            recycler.
          </li>
        ))}
      </ul>
    </section>
  );
}
