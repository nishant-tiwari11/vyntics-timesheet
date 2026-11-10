import { Badge } from "@/components/ui/badge";

// Status stays readable without colour: each state has its own symbol and border style.
const LOOK = {
  draft: { text: "○ Draft", className: "border-dashed" },
  reviewed: { text: "◐ Reviewed", className: "" },
  finalized: { text: "✓ Finalized", className: "border-foreground" },
  paid: { text: "✓✓ Paid", className: "border-foreground bg-foreground text-background" },
} as const;

export default function RunStatusBadge({ status }: { status: keyof typeof LOOK }) {
  const look = LOOK[status];
  return (
    <Badge variant="outline" className={look.className}>
      {look.text}
    </Badge>
  );
}
