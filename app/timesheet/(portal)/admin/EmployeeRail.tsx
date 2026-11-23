"use client";

import { useEffect, useState } from "react";
import { TeamLanyardRail, type LanyardMember } from "@/components/ui/team-lanyard-rail";
import { cn } from "@/lib/utils";
import { EmployeeOrbit, type DialerPerson } from "./EmployeeDialer";

const TURN_MS = 500;

// The company's people as ID badges hanging from a rail. Click a badge and the whole rail turns around into that person's orbit
// (a quick look at their day); "Everyone" turns it back. The badges never flip here: a click opens the orbit instead.
export function EmployeeRail({ items, people, total }: { items: LanyardMember[]; people: Record<string, DialerPerson>; total: number }) {
  const [person, setPerson] = useState<DialerPerson | null>(null);
  const [open, setOpen] = useState(false);

  // Once the turn back has finished, the orbit is taken away so it stops animating out of sight.
  useEffect(() => {
    if (open || !person) return;
    const t = setTimeout(() => setPerson(null), TURN_MS);
    return () => clearTimeout(t);
  }, [open, person]);

  const turn = "transition-[opacity,transform] ease-out motion-reduce:transition-none";
  return (
    <div className="grid overflow-clip [perspective:1400px]">
      <div
        className={cn("[grid-area:1/1]", turn, open ? "pointer-events-none opacity-0 [transform:rotateY(80deg)_scale(0.92)]" : "opacity-100 [transform:rotateY(0)]")}
        style={{ transitionDuration: `${TURN_MS}ms` }}
        aria-hidden={open}
        inert={open}
      >
        <TeamLanyardRail
          items={items}
          eyebrow={`Employees · ${total}`}
          heading="Everyone at Vyntics"
          caption="Brush along the rail to meet someone. Click a badge to see their day."
          flipped={null}
          onFlippedChange={(i) => {
            if (i === null) return;
            const member = items[i];
            if (member && people[member.id]) {
              setPerson(people[member.id]);
              setOpen(true);
            }
          }}
          labels={{ flip: "Click to open their day", back: "", show: "Show" }}
        />
      </div>
      <div
        className={cn("[grid-area:1/1]", turn, open ? "opacity-100 [transform:rotateY(0)]" : "pointer-events-none opacity-0 [transform:rotateY(-80deg)_scale(0.92)]")}
        style={{ transitionDuration: `${TURN_MS}ms` }}
        aria-hidden={!open}
        inert={!open}
      >
        {person && <EmployeeOrbit key={person.id} person={person} onBack={() => setOpen(false)} />}
      </div>
    </div>
  );
}
