/**
 * The circular archival seal: SVG text on a circle, two hairline rings and a centre mark.
 * Rotation is a CSS animation (paused for reduced motion by the media query in globals.css), so
 * the loop costs no JS. It is decorative, so the whole thing is hidden from assistive tech and
 * the readable equivalent is passed in as `srLabel` by whoever needs it.
 */

export interface SealProps {
  text?: string;
  size?: number;
  /** Counter-clockwise, used where two seals sit near each other. */
  reverse?: boolean;
  /** Only spins when the surrounding group is hovered or focused. */
  hoverOnly?: boolean;
  className?: string;
  srLabel?: string;
  centreMark?: "asterisk" | "dot" | "none";
}

const SEAL_TEXT = "VINTAGE MAGIC · BEIRUT · ONE OF A KIND · ";

export function Seal({ text = SEAL_TEXT, size = 132, reverse = false, hoverOnly = false, className, srLabel, centreMark = "asterisk" }: SealProps) {
  const classes = [hoverOnly ? "anim-seal [--hover:1]" : reverse ? "anim-seal anim-seal--slow" : "anim-seal", className].filter(Boolean).join(" ");

  return (
    <>
      <svg viewBox="0 0 140 140" width={size} height={size} aria-hidden className={`seal__ring ${classes}`} focusable="false" style={{ overflow: "visible" }}>
        <defs>
          <path id="vm-seal-ring" d="M70,70 m-52,0 a52,52 0 1,1 104,0 a52,52 0 1,1 -104,0" />
        </defs>
        <circle cx="70" cy="70" r="66" fill="none" stroke="currentColor" strokeWidth="0.7" opacity="0.55" />
        <circle cx="70" cy="70" r="40" fill="none" stroke="currentColor" strokeWidth="0.7" opacity="0.35" />
        <text fill="currentColor" style={{ fontFamily: "var(--font-label)", fontSize: 10.4, fontWeight: 600, letterSpacing: "2.55px", textTransform: "uppercase" }}>
          <textPath href="#vm-seal-ring" startOffset="0">
            {text}
          </textPath>
        </text>
        {centreMark === "asterisk" ? (
          <g stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" aria-hidden>
            <line x1="70" y1="60" x2="70" y2="80" />
            <line x1="60" y1="70" x2="80" y2="70" />
            <line x1="63.5" y1="63.5" x2="76.5" y2="76.5" />
            <line x1="76.5" y1="63.5" x2="63.5" y2="76.5" />
          </g>
        ) : centreMark === "dot" ? (
          <circle cx="70" cy="70" r="3.4" fill="currentColor" />
        ) : null}
      </svg>
      {srLabel ? <span className="visually-hidden">{srLabel}</span> : null}
    </>
  );
}

/** Hover-only rotation helper: wrap the seal in `group` and set hoverOnly. */
export function SealBadge({ label, ...props }: { label: string } & Omit<SealProps, "srLabel">) {
  return <Seal {...props} srLabel={label} />;
}
