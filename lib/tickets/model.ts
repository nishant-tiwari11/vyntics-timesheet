// Ticket rules shared by the server and the browser. Plain code with no server-only imports, so the tests can use it too.
// The database enforces the same rules (supabase/step45_tickets.sql); this copy lets the screens offer only moves that can work.

export const STATUSES = ["open", "assigned", "in_progress", "on_hold", "pending_review", "resolved", "closed", "reopened"] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<Status, string> = {
  open: "Open",
  assigned: "Assigned",
  in_progress: "In progress",
  on_hold: "On hold",
  pending_review: "Pending review",
  resolved: "Resolved",
  closed: "Closed",
  reopened: "Reopened",
};

export const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABEL: Record<Priority, string> = { low: "Low", medium: "Medium", high: "High", urgent: "Urgent" };
/** Colour of the little dot and badge for each priority. */
export const PRIORITY_TONE: Record<Priority, string> = {
  low: "bg-slate-400",
  medium: "bg-blue-500",
  high: "bg-amber-500",
  urgent: "bg-red-600",
};

export const isStatus = (v: unknown): v is Status => typeof v === "string" && (STATUSES as readonly string[]).includes(v);
export const isPriority = (v: unknown): v is Priority => typeof v === "string" && (PRIORITIES as readonly string[]).includes(v);

/** TCK-00042 */
export const ticketCode = (n: number) => `TCK-${String(n).padStart(5, "0")}`;

/** Moves the people handling a ticket can make. */
const STAFF_MOVES: Record<Status, Status[]> = {
  open: ["assigned", "in_progress", "on_hold"],
  assigned: ["open", "in_progress", "on_hold"],
  in_progress: ["assigned", "on_hold", "pending_review", "resolved"],
  on_hold: ["assigned", "in_progress"],
  pending_review: ["in_progress", "resolved"],
  reopened: ["assigned", "in_progress", "on_hold"],
  resolved: [],
  closed: [],
};

/** Moves only the person who raised the ticket (or an admin) can make: withdraw it, confirm the fix, say it isn't fixed. */
const RAISER_MOVES: Partial<Record<Status, Status[]>> = {
  open: ["closed"],
  resolved: ["closed", "reopened"],
  closed: ["reopened"],
};

export type Who = { raiser: boolean; staff: boolean; admin: boolean };

/** Which statuses this person can move the ticket to from where it is now. */
export function nextStatuses(from: Status, who: Who): Status[] {
  const out = new Set<Status>();
  if (who.staff || who.admin) STAFF_MOVES[from].forEach((s) => out.add(s));
  if (who.raiser || who.admin) (RAISER_MOVES[from] ?? []).forEach((s) => out.add(s));
  if (who.staff && from === "resolved") out.add("closed"); // the people handling it may also close a resolved ticket
  return [...out];
}

/** What the person must write when making this move: resolution notes, or why it is reopened. */
export function noteNeeded(to: Status): "resolution" | "reopen" | null {
  return to === "resolved" ? "resolution" : to === "reopened" ? "reopen" : null;
}

/** The board's columns. Resolved tickets wait for the requester's confirmation in the last column, with the closed ones. */
export type ColumnStatus = "open" | "assigned" | "in_progress" | "on_hold" | "pending_review" | "closed";

/** The board column a status sits in: a reopened ticket waits in Open, a resolved one in Closed. */
export function columnOf(s: Status): ColumnStatus {
  return s === "reopened" ? "open" : s === "resolved" ? "closed" : s;
}

/**
 * The statuses a ticket passes through to get from one status to another when the people handling it move it on the board, ending at
 * the target; null when there is no way (e.g. back to Open from In progress). The same steps are taken by the database
 * (ticket_next_hop in supabase/step47_ticket_board.sql), each one checked on its own.
 */
export function routeTo(current: Status, target: Status): Status[] | null {
  if (current === target) return [];
  if (nextStatuses(current, { raiser: false, staff: true, admin: false }).includes(target)) return [target];
  const early: Status[] = ["open", "assigned", "on_hold", "reopened"];
  if ((target === "pending_review" || target === "resolved") && early.includes(current)) return ["in_progress", target];
  if (target === "closed") {
    if (current === "in_progress" || current === "pending_review") return ["resolved", "closed"];
    if (early.includes(current)) return ["in_progress", "resolved", "closed"];
  }
  return null;
}

/**
 * The status a card gets when it is dropped on a column. Dropping on Closed resolves a ticket that is still being worked on (that
 * needs resolution notes), and closes one that is already resolved.
 */
export function targetStatus(current: Status, column: ColumnStatus): Status {
  return column === "closed" ? (current === "resolved" ? "closed" : "resolved") : column;
}

export const isFinal = (s: Status) => s === "closed";

/** Is the due date in the past while the ticket is still being worked on? */
export function isOverdue(dueOn: string | null, status: Status, today: string): boolean {
  return !!dueOn && dueOn < today && status !== "resolved" && status !== "closed";
}

export type Mention = { id: string; name: string };

/**
 * A comment is stored as plain text. A person tagged with @ is written as `@[Name](id)`, which the screen shows as "@Name" and
 * the server turns into a notification. This finds the ids.
 */
export function mentionIds(body: string): string[] {
  const out = new Set<string>();
  for (const m of body.matchAll(/@\[[^\]\n]{1,80}\]\(([0-9a-f-]{36})\)/gi)) out.add(m[1].toLowerCase());
  return [...out].slice(0, 10);
}

export type Piece = { kind: "text" | "bold" | "italic" | "mention" | "code"; text: string } | { kind: "link"; text: string; href: string };
export type Block =
  | { kind: "p"; pieces: Piece[] }
  | { kind: "h"; level: 1 | 2 | 3; pieces: Piece[] }
  | { kind: "quote"; pieces: Piece[] }
  | { kind: "ul"; items: Piece[][] }
  | { kind: "ol"; items: Piece[][] }
  | { kind: "tasks"; items: { done: boolean; pieces: Piece[] }[] };

/**
 * Inline formatting: **bold**, _italic_, `code`, [text](https://link) and @[Name](id) mentions. Nothing else is interpreted, so
 * nothing can inject markup, and a link is only made for an http or https address.
 */
export function inline(text: string): Piece[] {
  const pieces: Piece[] = [];
  const re = /\*\*([^*\n]+)\*\*|_([^_\n]+)_|`([^`\n]+)`|@\[([^\]\n]{1,80})\]\([0-9a-f-]{36}\)|\[([^\]\n]{1,120})\]\((https?:\/\/[^\s)]{1,300})\)/gi;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0;
    if (at > last) pieces.push({ kind: "text", text: text.slice(last, at) });
    if (m[1] !== undefined) pieces.push({ kind: "bold", text: m[1] });
    else if (m[2] !== undefined) pieces.push({ kind: "italic", text: m[2] });
    else if (m[3] !== undefined) pieces.push({ kind: "code", text: m[3] });
    else if (m[4] !== undefined) pieces.push({ kind: "mention", text: `@${m[4]}` });
    else pieces.push({ kind: "link", text: m[5], href: m[6] });
    last = at + m[0].length;
  }
  if (last < text.length) pieces.push({ kind: "text", text: text.slice(last) });
  return pieces;
}

/** Paragraphs, headings (# to ###), quotes (> ), lists ("- item", "1. item") and task lists ("- [ ] item") from the text a person typed. */
export function blocks(text: string): Block[] {
  const out: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ kind: "p", pieces: inline(para.join("\n")) });
    para = [];
  };
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    const heading = /^\s{0,3}(#{1,3})\s+(.*)$/.exec(line);
    const quote = /^\s{0,3}>\s?(.*)$/.exec(line);
    const task = /^\s*[-*•]\s+\[( |x|X)\]\s+(.*)$/.exec(line);
    const ul = /^\s*[-*•]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const last = out[out.length - 1];
    if (heading) {
      flush();
      out.push({ kind: "h", level: heading[1].length as 1 | 2 | 3, pieces: inline(heading[2]) });
    } else if (quote) {
      flush();
      if (last && last.kind === "quote") last.pieces = [...last.pieces, { kind: "text", text: "\n" }, ...inline(quote[1])];
      else out.push({ kind: "quote", pieces: inline(quote[1]) });
    } else if (task) {
      flush();
      const item = { done: task[1].toLowerCase() === "x", pieces: inline(task[2]) };
      if (last && last.kind === "tasks") last.items.push(item);
      else out.push({ kind: "tasks", items: [item] });
    } else if (ul || ol) {
      flush();
      const kind = ul ? "ul" : "ol";
      const body = (ul ?? ol)![1];
      if (last && last.kind === kind) last.items.push(inline(body));
      else out.push({ kind, items: [inline(body)] });
    } else if (line.trim() === "") flush();
    else para.push(line);
  }
  flush();
  return out;
}

// ---------- Files ----------
export const FILE_MAX_BYTES = 10 * 1024 * 1024;
export const FILES_PER_TICKET = 15;
export const FILE_TYPES_TEXT = "PDF, JPG, PNG, WebP, Word or Excel, up to 10 MB each";
export const FILE_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx,application/pdf,image/jpeg,image/png,image/webp";

export type FileKind = { mime: string; ext: string };

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** What the file really is, from its first bytes and (for Office files, which are zip files) its name. null if it isn't allowed. */
export function sniffFile(bytes: Uint8Array, name: string): FileKind | null {
  const at = (i: number) => bytes[i];
  if (bytes.length >= 5 && at(0) === 0x25 && at(1) === 0x50 && at(2) === 0x44 && at(3) === 0x46 && at(4) === 0x2d) return { mime: "application/pdf", ext: "pdf" };
  if (bytes.length >= 3 && at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (bytes.length >= 8 && at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47 && at(4) === 0x0d && at(5) === 0x0a && at(6) === 0x1a && at(7) === 0x0a) return { mime: "image/png", ext: "png" };
  if (bytes.length >= 12 && at(0) === 0x52 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x46 && at(8) === 0x57 && at(9) === 0x45 && at(10) === 0x42 && at(11) === 0x50) return { mime: "image/webp", ext: "webp" };
  const zip = bytes.length >= 4 && at(0) === 0x50 && at(1) === 0x4b && at(2) === 0x03 && at(3) === 0x04;
  if (zip && /\.docx$/i.test(name)) return { mime: DOCX, ext: "docx" };
  if (zip && /\.xlsx$/i.test(name)) return { mime: XLSX, ext: "xlsx" };
  return null;
}

export const isImage = (mime: string) => mime.startsWith("image/");

// ---------- What the screens show ----------
export type Person = { id: string; name: string };

export type TicketRow = {
  id: string;
  number: number;
  subject: string;
  status: Status;
  priority: Priority;
  department: string;
  category: string;
  raisedBy: string;
  assigneeId: string | null;
  dueOn: string | null;
  createdAt: string;
  updatedAt: string;
  comments: number;
  attachments: number;
};
