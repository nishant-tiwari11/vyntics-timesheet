import { Badge } from "@/components/ui/badge";
import { STATUS_LABEL, STATUS_SYMBOL, type ExpenseStatus } from "@/lib/expenses/types";

// Each state has its own symbol and border style, so it reads without colour (like the payroll run badge).
const CLASS: Record<ExpenseStatus, string> = {
  draft: "border-dashed",
  pending: "",
  approved: "border-foreground",
  added_to_payroll: "border-foreground",
  reimbursed: "border-foreground bg-foreground text-background",
  rejected: "border-destructive text-destructive",
};

export default function ExpenseStatusBadge({ status }: { status: ExpenseStatus }) {
  return (
    <Badge variant="outline" className={CLASS[status]}>
      {STATUS_SYMBOL[status]} {STATUS_LABEL[status]}
    </Badge>
  );
}
