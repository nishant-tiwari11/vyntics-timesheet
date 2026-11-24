"use client";

import { useCallback, useEffect, useState } from "react";
import { FilePlus2, Loader2, Settings } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { LetterData } from "@/lib/offers/types";
import { ENGAGEMENT_TYPES } from "@/lib/offers/types";
import type { OfferDetail, OfferRow, OfferSettings } from "@/lib/offers/server";
import { formatInstantDate } from "@/lib/timesheet/dates";
import { loadNewOfferAction, loadOfferAction, loadOfferListAction, loadOfferSettingsAction } from "../offers/actions";
import { OfferEditor } from "../offers/OfferEditor";
import { OfferSettingsForm } from "../offers/settings/OfferSettingsForm";

// Offer letters, inside Admin > Documents (no pages of their own): the list with filters and search, the editor with a live
// preview, and the company details and clause wording. Everything is read when this tab opens and again after a change.

const STATUS_LABEL = { draft: "Draft", sent: "Sent", accepted: "Accepted" } as const;
const TYPE_LABEL = Object.fromEntries(ENGAGEMENT_TYPES.map((t) => [t.id, t.label])) as Record<string, string>;
const selectClass = "h-9 rounded-[var(--radius)] border border-input bg-background px-3 text-sm max-md:h-11";
const NOBODY = "__nobody";
const PICTURES = { signatureUrl: "/api/offers/asset?kind=signature", sealUrl: "/api/offers/asset?kind=seal", logoUrl: "/api/offers/asset?kind=logo" };

type Mode = { m: "list" } | { m: "new"; userId: string } | { m: "edit"; id: string } | { m: "settings" };
type Loaded =
  | { k: "list"; ready: boolean; rows: OfferRow[]; truncated: boolean }
  | { k: "new"; name: string; initial: LetterData; userId: string }
  | { k: "edit"; detail: OfferDetail; initial: LetterData }
  | { k: "settings"; pictures: { logo: boolean; signature: boolean; seal: boolean } };

export function OfferLettersTab({ people }: { people: { id: string; name: string }[] }) {
  const [mode, setMode] = useState<Mode>({ m: "list" });
  const [filter, setFilter] = useState({ q: "", type: "", status: "" });
  const [applied, setApplied] = useState(filter);
  // What was read, and for which view: a result for an older view is ignored, and no result for the current one means "loading".
  const [read, setRead] = useState<{ key: string; settings: OfferSettings; data: Loaded } | { key: string; error: string } | null>(null);
  const [tick, setTick] = useState(0);
  const [pick, setPick] = useState("");
  const reload = useCallback(() => setTick((t) => t + 1), []);
  const key = JSON.stringify([mode, applied, tick]);

  useEffect(() => {
    let live = true;
    (async () => {
      const s = await loadOfferSettingsAction();
      if (!live) return;
      if (!s.ok) return setRead({ key, error: s.error });
      const done = (data: Loaded) => live && setRead({ key, settings: s.settings, data });
      const fail = (error: string) => live && setRead({ key, error });
      if (mode.m === "list") {
        const r = await loadOfferListAction(applied);
        if (r.ok) done({ k: "list", ready: r.ready, rows: r.rows, truncated: r.truncated });
        else fail(r.error);
      } else if (mode.m === "new") {
        const r = await loadNewOfferAction(mode.userId);
        if (r.ok) done({ k: "new", name: r.name, initial: r.initial, userId: mode.userId });
        else fail(r.error);
      } else if (mode.m === "edit") {
        const r = await loadOfferAction(mode.id);
        if (r.ok) done({ k: "edit", detail: r.detail, initial: r.initial });
        else fail(r.error);
      } else {
        done({ k: "settings", pictures: s.pictures });
      }
    })();
    return () => {
      live = false;
    };
  }, [mode, applied, tick, key]);

  const current = read && read.key === key ? read : null;
  const error = current && "error" in current ? current.error : null;
  const data = current && "data" in current ? current.data : null;
  const settings = current && "settings" in current ? current.settings : null;

  const back = () => setMode({ m: "list" });

  if (error) {
    return (
      <div className="grid justify-items-start gap-3">
        <p role="alert" className="ts-alert">
          {error}
        </p>
        <Button type="button" variant="outline" onClick={back}>
          Back to the list
        </Button>
      </div>
    );
  }
  if (!data || !settings) {
    return (
      <p role="status" className="flex items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-10 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading offer letters…
      </p>
    );
  }

  // ---------------------------------------------------------------- settings
  if (data.k === "settings") {
    return (
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="grid gap-1">
            <h2 className="text-base font-semibold">Company settings</h2>
            <p className="text-sm text-muted-foreground">The company details and pictures used by every offer letter. To change the wording of a letter, click the clause in its preview.</p>
          </div>
          <Button type="button" variant="outline" className="max-md:min-h-11" onClick={back}>
            Back to the list
          </Button>
        </div>
        {!settings.ready && (
          <p role="note" className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
            Not set up yet. Run <code>supabase/step41_offer_letters.sql</code> in Supabase, then reload.
          </p>
        )}
        <OfferSettingsForm saved={{ company: settings.company, clauses: settings.clauses }} ready={settings.ready} pictures={data.pictures} onChanged={reload} />
      </div>
    );
  }

  // ---------------------------------------------------------------- the editor
  if (data.k === "new" || data.k === "edit") {
    const row = data.k === "edit" ? data.detail.row : null;
    const fresh = data.k === "new" ? data : null;
    return (
      <div className="grid gap-4">
        <div className="grid gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">{row ? row.name : fresh?.name ? `New offer letter for ${fresh.name}` : "New offer letter"}</h2>
            {row && <Badge variant={row.status === "draft" ? "outline" : "default"}>{STATUS_LABEL[row.status]}</Badge>}
            {row && (
              <span className="text-sm text-muted-foreground">
                {TYPE_LABEL[row.type]} · version {row.version}
              </span>
            )}
          </div>
          {row?.status === "accepted" && (
            <p className="text-sm text-muted-foreground">
              Accepted {row.method === "typed" ? `by typing "${row.acceptedName}"` : "with a signed copy"}
              {row.acceptedOn ? ` on ${formatInstantDate(row.acceptedOn)}` : ""}.
              {row.signedDocumentId && (
                <>
                  {" "}
                  <a href={`/api/documents/${row.signedDocumentId}/download`} className="underline underline-offset-4">
                    Open the signed copy
                  </a>
                </>
              )}
            </p>
          )}
          {!row && <p className="text-sm text-muted-foreground">Choose the type, fill in the details and check the preview. Nothing is sent until you click Send, and a letter for a new employee without an account can only be downloaded.</p>}
        </div>

        <OfferEditor
          key={row ? row.id : `new-${fresh?.userId ?? ""}`}
          letter={row ? { id: row.id, userId: row.userId, status: row.status, version: row.version, isCurrent: row.isCurrent } : { id: null, userId: fresh?.userId || null, status: "draft", version: 1, isCurrent: true }}
          people={people}
          initial={data.initial}
          company={settings.company}
          clauses={settings.clauses}
          {...PICTURES}
          onOpen={(id) => {
            setMode({ m: "edit", id });
            reload();
          }}
          onClose={back}
        />

        {data.k === "edit" && data.detail.versions.length > 1 && (
          <section aria-labelledby="offer-versions" className="grid gap-2 rounded-lg border p-4">
            <h3 id="offer-versions" className="text-sm font-semibold">
              Version history
            </h3>
            <ol className="grid gap-1.5 text-sm">
              {data.detail.versions.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-medium tabular-nums">v{v.version}</span>
                  <Badge variant={v.status === "draft" ? "outline" : "default"}>{STATUS_LABEL[v.status]}</Badge>
                  <span className="text-muted-foreground">
                    {formatInstantDate(v.updatedAt)}
                    {v.isCurrent ? " · current" : ""}
                  </span>
                  {row && v.id !== row.id && (
                    <button type="button" className="underline underline-offset-4" onClick={() => setMode({ m: "edit", id: v.id })}>
                      Open
                    </button>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------- the list
  const filtered = !!(applied.q || applied.type || applied.status);
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">One template, four kinds of letter. Create a draft, send it to the employee, and they accept it in the portal. A sent letter appears on their profile under Documents.</p>
        <Button type="button" variant="outline" className="max-md:min-h-11" onClick={() => setMode({ m: "settings" })}>
          <Settings aria-hidden="true" /> Company settings
        </Button>
      </div>

      {!data.ready ? (
        <p role="note" className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          Offer letters aren&apos;t set up yet. Run <code>supabase/step41_offer_letters.sql</code> in Supabase.
        </p>
      ) : (
        <>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (pick) setMode({ m: "new", userId: pick === NOBODY ? "" : pick });
            }}
          >
            <div className="grid gap-1.5">
              <label htmlFor="new-offer-person" className="text-sm font-medium">
                New letter for
              </label>
              <select id="new-offer-person" value={pick} onChange={(e) => setPick(e.target.value)} className={`${selectClass} w-64 max-w-full`}>
                <option value="">Choose who it is for</option>
                <option value={NOBODY}>New employee (type their details)</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={!pick} className="max-md:min-h-11">
              <FilePlus2 aria-hidden="true" /> Create new
            </Button>
          </form>

          <form
            role="search"
            aria-label="Filter the letters"
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setApplied(filter);
            }}
          >
            <div className="grid gap-1.5">
              <label htmlFor="of-q" className="text-sm font-medium">
                Search by name
              </label>
              <input id="of-q" value={filter.q} maxLength={60} placeholder="Name" onChange={(e) => setFilter((f) => ({ ...f, q: e.target.value }))} className="h-9 w-56 rounded-[var(--radius)] border border-input bg-background px-3 text-sm outline-none focus-visible:border-foreground max-md:h-11" />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="of-type" className="text-sm font-medium">
                Type
              </label>
              <select id="of-type" value={filter.type} onChange={(e) => setFilter((f) => ({ ...f, type: e.target.value }))} className={selectClass}>
                <option value="">All types</option>
                {ENGAGEMENT_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="of-status" className="text-sm font-medium">
                Status
              </label>
              <select id="of-status" value={filter.status} onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value }))} className={selectClass}>
                <option value="">All statuses</option>
                {(["draft", "sent", "accepted"] as const).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" variant="outline" className="max-md:min-h-11">
              Apply
            </Button>
            {filtered && (
              <Button
                type="button"
                variant="ghost"
                className="max-md:min-h-11"
                onClick={() => {
                  const none = { q: "", type: "", status: "" };
                  setFilter(none);
                  setApplied(none);
                }}
              >
                Clear
              </Button>
            )}
          </form>

          {data.rows.length === 0 ? (
            <div className="ts-card ts-empty">
              <strong>{filtered ? "No letters match" : "No offer letters yet"}</strong>
              <p>{filtered ? "Try a different filter." : "Choose who it is for above and click Create new."}</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <caption className="sr-only">Offer letters, newest change first</caption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead>Last change</TableHead>
                    <TableHead>
                      <span className="sr-only">Open</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell>{TYPE_LABEL[r.type]}</TableCell>
                      <TableCell>
                        <Badge variant={r.status === "draft" ? "outline" : "default"}>{STATUS_LABEL[r.status]}</Badge>
                        {r.status === "accepted" && r.acceptedAt && <span className="mt-1 block text-xs text-muted-foreground">{formatInstantDate(r.acceptedAt)}</span>}
                      </TableCell>
                      <TableCell className="tabular-nums">v{r.version}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatInstantDate(r.updatedAt)}</TableCell>
                      <TableCell className="text-right">
                        <Button type="button" size="sm" variant="outline" className="max-md:min-h-11" onClick={() => setMode({ m: "edit", id: r.id })}>
                          {r.status === "draft" ? "Edit" : "Open"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {data.truncated && <p className="text-xs text-muted-foreground">Showing the latest 300. Use the filters to narrow it down.</p>}
        </>
      )}
    </div>
  );
}
