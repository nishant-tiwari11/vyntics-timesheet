import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WanderingEyes } from "@/components/ui/wandering-eyes";

const html = (props: Parameters<typeof WanderingEyes>[0] = {}) => renderToStaticMarkup(<WanderingEyes {...props} />);

describe("WanderingEyes", () => {
  it("is a status with two hidden eyes and a 'Loading' label for screen readers", () => {
    const out = html();
    expect(out).toMatch(/^<style[^>]*>|<span role="status"/);
    expect(out).toContain('role="status"');
    expect(out).toContain('aria-hidden="true"');
    expect(out.match(/class="loading-ui-wandering-eyes__eye rounded-full"/g)).toHaveLength(2);
    expect(out).toContain('<span class="sr-only">Loading</span>');
  });

  it("is a 9:4 size container so the eyes can be sized in cqmin", () => {
    const out = html();
    expect(out).toContain("aspect-[9/4]");
    expect(out).toContain("[container-type:size]");
    expect(out).toContain("inline-flex");
  });

  it("sets the defaults as CSS variables, with eye and gap in cqmin", () => {
    const out = html();
    expect(out).toContain("--loading-ui-wandering-eyes-eye:62cqmin");
    expect(out).toContain("--loading-ui-wandering-eyes-gap:9cqmin");
    expect(out).toContain("--loading-ui-wandering-eyes-pupil-scale:0.32");
    expect(out).toContain("--loading-ui-wandering-eyes-blink:0.375");
    expect(out).toContain("--loading-ui-wandering-eyes-travel-scale:0.3125");
  });

  it("uses the values given, and keeps each one inside its safe range", () => {
    const own = html({ eyeScale: 0.5, gapScale: 0.1, pupilScale: 0.2, blinkScale: 0.5, travelScale: 0.2 });
    expect(own).toContain("--loading-ui-wandering-eyes-eye:50cqmin");
    expect(own).toContain("--loading-ui-wandering-eyes-gap:10cqmin");
    expect(own).toContain("--loading-ui-wandering-eyes-pupil-scale:0.2");
    expect(own).toContain("--loading-ui-wandering-eyes-blink:0.5");
    expect(own).toContain("--loading-ui-wandering-eyes-travel-scale:0.2");

    const tooBig = html({ eyeScale: 5, gapScale: 5, pupilScale: 5, blinkScale: 5, travelScale: 5 });
    expect(tooBig).toContain("--loading-ui-wandering-eyes-eye:70cqmin");
    expect(tooBig).toContain("--loading-ui-wandering-eyes-gap:30cqmin");
    expect(tooBig).toContain("--loading-ui-wandering-eyes-pupil-scale:0.45");
    expect(tooBig).toContain("--loading-ui-wandering-eyes-blink:1");
    expect(tooBig).toContain("--loading-ui-wandering-eyes-travel-scale:0.5");

    const tooSmall = html({ eyeScale: -1, gapScale: 0, pupilScale: 0, blinkScale: 0, travelScale: 0 });
    expect(tooSmall).toContain("--loading-ui-wandering-eyes-eye:28cqmin");
    expect(tooSmall).toContain("--loading-ui-wandering-eyes-gap:4cqmin");
    expect(tooSmall).toContain("--loading-ui-wandering-eyes-pupil-scale:0.12");
    expect(tooSmall).toContain("--loading-ui-wandering-eyes-blink:0.15");
    expect(tooSmall).toContain("--loading-ui-wandering-eyes-travel-scale:0.08");
  });

  it("falls back to the defaults for values that aren't real numbers", () => {
    const out = html({ eyeScale: Number.NaN, blinkScale: Number.POSITIVE_INFINITY });
    expect(out).toContain("--loading-ui-wandering-eyes-eye:62cqmin");
    expect(out).toContain("--loading-ui-wandering-eyes-blink:0.375");
  });

  it("is 96px high (h-24) by default, with nothing set by the parent", () => {
    const out = html();
    expect(out).toContain("h-24");
    expect(out).not.toContain("h-auto");
  });

  it("lets a caller choose a different height, or size it by width alone", () => {
    const byHeight = html({ className: "h-12" });
    expect(byHeight).toContain("h-12");
    expect(byHeight).not.toContain("h-24");

    const byWidth = html({ className: "w-40" }); // the height then follows from the 9:4 shape
    expect(byWidth).toContain("w-40");
    expect(byWidth).toContain("h-auto");
    expect(byWidth).not.toContain("h-24");

    const bySize = html({ className: "size-20" });
    expect(bySize).toContain("size-20");
    expect(bySize).not.toContain("h-24");

    expect(html({ className: "md:w-40" })).toContain("h-auto"); // through a breakpoint prefix
    expect(html({ className: "[--duration:6s]" })).toContain("h-24"); // a speed class isn't a size
  });

  it("passes className, style and other span props to the root, and lets a caller override the speed", () => {
    const out = html({ className: "text-primary [--duration:6s]", style: { color: "tomato" }, id: "busy", "data-test": "x" } as Parameters<typeof WanderingEyes>[0]);
    expect(out).toContain("text-primary");
    expect(out).toContain("[--duration:6s]");
    expect(out).toContain("color:tomato");
    expect(out).toContain('id="busy"');
    expect(out).toContain('data-test="x"');
  });

  it("has no floating-point noise in the sizes", () => {
    for (const eyeScale of [0.28, 0.57, 0.62, 0.7, 0.33]) expect(html({ eyeScale })).toMatch(new RegExp(`--loading-ui-wandering-eyes-eye:${Math.round(eyeScale * 100)}cqmin`));
  });

  it("defines both animations on the same timing, with the speed taken from --duration (10s by default)", () => {
    const css = html();
    expect(css).toContain("@keyframes loading-ui-wandering-eyes-move");
    expect(css).toContain("@keyframes loading-ui-wandering-eyes-blink");
    expect(css.match(/var\(--duration, 10s\)/g)).toHaveLength(2);
    expect(css).toContain("color-mix(in srgb, currentColor 16%, transparent)");
    expect(css).toContain("radial-gradient(circle closest-side, var(--pupil-color)");
    // The pupil is dark by default (the page ink colour with a hint of the text colour), and a caller can pick another colour.
    expect(css).toContain("--pupil-color: var(--loading-ui-wandering-eyes-pupil-color, color-mix(in srgb, currentColor 15%, CanvasText))");
    expect(css).toContain("background-repeat: no-repeat");
    expect(css).toContain("prefers-reduced-motion: reduce");
  });

  it("moves the pupil centre, left, right, down and back, and blinks around each change", () => {
    const css = html();
    for (const frame of ["0%, 10%", "13%, 40%", "43%, 70%", "73%, 90%", "93%, 100%"]) expect(css).toContain(frame);
    expect(css).toContain("calc(50% - var(--travel)) 50%"); // left
    expect(css).toContain("calc(50% + var(--travel)) 50%"); // right
    expect(css).toContain("50% calc(50% + var(--travel))"); // down
    for (const closed of ["11.5%", "41.5%", "71.5%", "91.5%", "99.5%"]) expect(css).toContain(closed);
  });
});

describe("the loaders", () => {
  it("LoadingEyes sits in the exact middle of the window with no box or backdrop, so the page stays visible", async () => {
    const { LoadingEyes } = await import("@/app/timesheet/_components/LoadingEyes");
    const out = renderToStaticMarkup(<LoadingEyes />);
    expect(out).toMatch(/<div aria-hidden="true" class="[^"]*fixed inset-0[^"]*flex items-center justify-center[^"]*"/);
    expect(out).toContain("pointer-events-none"); // everything underneath stays clickable
    expect(out).toContain("loading-ui-wandering-eyes__eye");
    expect(out).toContain("h-10"); // small
    expect(out).not.toContain("bg-background"); // no backdrop and no card behind the eyes
    expect(out).not.toContain("border");
    expect(out).not.toContain("shadow");
    expect(out).not.toContain("rounded-2xl");
  });

  it("uses the bigger eye, gap and pupil and a colour that contrasts", async () => {
    const { LoadingEyesFigure } = await import("@/app/timesheet/_components/LoadingEyes");
    for (const compact of [true, false]) {
      const out = renderToStaticMarkup(<LoadingEyesFigure compact={compact} />);
      expect(out).toContain("text-indigo-500");
      expect(out).toContain("--loading-ui-wandering-eyes-eye:70cqmin");
      expect(out).toContain("--loading-ui-wandering-eyes-gap:12cqmin");
      expect(out).toContain("--loading-ui-wandering-eyes-pupil-scale:0.4");
      expect(out).not.toContain("h-auto");
    }
    expect(renderToStaticMarkup(<LoadingEyesFigure />)).toContain("h-20");
    expect(renderToStaticMarkup(<LoadingEyesFigure compact />)).toContain("h-10");
  });

  it("the full-screen loader centres the eyes in the window, horizontally and vertically", async () => {
    const { default: Loading } = await import("@/app/timesheet/loading");
    const out = renderToStaticMarkup(<Loading />);
    expect(out).toMatch(/<div class="flex min-h-screen items-center justify-center bg-background">/);
    expect(out).toContain('role="status"');
    expect(out).toContain('<span class="sr-only">Loading</span>');
  });
});
