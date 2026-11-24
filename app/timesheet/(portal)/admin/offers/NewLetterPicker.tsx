"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FilePlus2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

// "Generate offer letter": choose the employee, then fill in the letter.
export function NewLetterPicker({ people }: { people: { id: string; name: string }[] }) {
  const router = useRouter();
  const [id, setId] = useState("");
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (id) router.push(`/timesheet/admin/offers/new?user=${id}`);
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="new-offer-person">New letter for</Label>
        <select
          id="new-offer-person"
          value={id}
          onChange={(e) => setId(e.target.value)}
          className="h-9 w-64 max-w-full rounded-[var(--radius)] border border-input bg-background px-3 text-sm outline-none focus-visible:border-foreground focus-visible:ring-[3px] focus-visible:ring-foreground/20 max-md:h-11"
        >
          <option value="">Choose an employee</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" disabled={!id} className="max-md:min-h-11">
        <FilePlus2 aria-hidden="true" /> Generate offer letter
      </Button>
    </form>
  );
}
