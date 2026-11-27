"use client";

import { Bold, Code, Heading, Italic, Link2, List, ListChecks, ListOrdered, Paperclip, Quote } from "lucide-react";
import { useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { blocks, inline, PRIORITY_LABEL, PRIORITY_TONE, STATUS_LABEL, type Piece, type Priority, type Status } from "@/lib/tickets/model";

export const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60";

const STATUS_TONE: Record<Status, string> = {
  open: "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200",
  reopened: "border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-700 dark:bg-orange-950 dark:text-orange-200",
  assigned: "border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-200",
  in_progress: "border-indigo-300 bg-indigo-50 text-indigo-800 dark:border-indigo-700 dark:bg-indigo-950 dark:text-indigo-200",
  on_hold: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200",
  pending_review: "border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-200",
  resolved: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200",
  closed: "border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
};

/** The status as text in a coloured pill (the words carry the meaning; the colour only helps). */
export function StatusPill({ status, className }: { status: Status; className?: string }) {
  return <span className={cn("inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium", STATUS_TONE[status], className)}>{STATUS_LABEL[status]}</span>;
}

/** A coloured dot with the priority's name beside it. */
export function PriorityTag({ priority, className }: { priority: Priority; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", className)}>
      <span aria-hidden="true" className={cn("size-2 rounded-full", PRIORITY_TONE[priority])} />
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

function pieces(list: Piece[]) {
  return list.map((p, i) =>
    p.kind === "bold" ? (
      <strong key={i}>{p.text}</strong>
    ) : p.kind === "italic" ? (
      <em key={i}>{p.text}</em>
    ) : p.kind === "code" ? (
      <code key={i} className="rounded bg-muted px-1 py-0.5 text-[0.85em]">
        {p.text}
      </code>
    ) : p.kind === "mention" ? (
      <span key={i} className="rounded bg-primary/10 px-1 font-medium text-primary">
        {p.text}
      </span>
    ) : p.kind === "link" ? (
      <a key={i} href={p.href} target="_blank" rel="noopener noreferrer nofollow" className="text-primary underline underline-offset-2">
        {p.text}
      </a>
    ) : (
      <span key={i}>{p.text}</span>
    )
  );
}

/** Text a person typed, shown with paragraphs, lists, bold and italic. Everything is plain React text, so nothing can inject markup. */
export function Markup({ text, className }: { text: string; className?: string }) {
  const parts = blocks(text);
  if (parts.length === 0) return null;
  return (
    <div className={cn("grid gap-2 text-sm leading-relaxed break-words", className)}>
      {parts.map((b, i) =>
        b.kind === "p" ? (
          <p key={i} className="whitespace-pre-wrap">
            {pieces(b.pieces)}
          </p>
        ) : b.kind === "h" ? (
          <p key={i} role="heading" aria-level={b.level + 2} className={b.level === 1 ? "text-lg font-semibold" : b.level === 2 ? "text-base font-semibold" : "font-semibold"}>
            {pieces(b.pieces)}
          </p>
        ) : b.kind === "quote" ? (
          <blockquote key={i} className="whitespace-pre-wrap border-l-4 pl-3 text-muted-foreground">
            {pieces(b.pieces)}
          </blockquote>
        ) : b.kind === "tasks" ? (
          <ul key={i} className="grid gap-1">
            {b.items.map((it, j) => (
              <li key={j} className="flex items-start gap-2">
                <input type="checkbox" checked={it.done} readOnly disabled aria-label={it.done ? "Done" : "Not done"} className="mt-1 size-4 accent-primary" />
                <span className={it.done ? "text-muted-foreground line-through" : undefined}>{pieces(it.pieces)}</span>
              </li>
            ))}
          </ul>
        ) : b.kind === "ul" ? (
          <ul key={i} className="list-disc space-y-0.5 pl-5">
            {b.items.map((it, j) => (
              <li key={j}>{pieces(it)}</li>
            ))}
          </ul>
        ) : (
          <ol key={i} className="list-decimal space-y-0.5 pl-5">
            {b.items.map((it, j) => (
              <li key={j}>{pieces(it)}</li>
            ))}
          </ol>
        )
      )}
    </div>
  );
}

/** Plain text of a piece list, for places that can't show formatting (a card's one-line summary). */
export const plain = (text: string) => inline(text).map((p) => p.text).join("");

function ToolButton({ label, Icon, onClick, disabled }: { label: string; Icon: typeof Bold; onClick: () => void; disabled: boolean }) {
  return (
    <button type="button" className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50" onClick={onClick} disabled={disabled} aria-label={label} title={label}>
      <Icon className="size-4" aria-hidden="true" />
    </button>
  );
}

/**
 * The editor for descriptions and comments, laid out like GitHub's: Write and Preview tabs, a toolbar (heading, bold, italic, quote,
 * code, link, lists, task list) and, when `onFiles` is given, a strip to add files (click, drop, or paste a picture). What is typed
 * stays plain text with simple markers (see lib/tickets/model.ts), and Preview shows it the way it will appear.
 */
export function RichText({
  id,
  value,
  onChange,
  rows = 5,
  maxLength,
  placeholder,
  disabled,
  preview = false,
  onFiles,
  accept,
  "aria-invalid": invalid,
  "aria-describedby": describedBy,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  maxLength: number;
  placeholder?: string;
  disabled?: boolean;
  /** Show the Write / Preview tabs. */
  preview?: boolean;
  /** Called with files that are dropped, pasted (pictures) or chosen with the "add files" strip. Leave out for no file strip. */
  onFiles?: (files: File[]) => void;
  accept?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [dragging, setDragging] = useState(false);

  function put(next: string, from: number, to: number) {
    if (next.length > maxLength) return;
    onChange(next);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(from, to);
    });
  }

  function wrap(mark: string) {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    const chosen = value.slice(a, b) || "text";
    put(`${value.slice(0, a)}${mark}${chosen}${mark}${value.slice(b)}`, a + mark.length, a + mark.length + chosen.length);
  }

  /** Change the start of every selected line: a heading, a quote, a list item or a task. */
  function lines(prefix: (i: number) => string) {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    const start = value.lastIndexOf("\n", a - 1) + 1;
    const endAt = value.indexOf("\n", b);
    const end = endAt === -1 ? value.length : endAt;
    const out = value
      .slice(start, end)
      .split("\n")
      .map((l, i) => `${prefix(i)}${l.replace(/^\s*(?:#{1,3}\s+|>\s?|[-*•]\s+\[[ xX]\]\s+|[-*•]\s+|\d+[.)]\s+)/, "")}`);
    put(`${value.slice(0, start)}${out.join("\n")}${value.slice(end)}`, start, start + out.join("\n").length);
  }

  function link() {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    const text = value.slice(a, b) || "text";
    const url = "https://";
    put(`${value.slice(0, a)}[${text}](${url})${value.slice(b)}`, a + text.length + 3, a + text.length + 3 + url.length);
  }

  const off = disabled || tab === "preview";
  const tabClass = (on: boolean) => `-mb-px border-b-2 px-3 py-2 text-sm font-medium ${on ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`;

  return (
    <div
      className={`overflow-hidden rounded-lg border bg-background focus-within:ring-[3px] focus-within:ring-ring/40 ${dragging ? "border-primary bg-accent/30" : ""}`}
      onDragOver={(e) => {
        if (!onFiles || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        if (!onFiles || e.dataTransfer.files.length === 0) return;
        e.preventDefault();
        setDragging(false);
        onFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-1 border-b bg-muted/30 pr-2">
        {preview ? (
          <div role="tablist" aria-label="Editor" className="flex">
            <button type="button" role="tab" aria-selected={tab === "write"} className={tabClass(tab === "write")} onClick={() => setTab("write")}>
              Write
            </button>
            <button type="button" role="tab" aria-selected={tab === "preview"} className={tabClass(tab === "preview")} onClick={() => setTab("preview")}>
              Preview
            </button>
          </div>
        ) : (
          <span className="w-2" />
        )}
        <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5 py-1">
          <ToolButton label="Heading" Icon={Heading} disabled={off} onClick={() => lines(() => "### ")} />
          <ToolButton label="Bold" Icon={Bold} disabled={off} onClick={() => wrap("**")} />
          <ToolButton label="Italic" Icon={Italic} disabled={off} onClick={() => wrap("_")} />
          <ToolButton label="Quote" Icon={Quote} disabled={off} onClick={() => lines(() => "> ")} />
          <ToolButton label="Code" Icon={Code} disabled={off} onClick={() => wrap("`")} />
          <ToolButton label="Link" Icon={Link2} disabled={off} onClick={link} />
          <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
          <ToolButton label="Bullet list" Icon={List} disabled={off} onClick={() => lines(() => "- ")} />
          <ToolButton label="Numbered list" Icon={ListOrdered} disabled={off} onClick={() => lines((i) => `${i + 1}. `)} />
          <ToolButton label="Task list" Icon={ListChecks} disabled={off} onClick={() => lines(() => "- [ ] ")} />
        </div>
      </div>

      {tab === "preview" ? (
        <div className="min-h-24 p-3" style={{ minHeight: `${rows * 1.5 + 1}rem` }}>
          {value.trim() ? <Markup text={value} /> : <p className="text-sm text-muted-foreground">Nothing to preview.</p>}
        </div>
      ) : (
        <Textarea
          ref={ref}
          id={id}
          value={value}
          rows={rows}
          maxLength={maxLength}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
          onPaste={(e) => {
            const images = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
            if (!onFiles || images.length === 0) return;
            e.preventDefault();
            onFiles(images.map((f, i) => new File([f], f.name && f.name !== "image.png" ? f.name : `screenshot-${Date.now()}-${i + 1}.png`, { type: f.type })));
          }}
          className="resize-y rounded-none border-0 shadow-none focus-visible:ring-0"
        />
      )}

      <div className="flex items-center justify-between gap-2 border-t px-3 py-1.5 text-xs text-muted-foreground">
        {onFiles ? (
          <>
            <button type="button" className="inline-flex items-center gap-1.5 hover:text-foreground" onClick={() => picker.current?.click()} disabled={disabled}>
              <Paperclip className="size-3.5" aria-hidden="true" /> Paste, drop, or click to add files
            </button>
            <input ref={picker} type="file" multiple accept={accept} className="sr-only" tabIndex={-1} aria-label="Choose files" onChange={(e) => { onFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
          </>
        ) : (
          <span>Bold, italic, lists and links are supported.</span>
        )}
        <span className="tabular-nums">
          {value.length}/{maxLength}
        </span>
      </div>
    </div>
  );
}

const WHEN = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const WHEN_TIME = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });

export const fmtDate = (iso: string | null) => (iso ? WHEN.format(new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso)) : "-");
export const fmtDateTime = (iso: string) => WHEN_TIME.format(new Date(iso));
