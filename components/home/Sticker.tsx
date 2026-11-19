import { ShieldCheck } from "lucide-react";

/** Round badge with text running around a slowly spinning ring. Caller positions it (absolute or relative). */
export function SpinSticker({ text, small, className = "" }: { text: string; small?: boolean; className?: string }) {
  const size = small ? "size-20 md:size-24" : "size-28 md:size-36";
  const core = small ? "size-9 md:size-10" : "size-12 md:size-14";
  const icon = small ? "size-4 md:size-5" : "size-6 md:size-7";
  return (
    <div aria-hidden className={`grid place-items-center rounded-full bg-blush text-frame shadow-lift ${size} ${className}`}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full animate-spin-slow">
        <defs>
          <path id="ring" d="M50,50 m-37,0 a37,37 0 1,1 74,0 a37,37 0 1,1 -74,0" />
        </defs>
        <text className="fill-current font-display text-[10.5px] font-bold tracking-[0.12em] uppercase">
          <textPath href="#ring">{text.repeat(2)}</textPath>
        </text>
      </svg>
      <span className={`grid place-items-center rounded-full border-2 border-frame ${core}`}>
        <ShieldCheck className={icon} strokeWidth={2.2} />
      </span>
    </div>
  );
}

/** Faint hand-drawn doodles (ballot box, ticks, stars) for dark panels. `scale` < 1 draws them smaller. */
export function DoodlePattern({ id, scale = 1, className = "" }: { id: string; scale?: number; className?: string }) {
  return (
    <svg aria-hidden className={`pointer-events-none absolute inset-0 size-full ${className}`}>
      <defs>
        <pattern id={id} width="180" height="180" patternUnits="userSpaceOnUse" patternTransform={`rotate(-8) scale(${scale})`}>
          <g fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            {/* ballot box */}
            <rect x="18" y="40" width="44" height="36" rx="6" />
            <path d="M30 40v-8h20v8M32 52h16" />
            {/* tick */}
            <path d="M104 30l10 10 22-24" />
            {/* star */}
            <path d="M140 110l5 10 11 2-8 8 2 11-10-5-10 5 2-11-8-8 11-2z" />
            {/* sheet */}
            <rect x="52" y="112" width="38" height="50" rx="5" />
            <path d="M60 126h22M60 136h16M60 146h20" />
            {/* squiggle */}
            <path d="M100 80c8-8 16 8 24 0s16 8 24 0" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}
