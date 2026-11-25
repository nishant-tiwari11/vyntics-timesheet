"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { CategoryRow } from "@/lib/expenses/types";
import { ClaimForm } from "./ExpenseControls";

// The "Add new expense" button. The form opens in a window and closes itself once the expense is saved.
export default function NewExpense({ categories, today }: { categories: CategoryRow[]; today: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} className="max-md:min-h-11">
        <Plus aria-hidden="true" /> Add new expense
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>New expense</DialogTitle>
            <DialogDescription>Fill in the details and attach the bill. An admin approves it, then it is paid with your salary.</DialogDescription>
          </DialogHeader>
          <ClaimForm categories={categories} today={today} onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
