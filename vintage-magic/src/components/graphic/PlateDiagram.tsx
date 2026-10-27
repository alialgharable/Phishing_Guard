import { DIAGRAM_LABELS, type DiagramId } from "@/lib/types";

/**
 * Technical cut diagrams used as archival plates.
 *
 * Drawn as stroked SVG with `pathLength={1}`, so the CSS in kit.css can draw every line in one
 * continuous gesture when the plate enters the viewport - the same mechanism as the contour lines
 * around garments, which is what makes a diagram feel hand-inked rather than dropped in.
 */

interface DiagramShape {
  paths: string[];
  dashed?: string[];
  dots?: Array<[number, number]>;
  grainline?: [number, number, number, number];
  labels?: Array<{ x: number; y: number; text: string; anchor?: "start" | "middle" | "end" }>;
  beadField?: string;
}

const DIAGRAMS: Record<DiagramId, DiagramShape> = {
  coat: {
    paths: [
      "M78 44 L120 58 L162 44 L188 56 L204 132 L182 140 L176 112 L176 268 L64 268 L64 112 L58 140 L36 132 L52 56 Z",
      "M120 58 L120 268",
      "M96 50 L120 94 L144 50",
      "M70 200 L100 200 L100 234 L70 234 Z",
      "M140 200 L170 200 L170 234 L140 234 Z",
      "M104 130 L104 178",
      "M136 130 L136 178",
    ],
    dots: [
      [104, 130],
      [104, 178],
      [136, 130],
      [136, 178],
    ],
    grainline: [120, 252, 120, 196],
    labels: [
      { x: 120, y: 284, text: "CB", anchor: "middle" },
      { x: 36, y: 200, text: "FACING" },
    ],
  },
  jacket: {
    paths: [
      "M74 48 L120 62 L166 48 L192 60 L206 138 L184 146 L178 116 L178 250 L62 250 L62 116 L56 146 L34 138 L48 60 Z",
      "M104 66 L136 248",
      "M92 52 L120 70 L148 52 L136 42 L120 56 L104 42 Z",
      "M76 176 L112 176 L112 192 L76 192 Z",
      "M150 96 L172 90",
    ],
    dashed: ["M62 130 L178 122"],
    grainline: [96, 236, 96, 172],
    labels: [{ x: 150, y: 90, text: "ZIP" }],
  },
  shirt: {
    paths: [
      "M84 46 L120 56 L156 46 L184 58 L200 120 L178 128 L172 104 L172 244 L68 244 L68 104 L62 128 L40 120 L56 58 Z",
      "M114 56 L114 244",
      "M126 56 L126 244",
      "M70 96 L170 96",
      "M104 44 L120 74 L136 44",
      "M68 150 L44 146 L44 190 L68 194",
    ],
    dots: [
      [120, 104],
      [120, 144],
      [120, 184],
      [120, 224],
    ],
    grainline: [150, 232, 150, 168],
    labels: [
      { x: 40, y: 200, text: "PLACKET", anchor: "end" },
      { x: 120, y: 262, text: "SELF-FACING", anchor: "middle" },
    ],
  },
  trousers: {
    paths: ["M70 44 L170 44 L170 64 L70 64 Z", "M70 64 L116 64 L118 268 L74 268 Z", "M124 64 L170 64 L166 268 L122 268 Z", "M120 64 L120 104", "M84 96 L104 92", "M136 92 L156 96"],
    dashed: ["M96 68 L96 262", "M144 68 L144 262"],
    grainline: [106, 240, 106, 150],
    labels: [
      { x: 120, y: 284, text: "CF FLY", anchor: "middle" },
      { x: 190, y: 168, text: "CREASE", anchor: "start" },
    ],
  },
  skirt: {
    paths: ["M84 50 L156 50 L156 66 L84 66 Z", "M84 66 L156 66 L188 252 L52 252 Z", "M100 66 L80 252", "M120 66 L120 252", "M140 66 L160 252"],
    dashed: ["M52 252 L188 252"],
    grainline: [120, 236, 120, 150],
    labels: [
      { x: 44, y: 150, text: "PLEAT 1:3", anchor: "end" },
      { x: 120, y: 270, text: "HEM SWING", anchor: "middle" },
    ],
  },
  dress: {
    paths: ["M104 44 L112 92", "M136 44 L128 92", "M112 92 L128 92 L152 118 L162 254 L78 254 L88 118 Z", "M98 128 L142 206", "M108 124 L150 198"],
    dashed: ["M88 118 L152 118"],
    grainline: [120, 240, 120, 168],
    labels: [
      { x: 172, y: 176, text: "BIAS 45°" },
      { x: 70, y: 60, text: "STRAP, SELF" , anchor: "end" },
    ],
  },
  scarf: {
    paths: ["M56 56 L184 56 L184 184 L56 184 Z", "M64 64 L176 64 L176 176 L64 176 Z", "M96 96 L144 144", "M144 96 L96 144"],
    dashed: ["M56 56 L184 184", "M184 56 L56 184"],
    labels: [
      { x: 120, y: 206, text: "ROLLED HEM", anchor: "middle" },
      { x: 196, y: 60, text: "90 × 90" },
    ],
  },
  purse: {
    paths: ["M60 112 L180 112 L188 206 Q120 232 52 206 Z", "M58 100 L182 100 L182 112 L58 112 Z", "M92 100 Q120 58 148 100"],
    dots: [
      [120, 96],
      [112, 96],
      [128, 96],
    ],
    beadField: "M64 122 L176 122 L182 198 Q120 220 58 198 Z",
    labels: [{ x: 120, y: 250, text: "GLASS BEAD FIELD", anchor: "middle" }],
  },
};

export interface PlateDiagramProps {
  diagram: DiagramId;
  className?: string;
  /** Adds the caption rule and label underneath the plate. */
  caption?: boolean;
  strokeWidth?: number;
}

export function PlateDiagram({ diagram, className, caption = true, strokeWidth = 1.15 }: PlateDiagramProps) {
  const shape = DIAGRAMS[diagram];
  const drawn = { "data-draw": true } as Record<string, string | boolean>;

  return (
    <figure className={["flex h-full w-full flex-col items-center justify-center gap-3", className].filter(Boolean).join(" ")}>
      <svg viewBox="0 0 240 300" className="h-full max-h-[420px] w-full text-ink/75" role="img" aria-label={`${DIAGRAM_LABELS[diagram]} — technical plate`} {...drawn}>
        <defs>
          <pattern id="vm-beads" width="7" height="7" patternUnits="userSpaceOnUse">
            <circle cx="3.2" cy="3.2" r="1.25" fill="currentColor" opacity="0.5" />
          </pattern>
          <marker id="vm-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="currentColor" />
          </marker>
        </defs>

        {shape.beadField ? <path d={shape.beadField} fill="url(#vm-beads)" stroke="none" /> : null}

        <g fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round">
          {shape.paths.map((d) => (
            <path key={d} d={d} pathLength={1} />
          ))}
          {shape.dashed?.map((d) => (
            <path key={d} d={d} pathLength={1} strokeDasharray="0.012 0.028" opacity="0.55" />
          ))}
        </g>

        {shape.dots?.map(([cx, cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="2.3" fill="currentColor" opacity="0.8" />)}

        {shape.grainline ? (
          <g stroke="currentColor" fill="none" strokeWidth={strokeWidth}>
            <line x1={shape.grainline[0]} y1={shape.grainline[1]} x2={shape.grainline[2]} y2={shape.grainline[3]} pathLength={1} markerStart="url(#vm-arrow)" markerEnd="url(#vm-arrow)" />
          </g>
        ) : null}

        {shape.labels?.map((label) => (
          <text
            key={label.text}
            x={label.x}
            y={label.y}
            textAnchor={label.anchor ?? "start"}
            fill="currentColor"
            opacity="0.62"
            style={{ fontFamily: "var(--font-label)", fontSize: 8.6, letterSpacing: "0.18em", textTransform: "uppercase" }}
          >
            {label.text}
          </text>
        ))}
      </svg>
      {caption ? (
        <figcaption className="flex w-full items-center gap-3">
          <span className="h-px flex-1 bg-rule" aria-hidden />
          <span className="label muted whitespace-nowrap">{DIAGRAM_LABELS[diagram]}</span>
        </figcaption>
      ) : null}
    </figure>
  );
}
