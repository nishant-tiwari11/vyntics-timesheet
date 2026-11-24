"use client";

import { Fragment, useState } from "react";
import { Pencil, RotateCcw, Trash2 } from "lucide-react";
import type { ClauseKey } from "@/lib/offers/clauses";
import type { CustomClause, LetterBlock, LetterDoc, Phase } from "@/lib/offers/types";

// The letter drawn on screen from the same structure the PDF is drawn from, so what you read here is what the PDF says.
// Black text on white with the purple section headings of the printed letter. A picture that is not uploaded just stays hidden.
// With `edit`, the preview is editable: click a clause to change its wording for THIS letter, or a phase row to change the phase.
const hide = (e: React.SyntheticEvent<HTMLImageElement>) => {
  e.currentTarget.style.display = "none";
};

const PURPLE = "#6b58a8";
const LAVENDER = "#f3f0fa";

export type PreviewEdit = {
  /** The wording of a clause as it is now: this letter's own, else the company's. With {{details}} in it. */
  raw: (key: ClauseKey) => string;
  /** Has this letter its own wording for the clause? */
  changed: (key: ClauseKey) => boolean;
  setClause: (key: ClauseKey, text: string) => void;
  /** Go back to the company's wording. */
  resetClause: (key: ClauseKey) => void;
  phases: Phase[];
  setPhase: (index: number, patch: Partial<Phase>) => void;
  /** Phased internships only. */
  phased: boolean;
  addPhase?: () => void;
  removePhase?: (index: number) => void;
  /** Clauses added to this letter. */
  customs: CustomClause[];
  setCustom: (index: number, patch: Partial<CustomClause>) => void;
  addCustom: () => void;
  removeCustom: (index: number) => void;
};

const DETAILS: { key: string; label: string }[] = [
  { key: "company", label: "Company name" },
  { key: "firstName", label: "First name" },
  { key: "designation", label: "Role" },
  { key: "joiningDate", label: "Joining date" },
  { key: "workLocation", label: "Work location" },
  { key: "noticeDays", label: "Notice days" },
];

const input = "w-full rounded border border-neutral-300 bg-white px-2 py-1.5 text-[13px] text-neutral-900 outline-none focus:border-neutral-900";

function ClauseEditor({ k, edit, onDone }: { k: ClauseKey; edit: PreviewEdit; onDone: () => void }) {
  const id = `edit-${k}`;
  const insert = (detail: string) => {
    const el = document.getElementById(id) as HTMLTextAreaElement | null;
    const text = edit.raw(k);
    const at = el?.selectionStart ?? text.length;
    const to = el?.selectionEnd ?? at;
    edit.setClause(k, `${text.slice(0, at)}{{${detail}}}${text.slice(to)}`);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + detail.length + 4, at + detail.length + 4);
    });
  };
  return (
    <div className="my-2 grid gap-2 rounded-md border border-neutral-900 bg-neutral-50 p-3 text-[13px]" role="group" aria-label="Edit this wording">
      <label htmlFor={id} className="text-xs font-semibold text-neutral-600">
        Wording for this letter only{edit.changed(k) ? " (changed)" : ""}. A blank line starts a new paragraph.
      </label>
      <textarea id={id} rows={6} maxLength={3000} value={edit.raw(k)} onChange={(e) => edit.setClause(k, e.target.value)} className={`${input} resize-y leading-relaxed`} />
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-neutral-500">Add:</span>
        {DETAILS.map((d) => (
          <button key={d.key} type="button" onClick={() => insert(d.key)} className="rounded-full border border-neutral-300 bg-white px-2.5 py-0.5 text-xs hover:border-neutral-900">
            {d.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onDone} className="rounded bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white">
          Done
        </button>
        {edit.changed(k) && (
          <button type="button" onClick={() => edit.resetClause(k)} className="inline-flex items-center gap-1 rounded border border-neutral-300 bg-white px-3 py-1.5 text-xs">
            <RotateCcw className="size-3" aria-hidden="true" /> Use the company wording
          </button>
        )}
      </div>
    </div>
  );
}

function CustomEditor({ index, edit, onDone }: { index: number; edit: PreviewEdit; onDone: () => void }) {
  const c = edit.customs[index];
  if (!c) return null;
  return (
    <div className="my-2 grid gap-2 rounded-md border border-neutral-900 bg-neutral-50 p-3 text-[13px]" role="group" aria-label="Edit this clause">
      <div className="grid gap-1">
        <label htmlFor={`custom-${index}-title`} className="text-xs font-semibold text-neutral-600">
          Clause title
        </label>
        <input id={`custom-${index}-title`} className={input} value={c.title} maxLength={80} placeholder="For example: Working Hours" onChange={(e) => edit.setCustom(index, { title: e.target.value })} />
      </div>
      <div className="grid gap-1">
        <label htmlFor={`custom-${index}-text`} className="text-xs font-semibold text-neutral-600">
          Wording. A blank line starts a new paragraph.
        </label>
        <textarea id={`custom-${index}-text`} rows={6} maxLength={3000} className={`${input} resize-y leading-relaxed`} value={c.text} onChange={(e) => edit.setCustom(index, { text: e.target.value })} />
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onDone} className="rounded bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white">
          Done
        </button>
        <button
          type="button"
          onClick={() => {
            edit.removeCustom(index);
            onDone();
          }}
          className="inline-flex items-center gap-1 rounded border border-neutral-300 bg-white px-3 py-1.5 text-xs"
        >
          <Trash2 className="size-3" aria-hidden="true" /> Remove this clause
        </button>
      </div>
    </div>
  );
}

function PhaseEditor({ index, edit, onDone }: { index: number; edit: PreviewEdit; onDone: () => void }) {
  const p = edit.phases[index];
  if (!p) return null;
  const f = (k: string) => `phase-${index}-${k}`;
  return (
    <div className="grid gap-3 border-t border-neutral-900 bg-neutral-50 p-3 text-[13px]" role="group" aria-label={`Edit ${p.name}`}>
      <div className="grid gap-3 sm:grid-cols-2">
        {edit.phased && (
          <div className="grid gap-1">
            <label htmlFor={f("name")} className="text-xs font-semibold text-neutral-600">
              Name
            </label>
            <input id={f("name")} className={input} value={p.name} maxLength={40} onChange={(e) => edit.setPhase(index, { name: e.target.value })} />
          </div>
        )}
        <div className="grid gap-1">
          <label htmlFor={f("start")} className="text-xs font-semibold text-neutral-600">
            Start date
          </label>
          <input id={f("start")} type="date" className={input} value={p.startDate} onChange={(e) => edit.setPhase(index, { startDate: e.target.value })} />
        </div>
        <div className="grid gap-1">
          <label htmlFor={f("end")} className="text-xs font-semibold text-neutral-600">
            End date
          </label>
          <input id={f("end")} type="date" className={input} value={p.endDate} onChange={(e) => edit.setPhase(index, { endDate: e.target.value })} />
        </div>
        {edit.phased && (
          <label className="flex items-center gap-2 self-end pb-1.5 text-xs font-semibold text-neutral-600">
            <input type="checkbox" className="size-4" checked={p.isPaid} onChange={(e) => edit.setPhase(index, { isPaid: e.target.checked })} /> Paid phase
          </label>
        )}
        {p.isPaid && (
          <div className="grid gap-1">
            <label htmlFor={f("amt")} className="text-xs font-semibold text-neutral-600">
              Monthly stipend (INR)
            </label>
            <input id={f("amt")} inputMode="numeric" className={input} value={p.monthlyAmount} placeholder="12000" onChange={(e) => edit.setPhase(index, { monthlyAmount: e.target.value })} />
          </div>
        )}
        {edit.phased && (
          <div className="grid gap-1">
            <label htmlFor={f("eval")} className="text-xs font-semibold text-neutral-600">
              Evaluation window
            </label>
            <input id={f("eval")} className={input} value={p.evaluationWindow} maxLength={40} placeholder="January 2027" onChange={(e) => edit.setPhase(index, { evaluationWindow: e.target.value })} />
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onDone} className="rounded bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white">
          Done
        </button>
        {edit.removePhase && edit.phases.length > 2 && (
          <button
            type="button"
            onClick={() => {
              edit.removePhase?.(index);
              onDone();
            }}
            className="inline-flex items-center gap-1 rounded border border-neutral-300 bg-white px-3 py-1.5 text-xs"
          >
            <Trash2 className="size-3" aria-hidden="true" /> Remove this phase
          </button>
        )}
      </div>
    </div>
  );
}

export function LetterPreview({ letter, logoUrl, signatureUrl, sealUrl, edit }: { letter: LetterDoc; logoUrl?: string; signatureUrl?: string; sealUrl?: string; edit?: PreviewEdit }) {
  const [editKey, setEditKey] = useState<ClauseKey | null>(null);
  const [editPhase, setEditPhase] = useState<{ phase: number; block: number } | null>(null);
  const [editCustom, setEditCustom] = useState<number | null>(null);
  const lastClause = letter.blocks.reduce((at, b, i) => (b.t === "clause" ? i : at), -1);

  /** A paragraph of wording. In edit mode it is clickable; the one being edited is replaced by its editor (once per wording). */
  // (Plain functions, not components: a component defined here would be rebuilt on every keystroke and the box being typed in would lose focus.)
  function wording({ k, text, children, shown }: { k?: ClauseKey; text: string; children?: React.ReactNode; shown: Set<string> }) {
    if (!edit || !k) return <p className="text-justify">{children}{text}</p>;
    if (editKey === k) {
      if (shown.has(k)) return null;
      shown.add(k);
      return <ClauseEditor k={k} edit={edit} onDone={() => setEditKey(null)} />;
    }
    return (
      <p
        role="button"
        tabIndex={0}
        title="Click to edit this wording"
        onClick={() => setEditKey(k)}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setEditKey(k))}
        className="group/edit relative cursor-text rounded-sm text-justify outline-1 outline-transparent hover:bg-amber-50 hover:outline-dashed hover:outline-neutral-400 focus-visible:outline-dashed focus-visible:outline-neutral-900"
      >
        {children}
        {text}
        <Pencil className="ml-1 inline size-3 text-neutral-400 opacity-0 group-hover/edit:opacity-100" aria-hidden="true" />
        {edit.changed(k) && <span className="ml-1.5 rounded-full border border-neutral-400 px-1.5 text-[10px] text-neutral-500">edited</span>}
      </p>
    );
  }

  function renderTable(b: Extract<LetterBlock, { t: "table" }>, index: number) {
    const cols = b.widths.map((w) => `${w}fr`).join(" ");
    const phaseRows = edit && b.rowPhase ? b.rowPhase : null;
    const firstRowOf = (phase: number) => b.rowPhase?.findIndex((x) => x === phase) ?? -1;
    return (
      <>
        <div className="my-3 overflow-hidden border text-[13px]" style={{ borderColor: "#d9d9e3" }} role="table">
          {b.header && (
            <div className="grid" style={{ gridTemplateColumns: cols, background: PURPLE, color: "#fff" }} role="row">
              {b.header.map((h, i) => (
                <div key={i} role="columnheader" className={`p-2 font-bold ${b.align?.[i] === "right" ? "text-right" : ""}`}>
                  {h}
                </div>
              ))}
            </div>
          )}
          {b.rows.map((row, r) => {
            const phase = phaseRows ? phaseRows[r] : null;
            const open = phase !== null && editPhase?.phase === phase && editPhase.block === index && firstRowOf(phase) === r;
            return (
              <div key={r} className="border-t" style={{ borderColor: "#d9d9e3" }}>
                <div
                  className={`grid ${phase !== null ? "group/row cursor-pointer hover:bg-amber-50" : ""}`}
                  style={{ gridTemplateColumns: cols }}
                  role={phase !== null ? "button" : "row"}
                  tabIndex={phase !== null ? 0 : undefined}
                  title={phase !== null ? "Click to edit this phase" : undefined}
                  onClick={phase !== null ? () => setEditPhase(open ? null : { phase, block: index }) : undefined}
                  onKeyDown={phase !== null ? (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setEditPhase(open ? null : { phase, block: index })) : undefined}
                >
                  {row.map((cell, i) => (
                    <div
                      key={i}
                      role={i === 0 ? "rowheader" : "cell"}
                      className={`break-words p-2 ${i === 0 ? "font-bold" : ""} ${b.boldLastRow && r === b.rows.length - 1 ? "font-bold" : ""} ${b.align?.[i] === "right" ? "text-right" : ""}`}
                      style={i === 0 ? { background: LAVENDER } : undefined}
                    >
                      {cell}
                      {i === row.length - 1 && phase !== null && <Pencil className="ml-1.5 inline size-3 text-neutral-400 opacity-0 group-hover/row:opacity-100" aria-hidden="true" />}
                    </div>
                  ))}
                </div>
                {open && edit && <PhaseEditor index={phase} edit={edit} onDone={() => setEditPhase(null)} />}
              </div>
            );
          })}
        </div>
        {edit?.addPhase && !b.header && b.rowPhase && (
          <button type="button" onClick={edit.addPhase} className="mb-2 rounded border border-dashed border-neutral-400 px-3 py-1.5 text-xs text-neutral-600 hover:border-neutral-900">
            + Add a phase
          </button>
        )}
      </>
    );
  }

  /** The "add a clause" button, shown after the last clause. */
  function addButton() {
    if (!edit || edit.customs.length >= 10) return null;
    return (
      <button
        type="button"
        onClick={() => {
          edit.addCustom();
          setEditCustom(edit.customs.length);
        }}
        className="mt-3 rounded border border-dashed border-neutral-400 px-3 py-1.5 text-xs text-neutral-600 hover:border-neutral-900"
      >
        + Add a clause
      </button>
    );
  }

  const shown = new Set<string>();
  return (
    <article aria-label="Offer letter preview" className="mx-auto w-full max-w-[794px] bg-white p-6 text-[13px] leading-relaxed text-[#1f2937] shadow-sm ring-1 ring-black/10 sm:p-10">
      {edit && <p className="mb-3 rounded bg-neutral-100 px-3 py-1.5 text-center text-xs text-neutral-600">Click a clause or a phase in the letter to edit it. Changes here apply to this letter only.</p>}
      <header className="flex items-center justify-between gap-3 border-b-2 pb-3" style={{ borderColor: PURPLE }}>
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="size-14 object-contain" onError={hide} />
        ) : (
          <span className="size-14" aria-hidden="true" />
        )}
        <div className="text-right">
          <p className="text-base font-bold" style={{ color: PURPLE }}>
            {letter.company.toUpperCase()}
          </p>
          {letter.gstin && <p className="text-[10px] text-neutral-500">GSTIN {letter.gstin}</p>}
        </div>
      </header>

      <h1 className="mt-5 text-center text-xl font-bold">{letter.title}</h1>
      <p className="mt-1 text-center text-[11px] font-bold tracking-wide text-neutral-500">{letter.subtitle}</p>

      <div className="mt-5 flex justify-between gap-4">
        <div className="min-w-0 break-words">
          {letter.party.map((l, i) => (
            <p key={i}>{l}</p>
          ))}
        </div>
        <p className="shrink-0">Date: {letter.date}</p>
      </div>
      <p className="mt-4 font-bold">Subject: {letter.subject}</p>
      <p className="mt-3">{letter.salutation}</p>

      {letter.blocks.map((b, i) => {
        if (b.t === "para")
          return (
            <div key={i} className="mt-3">
              {wording({ k: b.key, text: b.text, shown })}
            </div>
          );
        if (b.t === "heading")
          return (
            <h2 key={i} className="mt-6 text-[15px] font-bold" style={{ color: PURPLE }}>
              {b.text}
            </h2>
          );
        if (b.t === "clause" && b.custom !== undefined && edit)
          return (
            <Fragment key={i}>
              {editCustom === b.custom ? (
                <CustomEditor index={b.custom} edit={edit} onDone={() => setEditCustom(null)} />
              ) : (
                <div
                  role="button"
                  tabIndex={0}
                  title="Click to edit this clause"
                  onClick={() => setEditCustom(b.custom ?? null)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setEditCustom(b.custom ?? null))}
                  className="group/edit mt-3 grid cursor-text gap-2 rounded-sm outline-1 outline-transparent hover:bg-amber-50 hover:outline-dashed hover:outline-neutral-400 focus-visible:outline-dashed focus-visible:outline-neutral-900"
                >
                  {b.paras.map((p, k) => (
                    <p key={k} className="text-justify">
                      {k === 0 && (
                        <strong>
                          {b.n}. {b.title} -{" "}
                        </strong>
                      )}
                      {p}
                      {k === 0 && <span className="ml-1.5 rounded-full border border-neutral-400 px-1.5 text-[10px] text-neutral-500">added</span>}
                    </p>
                  ))}
                </div>
              )}
              {i === lastClause && addButton()}
            </Fragment>
          );
        if (b.t === "clause")
          return (
            <Fragment key={i}>
            <div className="mt-3 grid gap-2">
              {b.paras.map((p, k) => (
                <Fragment key={k}>
                  {wording({
                    k: b.keys?.[k],
                    text: p,
                    shown,
                    children:
                      k === 0 ? (
                        <strong>
                          {b.n}. {b.title} -{" "}
                        </strong>
                      ) : null,
                  })}
                </Fragment>
              ))}
            </div>
            {i === lastClause && addButton()}
            </Fragment>
          );
        if (b.t === "table") return <Fragment key={i}>{renderTable(b, i)}</Fragment>;
        if (b.t === "annexureTitle")
          return (
            <h2 key={i} className="mt-8 text-center text-lg font-bold" style={{ color: PURPLE }}>
              {b.text}
            </h2>
          );
        if (b.t === "note") return <p key={i} className="mt-4 text-center text-[11px] text-neutral-500">{b.text}</p>;
        if (b.t === "acceptance")
          return (
            <div key={i} className="my-4 grid grid-cols-2 overflow-hidden border text-[13px]" style={{ borderColor: "#d9d9e3" }}>
              <div className="p-2 font-bold text-white" style={{ background: PURPLE }}>For {b.company}</div>
              <div className="p-2 font-bold text-white" style={{ background: PURPLE }}>Accepted by Candidate</div>
              <div className="grid gap-1 p-3" style={{ background: LAVENDER }}>
                <p className="font-bold">Name: {b.signatoryName}</p>
                {b.signatoryTitle && <p className="font-bold">Designation: {b.signatoryTitle}</p>}
                <div className="flex items-center gap-3">
                  <p className="font-bold">Signature:</p>
                  {signatureUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={signatureUrl} alt="" className="h-10 max-w-[9rem] object-contain" onError={hide} />
                  )}
                  {sealUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={sealUrl} alt="" className="ml-auto size-14 object-contain" onError={hide} />
                  )}
                </div>
                <p className="font-bold">Date: {b.letterDate}</p>
              </div>
              <div className="grid gap-1 p-3" style={{ background: LAVENDER }}>
                <p>Name: {b.candidateName}</p>
                <p>
                  Signature: {b.typed && <strong className="italic">{b.typed.name}</strong>}
                </p>
                <p>
                  Date: {b.typed && <strong>{b.typed.date}</strong>}
                </p>
              </div>
            </div>
          );
        return null;
      })}

      <footer className="mt-8 border-t pt-2 text-center text-[10px] text-neutral-500">
        {[letter.company.toUpperCase(), letter.gstin && `GSTIN ${letter.gstin}`, letter.city].filter(Boolean).join(" | ")}
      </footer>
    </article>
  );
}
