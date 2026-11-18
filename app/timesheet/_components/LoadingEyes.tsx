import { WanderingEyes } from "@/components/ui/wandering-eyes";

/**
 * The eyes as the loading indicator: indigo (it contrasts with the page), with the bigger eye, gap and pupil.
 * `compact` is for loading screens inside the portal, where the page behind must stay visible; the default is for the
 * full-screen loader.
 */
export function LoadingEyesFigure({ compact = false }: { compact?: boolean }) {
  return (
    <WanderingEyes
      className={compact ? "h-10 text-indigo-500 md:h-12" : "h-20 text-indigo-500 md:h-24"}
      eyeScale={0.7}
      gapScale={0.12}
      pupilScale={0.4}
    />
  );
}

// On a loading screen inside the portal: just the eyes, in the exact middle of the window, over the page's grey placeholders.
// There is no box or backdrop, so the whole page stays visible around them. It is decorative here (each loading screen
// already tells screen readers that the page is loading) and it ignores the mouse, so everything stays clickable.
export function LoadingEyes() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center">
      <LoadingEyesFigure compact />
    </div>
  );
}
