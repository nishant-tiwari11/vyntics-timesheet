"use server";

import { revalidatePath } from "next/cache";
import { projectNamesAction } from "../worklog/actions";
import type { BoardCard } from "@/lib/tickets/board";
import { TimesheetError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";
import {
  addComment,
  addSubtask,
  assignTicket,
  createTicket,
  deleteSubtask,
  getTicket,
  listBoard,
  listCategories,
  moveTicket,
  myRecentLogs,
  setFollowing,
  setStatus,
  setSubtask,
  ticketPeople,
  updateTicket,
  type Category,
  type Changes,
  type MyLog,
  type NewTicket,
  type TicketDetail,
} from "@/lib/tickets/server";

// What the ticket screens ask the server to do. The person is taken from the session inside lib/tickets/server.ts, and the database
// decides what they may see or change; nothing here trusts what the browser says about who it is.

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  if (e instanceof TimesheetError) return { ok: false, error: e.message };
  logError("tickets", e);
  return { ok: false, error: "Something went wrong. Please try again." };
}

const refresh = () => revalidatePath("/timesheet/tickets", "layout");

export async function raiseFormDataAction(): Promise<Result<{ categories: Category[]; projects: string[]; logs: MyLog[] }>> {
  try {
    const [categories, projects, logs] = await Promise.all([listCategories(), projectNamesAction(), myRecentLogs().catch(() => [] as MyLog[])]);
    return { ok: true, categories, projects: projects.ok ? projects.projects : [], logs };
  } catch (e) {
    return fail(e);
  }
}

export async function createTicketAction(input: NewTicket): Promise<Result<{ id: string; number: number }>> {
  try {
    const made = await createTicket(input);
    refresh();
    return { ok: true, ...made };
  } catch (e) {
    return fail(e);
  }
}

export async function ticketDetailAction(id: string): Promise<Result<{ ticket: TicketDetail | null }>> {
  try {
    return { ok: true, ticket: await getTicket(id) };
  } catch (e) {
    return fail(e);
  }
}

export async function ticketPeopleAction(id: string): Promise<Result<{ people: { id: string; name: string; canHandle: boolean }[] }>> {
  try {
    return { ok: true, people: await ticketPeople(id) };
  } catch (e) {
    return fail(e);
  }
}

async function run(work: () => Promise<void>): Promise<Result> {
  try {
    await work();
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setStatusAction(id: string, to: string, note?: string): Promise<Result> {
  return run(() => setStatus(id, to, note));
}
export async function assignAction(id: string, assignee: string | null): Promise<Result> {
  return run(() => assignTicket(id, assignee));
}
export async function updateTicketAction(id: string, changes: Changes): Promise<Result> {
  return run(() => updateTicket(id, changes));
}
export async function addCommentAction(id: string, body: string, internal: boolean): Promise<Result> {
  return run(() => addComment(id, body, internal));
}
export async function followAction(id: string, userId: string, on: boolean): Promise<Result> {
  return run(() => setFollowing(id, userId, on));
}
export async function addSubtaskAction(id: string, title: string): Promise<Result> {
  return run(() => addSubtask(id, title));
}
export async function setSubtaskAction(subId: string, done: boolean): Promise<Result> {
  return run(() => setSubtask(subId, done));
}
export async function deleteSubtaskAction(subId: string): Promise<Result> {
  return run(() => deleteSubtask(subId));
}

export async function boardAction(project: string): Promise<Result<{ cards: BoardCard[] }>> {
  try {
    return { ok: true, cards: await listBoard(project) };
  } catch (e) {
    return fail(e);
  }
}
export async function moveTicketAction(id: string, to: string | null, note: string | null, position: number): Promise<Result> {
  return run(() => moveTicket(id, to, note, position));
}
