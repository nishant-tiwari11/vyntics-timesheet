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
import { ROLES, ROLE_LABEL, parseBulkUsers, toRole, type Role, type SignInMethod } from "@/lib/access/config";
import type { AccessRow } from "@/lib/access/server";
import { addManyAction, addUserAction, removeUserAction, resetPasswordAction, setManagerAction, updateUserAction } from "./actions";

const NONE = "__none__";

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "Never");

/** 16 random letters and digits, for a temporary password. The browser's own random source, not Math.random. */
function makePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

type Managers = { email: string; name: string }[];

// ---------------------------- + Add user ----------------------------

function AddUserDialog() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("employee");
  const [method, setMethod] = useState<SignInMethod>("google");
  const [password, setPassword] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setEmail("");
    setName("");
    setRole("employee");
    setMethod("google");
    setPassword("");
    setExpiresOn("");
    setError(null);
  }

  function save() {
    setError(null);
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
        + Add user
      </Button>
      <Dialog open={open} onOpenChange={(o) => (setOpen(o), !o && reset())}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add a user</DialogTitle>
            <DialogDescription>For people who don&apos;t have a company-domain Google account, or who need a different role or an end date.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="add-email">Email</Label>
              <Input id="add-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} disabled={pending} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="add-name">Name</Label>
              <Input id="add-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} disabled={pending} />
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
              {pending ? "Adding..." : "Add user"}
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
                <Link href={`/timesheet/profile?user=${row.userId}`} className="hover:underline">
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
      <TableCell>
        <Badge variant="outline" className={row.type === "manual" ? "border-foreground" : ""}>
          {row.type === "manual" ? "Manual" : "Domain"}
        </Badge>
        {row.loginMethod && <div className="mt-1 text-xs text-muted-foreground">{row.loginMethod === "password" ? "Password" : "Google"}</div>}
      </TableCell>
      <TableCell>
        <Badge variant="outline" className={row.status === "disabled" ? "border-dashed" : expired ? "border-destructive text-destructive" : "border-foreground"}>
          {row.status === "disabled" ? "○ Disabled" : expired ? "✕ Expired" : "✓ Active"}
        </Badge>
      </TableCell>
      <TableCell className="whitespace-nowrap">{row.signedIn ? when(row.lastLogin) : "Not yet"}</TableCell>
      <TableCell className="whitespace-nowrap">{row.expiresOn ?? "-"}</TableCell>
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
  const needle = q.trim().toLowerCase();
  const shown = needle ? rows.filter((r) => `${r.email} ${r.name}`.toLowerCase().includes(needle)) : rows;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or email" aria-label="Search people" className="max-w-xs" />
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
            <caption className="sr-only">People who can sign in</caption>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last login</TableHead>
                <TableHead>Expires</TableHead>
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
