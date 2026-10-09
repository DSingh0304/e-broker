"use client";

interface Props {
  className?: string;
  /** 0 → 1 scroll progress; drives the mascot's parallax pose. */
  progress?: number;
}

/**
 * Kabadiwala Bot — E-Broker's mascot, assembled from e-waste parts:
 * solder-silver head, PCB torso, copper arms, one hand holding a battery.
 * Parts carry stable ids so later sections can transform/react to them.
 */
export function Mascot({ className, progress = 0 }: Props) {
  const drift = progress * 46;
  const lean = progress * 3;

  return (
    <svg
      viewBox="0 0 320 380"
      role="img"
      aria-label="Kabadiwala Bot, a friendly robot assembled from recycled electronics"
      className={className}
      style={{ transform: `translate3d(0, ${-drift}px, 0) rotate(${lean}deg)` }}
    >
      {/* ground shadow */}
      <ellipse id="mascot-shadow" cx="160" cy="352" rx="92" ry="14" fill="#14201B" opacity="0.25" />

      {/* legs */}
      <g id="mascot-legs" strokeLinecap="round">
        <path d="M136 296v38" stroke="#8A5A26" strokeWidth="20" />
        <path d="M184 296v38" stroke="#8A5A26" strokeWidth="20" />
        <rect x="118" y="328" width="38" height="16" rx="8" fill="#C0C0C0" />
        <rect x="166" y="328" width="38" height="16" rx="8" fill="#C0C0C0" />
      </g>

      <g className="mascot-bob">
        {/* left arm */}
        <g id="mascot-arm-left">
          <path d="M104 208l-30 44" stroke="#B87333" strokeWidth="16" strokeLinecap="round" />
          <circle cx="72" cy="254" r="12" fill="#D98C53" />
        </g>

        {/* torso: PCB */}
        <g id="mascot-body">
          <rect x="102" y="176" width="116" height="128" rx="26" fill="#165B45" stroke="#B87333" strokeWidth="4" />
          <path d="M122 200h76M122 216h48M150 216v40M122 272h76" stroke="#B87333" strokeWidth="3" opacity="0.8" />
          <circle cx="122" cy="200" r="4" fill="#EAD0AC" />
          <circle cx="150" cy="256" r="4" fill="#EAD0AC" />
          <rect x="136" y="228" width="48" height="30" rx="6" fill="#EAD0AC" />
          <rect x="144" y="236" width="32" height="14" rx="3" fill="#0F3B2C" />
          <circle cx="198" cy="272" r="5" fill="#4ADE80" className="mascot-glow" />
        </g>

        {/* right arm raised, holding a battery */}
        <g id="mascot-arm-right" className="mascot-wave">
          <path d="M218 208l34-40" stroke="#B87333" strokeWidth="16" strokeLinecap="round" />
          <g transform="rotate(24 252 168)">
            <rect x="232" y="128" width="40" height="64" rx="8" fill="#35C26E" stroke="#0F3B2C" strokeWidth="4" />
            <rect x="244" y="118" width="16" height="12" rx="3" fill="#C0C0C0" />
            <path d="M246 146v20M236 156h20" stroke="#0F3B2C" strokeWidth="6" strokeLinecap="round" />
          </g>
        </g>

        {/* head */}
        <rect x="148" y="148" width="24" height="34" rx="8" fill="#8A5A26" />
        <g id="mascot-head">
          <rect x="118" y="118" width="22" height="14" rx="6" fill="#B87333" />
          <rect x="180" y="118" width="22" height="14" rx="6" fill="#B87333" />
          <rect x="98" y="56" width="124" height="104" rx="30" fill="#C0C0C0" stroke="#B87333" strokeWidth="4" />
          {/* visor */}
          <rect x="114" y="78" width="92" height="58" rx="26" fill="#0F3B2C" />
          <g id="mascot-eye" className="mascot-blink">
            <circle cx="160" cy="107" r="17" fill="#EAD0AC" />
            <circle cx="160" cy="107" r="9" fill="#0F3B2C" />
            <circle cx="163" cy="104" r="3" fill="#4ADE80" />
          </g>
          <circle cx="160" cy="107" r="24" fill="none" stroke="#4ADE80" strokeWidth="2" opacity="0.5" className="mascot-glow" />
          {/* antenna */}
          <g id="mascot-antenna">
            <path d="M160 56V30" stroke="#B87333" strokeWidth="5" strokeLinecap="round" />
            <circle id="mascot-antenna-tip" cx="160" cy="24" r="8" fill="#D98C53" className="mascot-ping" />
          </g>
          {/* mouth grille */}
          <path d="M140 144h40" stroke="#0F3B2C" strokeWidth="4" strokeLinecap="round" strokeDasharray="2 7" />
        </g>
      </g>
    </svg>
  );
}
