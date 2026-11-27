"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { TeamLanyardRail, type LanyardMember } from "@/components/ui/team-lanyard-rail";
import { EmployeeOrbit, type DialerPerson } from "./EmployeeDialer";

export function EmployeeRail({ items, people, total }: { items: LanyardMember[]; people: Record<string, DialerPerson>; total: number }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [animating, setAnimating] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const movement = useRef<Animation | null>(null);
  const resize = useRef<Animation | null>(null);
  const origin = useRef<{ index: number; rect: DOMRect; height: number } | null>(null);
  const member = selected === null ? null : items[selected];
  const person = member ? people[member.id] : null;
  // Equal strap lengths keep the ID cards on the same horizontal baseline.
  const alignedItems = useMemo(() => items.map((item) => ({ ...item, drop: 0 })), [items]);

  const rememberPosition = (index: number) => {
    const root = stage.current;
    const badge = root?.querySelector<HTMLElement>(`[data-badge="${index}"]`);
    if (root && badge) origin.current = { index, rect: badge.getBoundingClientRect(), height: root.getBoundingClientRect().height };
  };

  useLayoutEffect(() => {
    let disposed = false;
    // The rail measures its new container in a layout effect. Start after those
    // measurements, before the next paint, so the animation uses final coordinates.
    const frame = requestAnimationFrame(() => {
      const root = stage.current;
      const from = origin.current;
      if (!root || !from) return;
      origin.current = null;
      const badge = root.querySelector<HTMLElement>(`[data-badge="${from.index}"]`);
      const lanyard = badge?.closest<HTMLElement>("[data-lanyard]");
      if (!badge || !lanyard) return;
      const to = badge.getBoundingClientRect();
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const duration = reduced ? 0 : 340;
      const easing = "cubic-bezier(0.22, 1, 0.36, 1)";
      const animation = lanyard.animate([
        { translate: `${from.rect.left + from.rect.width / 2 - to.left - to.width / 2}px ${from.rect.top + from.rect.height / 2 - to.top - to.height / 2}px` },
        { translate: "0px 0px" },
      ], { duration, easing });
      movement.current = animation;
      resize.current = root.animate([
        { height: `${from.height}px` },
        { height: `${root.getBoundingClientRect().height}px` },
      ], { duration, easing });
      animation.finished.then(() => {
        if (!disposed) {
          setReady(selected !== null);
          setAnimating(false);
          if (selected === null) badge.focus({ preventScroll: true });
        }
      }).catch(() => { /* A new selection or unmount cancelled this movement. */ });
    });
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      movement.current?.cancel();
      resize.current?.cancel();
    };
  }, [selected]);

  const close = () => {
    if (selected === null) return;
    rememberPosition(selected);
    setReady(false);
    setAnimating(true);
    setSelected(null);
  };

  return (
    <div ref={stage} className="employee-stage" data-expanded={!!person} data-ready={ready} data-animating={animating} onKeyDown={(event) => {
      if (event.key === "Escape" && person) close();
    }}>
      {person && (
        <div className="employee-stage-header" aria-hidden={!ready} inert={!ready}>
          <button type="button" onClick={close} className="group inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
            <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" /> Everyone
          </button>
          <div className="employee-stage-identity" title={person.name}>
            <span className="block truncate text-sm font-semibold tracking-tight">{person.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{person.role}</span>
          </div>
          <Link href={`/timesheet/admin/access/${person.id}`} className="group inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm outline-none transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            Open profile <ArrowUpRight className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
          </Link>
        </div>
      )}
      <div className="employee-stage-badges">
        <TeamLanyardRail
          items={alignedItems}
          focusedIndex={selected}
          active={selected ?? undefined}
          eyebrow={person ? "Employee ID" : `Employees · ${total}`}
          heading={person ? undefined : "Everyone at Vyntics"}
          caption={person ? "" : "Brush along the rail to meet someone. Click a badge to see their day."}
          flipped={null}
          onFlippedChange={(i) => {
            if (i !== null && items[i] && people[items[i].id]) {
              rememberPosition(i);
              setReady(false);
              setAnimating(true);
              setSelected(i);
            }
          }}
          labels={{ flip: person ? "Their day is shown alongside" : "Click to open their day", back: "", show: "Show" }}
        />
      </div>
      <div className="employee-stage-orbit" aria-hidden={!ready} inert={!ready}>
        {person && <EmployeeOrbit key={person.id} person={person} />}
      </div>
    </div>
  );
}
