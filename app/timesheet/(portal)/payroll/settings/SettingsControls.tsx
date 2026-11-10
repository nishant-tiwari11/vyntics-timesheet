"use client";

import { Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney, parseMoney, toRupeeText } from "@/lib/payroll/money";
import { WEEKDAY_NAMES, type ComponentInput, type ComponentRow, type PayrollSettingsData } from "@/lib/payroll/types";
import { deleteComponentAction, saveComponentAction, saveSettingsAction } from "../actions";

/** "12.5" (percent) → 1250 basis points, or null. Uses the same digit-splitting reader as money. */
const parsePercent = (text: string) => parseMoney(text);
const percentText = (bp: number) => toRupeeText(bp);

// ---------------------------- Pay cycle and rules ----------------------------

export function SettingsForm({ settings }: { settings: PayrollSettingsData }) {
  const [s, setS] = useState({
    currency: settings.currency,
    cycleStartDay: String(settings.cycleStartDay),
    payBasis: settings.payBasis,
    weeklyOffDays: settings.weeklyOffDays,
    holidayWorkMode: settings.holidayWorkMode,
    overtimeEnabled: settings.overtimeEnabled,
    overtimeRate: toRupeeText(settings.overtimeRateBp / 100).replace(/\.00$/, ""),
    holidayRate: toRupeeText(settings.holidayWorkRateBp / 100).replace(/\.00$/, ""),
    standardHours: String(settings.standardHours),
    overtimeBase: settings.overtimeBase,
    paidLeavePerMonth: String(settings.paidLeavePerMonth),
    roundNetToRupee: settings.roundNetToRupee,
    showStructureToEmployees: settings.showStructureToEmployees,
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof typeof s>(key: K, value: (typeof s)[K]) => setS((prev) => ({ ...prev, [key]: value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // The rates are typed as "times" (1.5 = one and a half times) and stored as whole basis points.
    const ot = parseMoney(s.overtimeRate);
    const hr = parseMoney(s.holidayRate);
    const hours = Number(s.standardHours);
    const day = Number(s.cycleStartDay);
    const leave = Number(s.paidLeavePerMonth);
    if (ot === null || hr === null) return setError("Enter the overtime and holiday work rates as numbers like 1.5.");
    if (!Number.isFinite(hours) || !Number.isFinite(day) || !Number.isFinite(leave)) return setError("Enter a number in every box.");

    startTransition(async () => {
      const res = await saveSettingsAction({
        currency: s.currency.trim().toUpperCase(),
        cycleStartDay: day,
        payBasis: s.payBasis,
        weeklyOffDays: s.weeklyOffDays,
        holidayWorkMode: s.holidayWorkMode,
        overtimeEnabled: s.overtimeEnabled,
        overtimeRateBp: ot * 100,
        holidayWorkRateBp: hr * 100,
        standardHours: hours,
        overtimeBase: s.overtimeBase,
        paidLeavePerMonth: leave,
        roundNetToRupee: s.roundNetToRupee,
        showStructureToEmployees: s.showStructureToEmployees,
      });
      if (!res.ok) {
        setError(res.error);
        toast.error(res.error);
        return;
      }
      toast.success("Payroll settings saved.");
    });
  }

  const field = (id: string, label: string, hint: string | null, control: React.ReactNode) => (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {control}
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );

  return (
    <form onSubmit={submit} noValidate className="grid gap-6">
      <fieldset className="grid gap-4" disabled={pending}>
        <legend className="mb-1 text-sm font-semibold">Pay month and days</legend>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {field("ps-start", "Month starts on day", "1 = the calendar month. The month ends the day before this day next month.", (
            <Input id="ps-start" inputMode="numeric" value={s.cycleStartDay} onChange={(e) => set("cycleStartDay", e.target.value)} aria-describedby="ps-start-hint" />
          ))}
          {field("ps-basis", "A day's pay is salary divided by", "Every day of the month, or working days only.", (
            <Select value={s.payBasis} onValueChange={(v) => set("payBasis", v as typeof s.payBasis)}>
              <SelectTrigger id="ps-basis" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="calendar_days">All days in the month</SelectItem>
                <SelectItem value="working_days">Working days only</SelectItem>
              </SelectContent>
            </Select>
          ))}
          {field("ps-currency", "Currency", "A three-letter code, such as INR.", (
            <Input id="ps-currency" value={s.currency} onChange={(e) => set("currency", e.target.value.toUpperCase())} maxLength={3} aria-describedby="ps-currency-hint" />
          ))}
        </div>

        <div className="grid gap-2">
          <span className="text-sm font-medium">Weekly off days</span>
          <div className="flex flex-wrap gap-x-5 gap-y-2" role="group" aria-label="Weekly off days">
            {WEEKDAY_NAMES.map((name, i) => {
              const iso = i + 1;
              return (
                <div key={iso} className="flex items-center gap-2">
                  <Checkbox
                    id={`ps-off-${iso}`}
                    checked={s.weeklyOffDays.includes(iso)}
                    onCheckedChange={(v) => set("weeklyOffDays", v === true ? [...s.weeklyOffDays, iso] : s.weeklyOffDays.filter((d) => d !== iso))}
                  />
                  <Label htmlFor={`ps-off-${iso}`} className="font-normal">
                    {name}
                  </Label>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">Public holidays and festival days from the Holidays list are always paid days.</p>
        </div>
      </fieldset>

      <fieldset className="grid gap-4" disabled={pending}>
        <legend className="mb-1 text-sm font-semibold">Leave and work on days off</legend>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {field("ps-paid-leave", "Paid leave days per month", "Approved leave beyond this is loss of pay. Comp-off leave is always paid.", (
            <Input id="ps-paid-leave" inputMode="numeric" value={s.paidLeavePerMonth} onChange={(e) => set("paidLeavePerMonth", e.target.value)} aria-describedby="ps-paid-leave-hint" />
          ))}
          {field("ps-mode", "Work on a holiday or week off", "Earn comp-off or be paid, never both for the same day.", (
            <Select value={s.holidayWorkMode} onValueChange={(v) => set("holidayWorkMode", v as typeof s.holidayWorkMode)}>
              <SelectTrigger id="ps-mode" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="comp_off">Comp-off</SelectItem>
                <SelectItem value="pay">Pay</SelectItem>
              </SelectContent>
            </Select>
          ))}
        </div>
      </fieldset>

      <fieldset className="grid gap-4" disabled={pending}>
        <legend className="mb-1 text-sm font-semibold">Overtime</legend>
        <div className="flex items-center gap-2">
          <Switch id="ps-ot" checked={s.overtimeEnabled} onCheckedChange={(v) => set("overtimeEnabled", v)} />
          <Label htmlFor="ps-ot">Pay overtime on working days</Label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {field("ps-std", "Standard hours per day", null, <Input id="ps-std" inputMode="decimal" value={s.standardHours} onChange={(e) => set("standardHours", e.target.value)} />)}
          {field("ps-base", "Hourly rate is based on", null, (
            <Select value={s.overtimeBase} onValueChange={(v) => set("overtimeBase", v as typeof s.overtimeBase)}>
              <SelectTrigger id="ps-base" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="basic">Basic pay</SelectItem>
                <SelectItem value="gross">Basic + HRA + allowances</SelectItem>
              </SelectContent>
            </Select>
          ))}
          {field("ps-ot-rate", "Overtime rate (times)", "1.5 = one and a half times the hourly rate.", (
            <Input id="ps-ot-rate" inputMode="decimal" value={s.overtimeRate} onChange={(e) => set("overtimeRate", e.target.value)} aria-describedby="ps-ot-rate-hint" />
          ))}
          {field("ps-hol-rate", "Holiday work rate (times)", "Used when work on a day off is paid.", (
            <Input id="ps-hol-rate" inputMode="decimal" value={s.holidayRate} onChange={(e) => set("holidayRate", e.target.value)} aria-describedby="ps-hol-rate-hint" />
          ))}
        </div>
      </fieldset>

      <div className="flex items-center gap-2">
        <Switch id="ps-round" checked={s.roundNetToRupee} onCheckedChange={(v) => set("roundNetToRupee", v)} disabled={pending} />
        <Label htmlFor="ps-round">Round net pay to the nearest whole rupee</Label>
      </div>

      <div className="flex items-center gap-2">
        <Switch id="ps-show" checked={s.showStructureToEmployees} onCheckedChange={(v) => set("showStructureToEmployees", v)} disabled={pending} aria-describedby="ps-show-hint" />
        <Label htmlFor="ps-show">Show salary structure to employees</Label>
      </div>
      <p id="ps-show-hint" className="-mt-4 text-xs text-muted-foreground">
        When on, each employee can see their own current salary breakdown on My Salary. Off by default.
      </p>

      {error && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save settings"}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------- Pay components ----------------------------

function ComponentForm({ component, currency, onClose }: { component?: ComponentRow; currency: string; onClose: () => void }) {
  const editing = !!component;
  const [name, setName] = useState(component?.name ?? "");
  const [code, setCode] = useState(component?.code ?? "");
  const [kind, setKind] = useState<ComponentInput["kind"]>(component?.kind ?? "deduction");
  const [calc, setCalc] = useState<ComponentInput["calc"]>(component?.calc ?? "fixed");
  const [amount, setAmount] = useState(component ? toRupeeText(component.amount) : "0.00");
  const [percent, setPercent] = useState(component ? percentText(component.percentBp) : "0.00");
  const [percentOf, setPercentOf] = useState<ComponentInput["percentOf"]>(component?.percentOf ?? "basic");
  const [enabled, setEnabled] = useState(component?.enabled ?? false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const locked = component?.statutory === true; // a built-in keeps its name, code and kind

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const paise = parseMoney(amount);
    const bp = parsePercent(percent);
    if (!name.trim()) return setError("Enter a name.");
    if (!editing && !/^[a-z0-9_]{2,30}$/.test(code)) return setError("The code uses 2 to 30 lowercase letters, numbers or underscores.");
    if (calc === "fixed" && paise === null) return setError("Enter the amount like 200 or 200.50.");
    if (calc === "percent" && (bp === null || bp > 10000)) return setError("Enter a percentage from 0 to 100, like 12 or 12.5.");

    startTransition(async () => {
      const res = await saveComponentAction({
        id: component?.id,
        code,
        name,
        kind,
        calc,
        amount: paise ?? 0,
        percentBp: bp ?? 0,
        percentOf: kind === "earning" ? "basic" : percentOf,
        enabled,
      });
      if (!res.ok) {
        setError(res.error);
        toast.error(res.error);
        return;
      }
      toast.success(editing ? "Component saved." : "Component added.");
      onClose();
    });
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{editing ? `Edit ${component.name}` : "Add a pay component"}</DialogTitle>
        <DialogDescription>
          {locked
            ? "Enter the rate from the official rules. Nothing here is built in."
            : "A custom earning or deduction applied to every employee when it is switched on."}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="pc-name">Name</Label>
          <Input id="pc-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} disabled={pending || locked} />
        </div>
        {!editing && (
          <div className="grid gap-1.5">
            <Label htmlFor="pc-code">Code</Label>
            <Input id="pc-code" value={code} onChange={(e) => setCode(e.target.value.toLowerCase())} maxLength={30} placeholder="meal_card" disabled={pending} />
          </div>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="pc-kind">Type</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)} disabled={pending || locked}>
            <SelectTrigger id="pc-kind" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="deduction">Deduction</SelectItem>
              <SelectItem value="earning">Earning</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pc-calc">Worked out as</Label>
          <Select value={calc} onValueChange={(v) => setCalc(v as typeof calc)} disabled={pending}>
            <SelectTrigger id="pc-calc" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fixed">A fixed amount</SelectItem>
              <SelectItem value="percent">A percentage</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {calc === "fixed" ? (
          <div className="grid gap-1.5">
            <Label htmlFor="pc-amount">Amount per month ({currency})</Label>
            <Input id="pc-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={pending} />
          </div>
        ) : (
          <>
            <div className="grid gap-1.5">
              <Label htmlFor="pc-percent">Percentage (%)</Label>
              <Input id="pc-percent" inputMode="decimal" value={percent} onChange={(e) => setPercent(e.target.value)} disabled={pending} />
            </div>
            {kind === "deduction" && (
              <div className="grid gap-1.5">
                <Label htmlFor="pc-of">Of</Label>
                <Select value={percentOf} onValueChange={(v) => setPercentOf(v as typeof percentOf)} disabled={pending}>
                  <SelectTrigger id="pc-of" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="basic">Basic pay earned</SelectItem>
                    <SelectItem value="gross">Gross pay earned</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Switch id="pc-enabled" checked={enabled} onCheckedChange={setEnabled} disabled={pending} />
        <Label htmlFor="pc-enabled">Switched on</Label>
      </div>
      <p className="text-xs text-muted-foreground">
        Fixed amounts are monthly: earnings are pro-rated for days not worked, deductions are taken in full. Percentages are of the pro-rated pay.
      </p>

      {error && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function describe(c: ComponentRow, currency: string) {
  if (c.calc === "fixed") return `${formatMoney(c.amount, currency)} per month`;
  return `${percentText(c.percentBp)}% of ${c.kind === "earning" || c.percentOf === "basic" ? "basic" : "gross"}`;
}

export function ComponentsTable({ components, currency }: { components: ComponentRow[]; currency: string }) {
  const [editing, setEditing] = useState<ComponentRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<ComponentRow | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(c: ComponentRow, on: boolean) {
    startTransition(async () => {
      const res = await saveComponentAction({ id: c.id, code: c.code, name: c.name, kind: c.kind, calc: c.calc, amount: c.amount, percentBp: c.percentBp, percentOf: c.percentOf, enabled: on });
      if (!res.ok) toast.error(res.error);
      else toast.success(`${c.name} ${on ? "switched on" : "switched off"}.`);
    });
  }

  function remove() {
    if (!deleting) return;
    startTransition(async () => {
      const res = await deleteComponentAction(deleting.id);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Component deleted.");
      setDeleting(null);
    });
  }

  return (
    <div className="grid gap-3">
      <div className="flex justify-end">
        <Button type="button" variant="outline" onClick={() => setEditing("new")}>
          <Plus aria-hidden="true" /> Add component
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <caption className="sr-only">Pay components</caption>
          <TableHeader>
            <TableRow>
              <TableHead>On</TableHead>
              <TableHead>Component</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Value</TableHead>
              <TableHead className="text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {components.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <Switch checked={c.enabled} onCheckedChange={(v) => toggle(c, v)} disabled={pending} aria-label={`${c.name}, ${c.enabled ? "on" : "off"}`} />
                </TableCell>
                <TableCell>
                  <div className="font-medium">{c.name}</div>
                  {c.statutory && (
                    <Badge variant="outline" className="mt-1 border-dashed">
                      Statutory: verify rates
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="capitalize">{c.kind}</TableCell>
                <TableCell className="tabular-nums">{describe(c, currency)}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1.5">
                    <Button type="button" size="sm" variant="outline" onClick={() => setEditing(c)}>
                      Edit
                    </Button>
                    {!c.statutory && (
                      <Button type="button" size="sm" variant="ghost" onClick={() => setDeleting(c)}>
                        Delete
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          {editing !== null && <ComponentForm component={editing === "new" ? undefined : editing} currency={currency} onClose={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>

      <Dialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleting?.name}?</DialogTitle>
            <DialogDescription>It will no longer apply to new payroll. Past payslips are not affected.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleting(null)} disabled={pending}>
              Keep
            </Button>
            <Button type="button" variant="destructive" onClick={remove} disabled={pending}>
              {pending ? "Deleting..." : "Delete component"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

