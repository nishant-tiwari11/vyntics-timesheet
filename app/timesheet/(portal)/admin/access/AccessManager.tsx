"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { UserAvatar } from "../../../_components/UserAvatar";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { joinName, nameFromEmail } from "@/lib/nameFromEmail";
import { ROLES, ROLE_LABEL, parseBulkUsers, toRole, type Role, type SignInMethod } from "@/lib/access/config";
import type { AccessRow } from "@/lib/access/server";
import { addManyAction, addUserAction, removeUserAction, resetPasswordAction, setManagerAction, updateUserAction } from "./actions";

const NONE = "__none__";
const ALL = "__all__";

function Filter({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: (readonly [string, string])[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-40" aria-label={`Filter by ${label.toLowerCase()}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All {label.toLowerCase()}s</SelectItem>
        {options.map(([v, l]) => (
          <SelectItem key={v} value={v}>
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "Never");

/** 16 random letters and digits, for a temporary password. The browser's own random source, not Math.random. */
function makePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

type Managers = { email: string; name: string }[];

// ---------------------------- + Add employee ----------------------------

function AddUserDialog() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [role, setRole] = useState<Role>("employee");
  const [method, setMethod] = useState<SignInMethod>("google");
  const [password, setPassword] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setEmail("");
    setFirst("");
    setLast("");
    setRole("employee");
    setMethod("google");
    setPassword("");
    setExpiresOn("");
    setError(null);
  }

  function save() {
    setError(null);
    // A work email (ved.sharma@vyntics.com) gives the name by itself; anyone else needs a first name typed here.
    const fromEmail = nameFromEmail(email);
    if (!fromEmail && !first.trim()) return setError("Enter the first name. Names are only taken from work email addresses.");
    const name = first.trim() || last.trim() ? joinName(first, last) : (fromEmail?.full ?? "");
    startTransition(async () => {
      const res = await addUserAction({ email, name, role, method, password: method === "password" ? password : undefined, expiresOn: expiresOn || null });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success("Added.");
      setOpen(false);
      reset();
    });
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        + Add employee
      </Button>
      <Dialog open={open} onOpenChange={(o) => (setOpen(o), !o && reset())}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add an employee</DialogTitle>
            <DialogDescription>For people who don&apos;t have a company-domain Google account, or who need a different role or an end date.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="add-email">Email</Label>
              <Input id="add-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} disabled={pending} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="add-first">First name</Label>
                <Input id="add-first" value={first} onChange={(e) => setFirst(e.target.value)} maxLength={50} disabled={pending} placeholder={nameFromEmail(email)?.first ?? ""} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="add-last">Last name</Label>
                <Input id="add-last" value={last} onChange={(e) => setLast(e.target.value)} maxLength={50} disabled={pending} placeholder={nameFromEmail(email)?.last ?? ""} />
              </div>
              <p className="-mt-2 text-xs text-muted-foreground sm:col-span-2">
                For a work address like ved.sharma@vyntics.com the name is taken from the email. For anyone else, type it here: the employee can&apos;t change it.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="add-role">Role</Label>
                <Select value={role} onValueChange={(v) => setRole(v as Role)} disabled={pending}>
                  <SelectTrigger id="add-role" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="add-method">Signs in with</Label>
                <Select value={method} onValueChange={(v) => setMethod(v as SignInMethod)} disabled={pending}>
                  <SelectTrigger id="add-method" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="google">Google</SelectItem>
                    <SelectItem value="password">Email and password</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {method === "password" && (
              <div className="grid gap-1.5">
                <Label htmlFor="add-password">Temporary password</Label>
                <div className="flex gap-2">
                  <Input id="add-password" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={72} autoComplete="off" disabled={pending} aria-describedby="add-password-hint" />
                  <Button type="button" variant="outline" onClick={() => setPassword(makePassword())} disabled={pending}>
                    Generate
                  </Button>
                </div>
                <p id="add-password-hint" className="text-xs text-muted-foreground">
                  At least 10 characters. Copy it now and send it to them safely: it can&apos;t be shown again, only reset.
                </p>
              </div>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="add-expiry">Access ends on (optional)</Label>
              <Input id="add-expiry" type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} disabled={pending} />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="button" onClick={save} disabled={pending}>
              {pending ? "Adding..." : "Add employee"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------- Bulk add ----------------------------

function BulkDialog() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [role, setRole] = useState<Role>("employee");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const parsed = parseBulkUsers(text, role);

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 200_000) return setError("That file is too big. A list of emails should be well under 200 KB.");
    setText(await file.text());
    setError(null);
  }

  function save() {
    setError(null);
    if (parsed.entries.length === 0) return setError(parsed.errors[0] ?? "Paste at least one email address.");
    startTransition(async () => {
      const res = await addManyAction({ people: parsed.entries, method: "google" });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success(res.message ?? "Added.");
      setOpen(false);
      setText("");
    });
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        Bulk add
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add many people</DialogTitle>
            <DialogDescription>One per line: email, or email,name, or email,name,role. They sign in with Google. A CSV file works too.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="bulk-text">Emails</Label>
              <Textarea id="bulk-text" rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder={"partner@gmail.com\nclient@abc.com,Client Name,viewer"} disabled={pending} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="bulk-file">Or choose a CSV file</Label>
                <Input id="bulk-file" type="file" accept=".csv,.txt,text/csv,text/plain" onChange={(e) => onFile(e.target.files?.[0])} disabled={pending} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="bulk-role">Role when a line has none</Label>
                <Select value={role} onValueChange={(v) => setRole(v as Role)} disabled={pending}>
                  <SelectTrigger id="bulk-role" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {text.trim() && (
              <p className="text-sm" role="status">
                {parsed.entries.length} {parsed.entries.length === 1 ? "person" : "people"} ready to add
                {parsed.errors.length > 0 ? `, ${parsed.errors.length} ${parsed.errors.length === 1 ? "line has" : "lines have"} a problem:` : "."}
              </p>
            )}
            {parsed.errors.length > 0 && (
              <ul className="list-disc space-y-1 pl-5 text-sm text-destructive">
                {parsed.errors.slice(0, 5).map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="button" onClick={save} disabled={pending || parsed.entries.length === 0}>
              {pending ? "Adding..." : `Add ${parsed.entries.length || ""}`.trim()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------- One row ----------------------------

function Row({ row, managers }: { row: AccessRow; managers: Managers }) {
  const [dialog, setDialog] = useState<"remove" | "password" | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const expired = row.expiresOn !== null && row.expiresOn < new Date().toISOString().slice(0, 10);

  function run(task: () => Promise<{ ok: boolean; error?: string }>, success: string, done?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await task();
      if (!res.ok) {
        setError(res.error ?? "Something went wrong.");
        toast.error(res.error ?? "Something went wrong.");
        return;
      }
      toast.success(success);
      done?.();
    });
  }

  const close = () => {
    setDialog(null);
    setPassword("");
    setError(null);
  };

  return (
    <TableRow>
      <TableCell className="min-w-48">
        <div className="flex items-center gap-2">
          <UserAvatar userId={row.userId} name={row.name || row.email} className="size-8 text-xs" />
          <div className="min-w-0">
            <div className="font-medium break-all">
              {row.userId ? (
                <Link href={`/timesheet/admin/access/${row.userId}`} className="hover:underline">
                  {row.name || row.email}
                </Link>
              ) : (
                row.name || row.email
              )}
            </div>
            {row.name && <div className="text-xs break-all text-muted-foreground">{row.email}</div>}
            {row.isSelf && <div className="text-xs text-muted-foreground">You</div>}
          </div>
        </div>
      </TableCell>
      <TableCell>
        <Select
          value={row.role}
          disabled={pending || row.isSelf}
          onValueChange={(v) => run(() => updateUserAction({ email: row.email, role: toRole(v) }), "Role changed.")}
        >
          <SelectTrigger className="w-32" aria-label={`Role for ${row.email}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_LABEL[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="whitespace-nowrap">{row.department || <span className="text-muted-foreground">-</span>}</TableCell>
      <TableCell>
        <Badge variant="outline" className={row.status === "disabled" ? "border-dashed" : expired ? "border-destructive text-destructive" : "border-foreground"}>
          {row.status === "disabled" ? "○ Disabled" : expired ? "✕ Expired" : "✓ Active"}
        </Badge>
        <div className="mt-1 text-xs text-muted-foreground">
          {row.type === "manual" ? "Added manually" : "Company domain"}
          {row.loginMethod ? ` · ${row.loginMethod === "password" ? "password" : "Google"}` : ""}
          {row.expiresOn ? ` · ends ${row.expiresOn}` : ""}
        </div>
      </TableCell>
      <TableCell className="whitespace-nowrap">{row.signedIn ? when(row.lastLogin) : "Not yet"}</TableCell>
      <TableCell>
        {row.signedIn ? (
          <Select
            value={row.managerEmail || NONE}
            disabled={pending}
            onValueChange={(v) => run(() => setManagerAction(row.email, v === NONE ? "" : v), "Manager saved.")}
          >
            <SelectTrigger className="w-40" aria-label={`Manager for ${row.email}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No manager</SelectItem>
              {managers
                .filter((m) => m.email !== row.email)
                .map((m) => (
                  <SelectItem key={m.email} value={m.email}>
                    {m.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-xs text-muted-foreground">After first sign-in</span>
        )}
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap justify-end gap-1.5">
          {!row.isSelf && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                run(() => updateUserAction({ email: row.email, status: row.status === "active" ? "disabled" : "active" }), row.status === "active" ? "Disabled." : "Enabled.")
              }
              aria-label={`${row.status === "active" ? "Disable" : "Enable"} ${row.email}`}
            >
              {row.status === "active" ? "Disable" : "Enable"}
            </Button>
          )}
          {row.loginMethod === "password" && (
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => setDialog("password")} aria-label={`Reset password for ${row.email}`}>
              Reset password
            </Button>
          )}
          {!row.isSelf && (
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setDialog("remove")} aria-label={`Remove ${row.email}`}>
              Remove
            </Button>
          )}
        </div>

        <Dialog open={dialog !== null} onOpenChange={(o) => !o && close()}>
          <DialogContent>
            {dialog === "remove" && (
              <>
                <DialogHeader>
                  <DialogTitle>Remove {row.email}?</DialogTitle>
                  <DialogDescription>
                    They are taken off the list and can&apos;t sign in. If they already have an account it is switched off, and their timesheets, expenses and payslips are kept.
                    {row.type === "domain" ? " Anyone on a company domain can still be let back in by adding them again." : ""}
                  </DialogDescription>
                </DialogHeader>
                {error && (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                )}
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={close} disabled={pending}>
                    Keep
                  </Button>
                  <Button type="button" variant="destructive" disabled={pending} onClick={() => run(() => removeUserAction(row.email), "Removed.", close)}>
                    {pending ? "Removing..." : "Remove"}
                  </Button>
                </DialogFooter>
              </>
            )}
            {dialog === "password" && (
              <>
                <DialogHeader>
                  <DialogTitle>Reset password for {row.email}</DialogTitle>
                  <DialogDescription>They are signed out everywhere and any lockout is cleared. Send them the new password safely.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-1.5">
                  <Label htmlFor={`reset-${row.email}`}>New password</Label>
                  <div className="flex gap-2">
                    <Input id={`reset-${row.email}`} value={password} onChange={(e) => setPassword(e.target.value)} maxLength={72} autoComplete="off" disabled={pending} />
                    <Button type="button" variant="outline" onClick={() => setPassword(makePassword())} disabled={pending}>
                      Generate
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">At least 10 characters. It can&apos;t be shown again.</p>
                </div>
                {error && (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                )}
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={close} disabled={pending}>
                    Cancel
                  </Button>
                  <Button type="button" disabled={pending} onClick={() => run(() => resetPasswordAction({ email: row.email, password }), "Password reset.", close)}>
                    {pending ? "Saving..." : "Reset password"}
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </TableCell>
    </TableRow>
  );
}

// ---------------------------- The table ----------------------------

export default function AccessManager({ rows, managers }: { rows: AccessRow[]; managers: Managers }) {
  const [q, setQ] = useState("");
  const [role, setRole] = useState<string>(ALL);
  const [status, setStatus] = useState<string>(ALL);
  const [dept, setDept] = useState<string>(ALL);
  const needle = q.trim().toLowerCase();
  const today = new Date().toISOString().slice(0, 10);
  const departments = [...new Set(rows.map((r) => r.department).filter(Boolean))].sort();
  const shown = rows.filter((r) => {
    const expired = r.expiresOn !== null && r.expiresOn < today;
    if (needle && !`${r.email} ${r.name} ${r.department}`.toLowerCase().includes(needle)) return false;
    if (role !== ALL && r.role !== role) return false;
    if (dept !== ALL && r.department !== dept) return false;
    if (status === "active") return r.status === "active" && !expired;
    if (status === "disabled") return r.status === "disabled";
    if (status === "expired") return expired;
    if (status === "invited") return !r.signedIn;
    return true;
  });

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email or department" aria-label="Search people" className="max-w-xs" />
        <Filter label="Role" value={role} onChange={setRole} options={ROLES.map((r) => [r, ROLE_LABEL[r]])} />
        <Filter label="Status" value={status} onChange={setStatus} options={[["active", "Active"], ["disabled", "Disabled"], ["expired", "Expired"], ["invited", "Not signed in yet"]]} />
        {departments.length > 0 && <Filter label="Department" value={dept} onChange={setDept} options={departments.map((d) => [d, d])} />}
        <div className="ml-auto flex gap-2">
          <BulkDialog />
          <AddUserDialog />
        </div>
      </div>
      {shown.length === 0 ? (
        <div className="ts-card ts-empty">
          <strong>No one matches</strong>
          <p>Try a different search, or add someone.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <caption className="sr-only">Employees</caption>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last login</TableHead>
                <TableHead>Manager</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((r) => (
                <Row key={r.email} row={r} managers={managers} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
