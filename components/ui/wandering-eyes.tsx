import type { ComponentProps, CSSProperties } from "react";
import { cn } from "@/lib/utils";

type WanderingEyesProps = Omit<ComponentProps<"span">, "children"> & {
  /** Eye diameter as a fraction of the container's smaller side (0.28 to 0.7). */
  eyeScale?: number;
  /** Space between the two eyes, as a fraction of the container's smaller side (0.04 to 0.3). */
  gapScale?: number;
  /** Pupil size relative to the eye: 0.32 means the pupil is 32% as wide as the eye (0.12 to 0.45). */
  pupilScale?: number;
  /** Eye height at the lowest point of a blink, as a fraction of the open height (0.15 to 1). */
  blinkScale?: number;
  /** How far the pupil moves when the eyes look around, as a fraction of the eye's size (0.08 to 0.5). */
  travelScale?: number;
};

const clamp = (value: number | undefined, min: number, max: number, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

/** A fraction as a percentage in cqmin, without floating-point noise (0.28 * 100 is 28.000000000000004). */
const cqmin = (fraction: number) => `${Math.round(fraction * 100 * 1000) / 1000}cqmin`;

// The animations live in a <style> that React puts in the page once, however many eyes are on screen. The pupil is a
// radial-gradient on the eye's own background, so "looking" is just a change of background-position: no extra elements.
const STYLES = `
.loading-ui-wandering-eyes__eyes {
  gap: var(--loading-ui-wandering-eyes-gap);
}
.loading-ui-wandering-eyes__eye {
  --eye-color: color-mix(in srgb, currentColor 16%, transparent);
  /* The pupil is dark: the page's ink colour (black on a light page, white on a dark one) with a hint of the text colour. */
  /* Set --loading-ui-wandering-eyes-pupil-color to choose another. */
  --pupil-color: var(--loading-ui-wandering-eyes-pupil-color, color-mix(in srgb, currentColor 15%, CanvasText));
  --travel: calc(var(--loading-ui-wandering-eyes-eye) * var(--loading-ui-wandering-eyes-travel-scale));
  flex: none;
  width: var(--loading-ui-wandering-eyes-eye);
  height: var(--loading-ui-wandering-eyes-eye);
  background-color: var(--eye-color);
  background-image: radial-gradient(circle closest-side, var(--pupil-color) 96%, transparent 100%);
  background-repeat: no-repeat;
  background-size: calc(var(--loading-ui-wandering-eyes-pupil-scale) * 100%) calc(var(--loading-ui-wandering-eyes-pupil-scale) * 100%);
  background-position: 50% 50%;
  animation:
    loading-ui-wandering-eyes-move var(--duration, 10s) ease-in-out infinite,
    loading-ui-wandering-eyes-blink var(--duration, 10s) linear infinite;
}
@keyframes loading-ui-wandering-eyes-move {
  0%, 10% { background-position: 50% 50%; }
  13%, 40% { background-position: calc(50% - var(--travel)) 50%; }
  43%, 70% { background-position: calc(50% + var(--travel)) 50%; }
  73%, 90% { background-position: 50% calc(50% + var(--travel)); }
  93%, 100% { background-position: 50% 50%; }
}
@keyframes loading-ui-wandering-eyes-blink {
  0%, 10.5%, 12.5%, 40.5%, 42.5%, 70.5%, 72.5%, 90.5%, 92.5%, 98.5%, 100% { height: var(--loading-ui-wandering-eyes-eye); }
  11.5%, 41.5%, 71.5%, 91.5%, 99.5% { height: calc(var(--loading-ui-wandering-eyes-eye) * var(--loading-ui-wandering-eyes-blink)); }
}
@media (prefers-reduced-motion: reduce) {
  .loading-ui-wandering-eyes__eye { animation: none; }
}
`;

/**
 * A loading indicator: two cartoon eyes that look left, right and down, and blink in between. It takes its colour from
 * the text colour around it (`currentColor`), so it suits any theme; the pupil, the part that moves, is dark so it reads
 * clearly (`className="[--loading-ui-wandering-eyes-pupil-color:tomato]"` picks another colour).
 *
 * It is large and clearly visible by default: 96px high (`h-24`), and 216px wide because its shape is fixed at 9:4, with the
 * eyes sized to fill it. Nothing needs to be set on the parent. To change the size, give it a height or a width (one side is
 * enough, the other follows the 9:4 shape): `className="h-12"` or `className="w-40"`.
 * The speed is the CSS variable `--duration` (10s unless you set it): `className="[--duration:6s]"`.
 */
/** Does this class list set a height (h-8, size-10, min-h-...) or a width (w-16, size-10, min-w-...)? Variants such as md: are looked through. */
function sizesSet(className: string | undefined) {
  let height = false;
  let width = false;
  for (const token of (className ?? "").split(/\s+/)) {
    const utility = (token.split(":").pop() ?? "").replace(/^[!-]+/, "");
    if (/^(h|min-h|max-h|size)-/.test(utility)) height = true;
    if (/^(w|min-w|max-w|size)-/.test(utility)) width = true;
  }
  return { height, width };
}

function WanderingEyes({ className, style, eyeScale, gapScale, pupilScale, blinkScale, travelScale, ...props }: WanderingEyesProps) {
  const eye = clamp(eyeScale, 0.28, 0.7, 0.62);
  const gap = clamp(gapScale, 0.04, 0.3, 0.09);
  const variables = {
    "--loading-ui-wandering-eyes-eye": cqmin(eye),
    "--loading-ui-wandering-eyes-gap": cqmin(gap),
    "--loading-ui-wandering-eyes-pupil-scale": clamp(pupilScale, 0.12, 0.45, 0.32),
    "--loading-ui-wandering-eyes-blink": clamp(blinkScale, 0.15, 1, 0.375),
    "--loading-ui-wandering-eyes-travel-scale": clamp(travelScale, 0.08, 0.5, 0.3125),
  } as CSSProperties;

  // The default height is 96px. If the caller sized it by width instead, the height follows from the 9:4 shape (h-auto), so
  // `className="w-40"` works without also having to say `h-auto`.
  const sized = sizesSet(className);
  const defaultHeight = sized.width && !sized.height ? "h-auto" : "h-24";

  return (
    <span role="status" className={cn("inline-flex aspect-[9/4] items-center justify-center [container-type:size]", defaultHeight, className)} style={{ ...variables, ...style }} {...props}>
      <style href="loading-ui-wandering-eyes" precedence="default">
        {STYLES}
      </style>
      <span aria-hidden="true" className="loading-ui-wandering-eyes__eyes inline-flex items-center justify-center">
        <span className="loading-ui-wandering-eyes__eye rounded-full" />
        <span className="loading-ui-wandering-eyes__eye rounded-full" />
      </span>
      <span className="sr-only">Loading</span>
    </span>
  );
}

export { WanderingEyes };
