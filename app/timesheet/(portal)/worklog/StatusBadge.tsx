import { Check, Clock, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { LogStatusId } from "./model";

// Each status has its own icon, fill and text, so it reads without colour:
// Pending = outline with a clock, Approved = solid with a tick, Rejected = dark grey with a cross and struck-through text.
export function StatusBadge({ status }: { status: LogStatusId }) {
  if (status === "approved") {
    return (
      <Badge>
        <Check aria-hidden="true" /> Approved
      </Badge>
    );
  }
  if (status === "rejected") {
    return (
      <Badge className="bg-muted-foreground text-background">
        <X aria-hidden="true" /> <span className="line-through">Rejected</span>
      </Badge>
    );
  }
  return (
    <Badge variant="outline">
      <Clock aria-hidden="true" /> Pending
    </Badge>
  );
}
