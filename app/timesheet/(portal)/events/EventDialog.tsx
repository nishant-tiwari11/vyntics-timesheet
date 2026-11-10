"use client";

import { ExternalLink, MapPin } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { formatYmd } from "@/lib/timesheet/dates";
import {
  CALENDARS,
  EVENT_COLORS,
  calendarLabel,
  type EventColor,
  type EventInput,
  type EventItem,
  type StoredCalendar,
} from "@/lib/timesheet/eventTypes";
import { cn } from "@/lib/utils";
import { createEventAction, deleteEventAction, updateEventAction } from "./actions";
import { COLOR_CLASS, clock } from "./eventStyles";

export type DialogState =
  | { mode: "create"; date: string; startTime?: string }
  | { mode: "view"; event: EventItem }
  | { mode: "edit"; event: EventItem };

type Errors = Partial<Record<"title" | "startDate" | "endDate" | "startTime" | "endTime" | "link", string>>;

const plusHour = (t: string) => `${String(Math.min(23, Number(t.slice(0, 2)) + 1)).padStart(2, "0")}:${t.slice(3, 5)}`;

export default function EventDialog({
  state,
  onClose,
  isAdmin,
  myId,
  onEdit,
}: {
  state: DialogState | null;
  onClose: () => void;
  isAdmin: boolean;
  myId: string;
  onEdit: (e: EventItem) => void;
}) {
  if (!state) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {state.mode === "view" ? (
          <Details event={state.event} isAdmin={isAdmin} myId={myId} onClose={onClose} onEdit={onEdit} />
        ) : (
          <EventForm key={state.mode === "edit" ? state.event.id : `new-${state.date}-${state.startTime ?? ""}`} state={state} isAdmin={isAdmin} onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------- Details ----------------------------

export function canEdit(e: EventItem, isAdmin: boolean, myId: string): boolean {
  if (e.derived) return false;
  return e.calendar === "personal" ? e.ownerId === myId : isAdmin;
}

function Details({
  event: e,
  isAdmin,
  myId,
  onClose,
  onEdit,
}: {
  event: EventItem;
  isAdmin: boolean;
  myId: string;
  onClose: () => void;
  onEdit: (e: EventItem) => void;
}) {
  const range =
    e.start === e.end
      ? formatYmd(e.start, { weekday: "long", day: "numeric", month: "long", year: "numeric" })
      : `${formatYmd(e.start, { day: "numeric", month: "short" })} – ${formatYmd(e.end, { day: "numeric", month: "short", year: "numeric" })}`;
  return (
    <>
      <DialogHeader>
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className={cn("mt-1.5 size-3 shrink-0 rounded-sm border", COLOR_CLASS[e.color])} />
          <div className="min-w-0">
            <DialogTitle className="break-words text-lg">{e.title}</DialogTitle>
            <DialogDescription>{calendarLabel(e.calendar)}</DialogDescription>
          </div>
        </div>
      </DialogHeader>
      <dl className="grid gap-3 text-sm">
        <div>
          <dt className="text-muted-foreground">When</dt>
          <dd>
            {range}
            {e.allDay ? " · All day" : ` · ${clock(e.startTime)} – ${clock(e.endTime)}`}
          </dd>
        </div>
        {e.location && (
          <div>
            <dt className="text-muted-foreground">Location</dt>
            <dd className="flex items-center gap-1.5">
              <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              {e.location}
            </dd>
          </div>
        )}
        {e.link && (
          <div>
            <dt className="text-muted-foreground">Meeting link</dt>
            <dd>
              <a href={e.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 underline underline-offset-4">
                Join meeting <ExternalLink className="size-3.5" aria-hidden="true" />
              </a>
            </dd>
          </div>
        )}
        {e.description && (
          <div>
            <dt className="text-muted-foreground">Description</dt>
            <dd className="whitespace-pre-wrap break-words">{e.description}</dd>
          </div>
        )}
        {isAdmin && e.ownerName && !e.derived && e.calendar !== "personal" && (
          <div>
            <dt className="text-muted-foreground">Created by</dt>
            <dd>{e.ownerName}</dd>
          </div>
        )}
      </dl>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Close
        </Button>
        {canEdit(e, isAdmin, myId) && (
          <Button type="button" onClick={() => onEdit(e)}>
            Edit
          </Button>
        )}
      </DialogFooter>
    </>
  );
}

// ---------------------------- Create and edit ----------------------------

function EventForm({
  state,
  isAdmin,
  onClose,
}: {
  state: Extract<DialogState, { mode: "create" | "edit" }>;
  isAdmin: boolean;
  onClose: () => void;
}) {
  const editing = state.mode === "edit" ? state.event : null;
  const initialDate = state.mode === "create" ? state.date : state.event.start;
  const timed = state.mode === "create" ? !!state.startTime : !!editing && !editing.allDay;

  const [title, setTitle] = useState(editing?.title ?? "");
  const [calendar, setCalendar] = useState<StoredCalendar>((editing?.calendar as StoredCalendar) ?? "personal");
  const [color, setColor] = useState<EventColor>(editing?.color ?? "black");
  const [allDay, setAllDay] = useState(!timed);
  const [startDate, setStartDate] = useState(initialDate);
  const [endDate, setEndDate] = useState(editing?.end ?? initialDate);
  const [startTime, setStartTime] = useState(editing?.startTime || (state.mode === "create" && state.startTime) || "09:00");
  const [endTime, setEndTime] = useState(editing?.endTime || (state.mode === "create" && state.startTime ? plusHour(state.startTime) : "10:00"));
  const [location, setLocation] = useState(editing?.location ?? "");
  const [link, setLink] = useState(editing?.link ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [pending, startTransition] = useTransition();

  const choices = CALENDARS.filter((c) => c.edit === "owner" || (c.edit === "admin" && isAdmin));

  function validate(): Errors {
    const found: Errors = {};
    if (!title.trim()) found.title = "Give the event a title.";
    if (!startDate) found.startDate = "Choose a start date.";
    if (!endDate) found.endDate = "Choose an end date.";
    else if (startDate && endDate < startDate) found.endDate = "The end can't be before the start.";
    if (!allDay) {
      if (!startTime) found.startTime = "Enter a start time.";
      if (!endTime) found.endTime = "Enter an end time.";
      else if (startTime && startDate === endDate && endTime <= startTime) found.endTime = "The end time must be after the start time.";
    }
    if (link.trim() && !/^https?:\/\//i.test(link.trim())) found.link = "The link must start with http:// or https://.";
    return found;
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const input: EventInput = { calendar, title, description, location, link, color, allDay, startDate, endDate, startTime, endTime };
    startTransition(async () => {
      const res = editing ? await updateEventAction(editing.id, input) : await createEventAction(input);
      if (!res.ok) {
        setFormError(res.error);
        toast.error(res.error);
        return;
      }
      toast.success(editing ? "Event saved." : "Event created.");
      onClose();
    });
  }

  function remove() {
    if (!editing) return;
    startTransition(async () => {
      const res = await deleteEventAction(editing.id);
      if (!res.ok) {
        setFormError(res.error);
        toast.error(res.error);
        setAsking(false);
        return;
      }
      toast.success("Event deleted.");
      onClose();
    });
  }

  const err = (k: keyof Errors) =>
    errors[k] ? (
      <p id={`ev-${k}-error`} role="alert" className="text-sm font-medium text-destructive">
        {errors[k]}
      </p>
    ) : null;

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{editing ? "Edit event" : "New event"}</DialogTitle>
        <DialogDescription>
          {editing ? "Change the details, then save." : `Add an event on ${formatYmd(initialDate, { day: "numeric", month: "long" })}.`}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-1.5">
        <Label htmlFor="ev-title">
          Title <span aria-hidden="true" className="text-destructive">*</span>
        </Label>
        <Input
          id="ev-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          autoFocus
          aria-invalid={!!errors.title}
          aria-describedby={errors.title ? "ev-title-error" : undefined}
          placeholder="Add a title"
          disabled={pending}
        />
        {err("title")}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="ev-calendar">Calendar</Label>
        <Select
          value={calendar}
          onValueChange={(v) => {
            setCalendar(v as StoredCalendar);
            const info = CALENDARS.find((c) => c.id === v);
            if (info && !editing) setColor(info.color);
          }}
          disabled={pending || (!!editing && !isAdmin)}
        >
          <SelectTrigger id="ev-calendar" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {choices.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <Switch id="ev-allday" checked={allDay} onCheckedChange={setAllDay} disabled={pending} />
        <Label htmlFor="ev-allday">All day</Label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="ev-start">Starts</Label>
          <Input
            id="ev-start"
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              if (e.target.value > endDate) setEndDate(e.target.value);
            }}
            aria-invalid={!!errors.startDate}
            aria-describedby={errors.startDate ? "ev-startDate-error" : undefined}
            disabled={pending}
          />
          {err("startDate")}
        </div>
        {!allDay && (
          <div className="grid gap-1.5">
            <Label htmlFor="ev-start-time">Start time</Label>
            <Input
              id="ev-start-time"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              aria-invalid={!!errors.startTime}
              aria-describedby={errors.startTime ? "ev-startTime-error" : undefined}
              disabled={pending}
            />
            {err("startTime")}
          </div>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="ev-end">Ends</Label>
          <Input
            id="ev-end"
            type="date"
            value={endDate}
            min={startDate}
            onChange={(e) => setEndDate(e.target.value)}
            aria-invalid={!!errors.endDate}
            aria-describedby={errors.endDate ? "ev-endDate-error" : undefined}
            disabled={pending}
          />
          {err("endDate")}
        </div>
        {!allDay && (
          <div className="grid gap-1.5">
            <Label htmlFor="ev-end-time">End time</Label>
            <Input
              id="ev-end-time"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              aria-invalid={!!errors.endTime}
              aria-describedby={errors.endTime ? "ev-endTime-error" : undefined}
              disabled={pending}
            />
            {err("endTime")}
          </div>
        )}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="ev-location">Location</Label>
        <Input id="ev-location" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={200} placeholder="Add a place" disabled={pending} />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="ev-link">Meeting link</Label>
        <Input
          id="ev-link"
          type="url"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          maxLength={500}
          placeholder="https://meet.google.com/..."
          aria-invalid={!!errors.link}
          aria-describedby={errors.link ? "ev-link-error" : undefined}
          disabled={pending}
        />
        {err("link")}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="ev-description">Description</Label>
        <Textarea id="ev-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={2000} placeholder="Add details" disabled={pending} />
      </div>

      <fieldset className="grid gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">Colour</legend>
        <div role="radiogroup" aria-label="Event colour" className="flex flex-wrap gap-2">
          {EVENT_COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={color === c.id}
              aria-label={c.label}
              title={c.label}
              onClick={() => setColor(c.id)}
              disabled={pending}
              className={cn(
                "size-9 rounded-full border-2 transition-shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                COLOR_CLASS[c.id],
                color === c.id ? "ring-2 ring-ring ring-offset-2 ring-offset-background" : ""
              )}
            />
          ))}
        </div>
      </fieldset>

      {formError && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {formError}
        </p>
      )}

      <DialogFooter className="gap-2 sm:justify-between">
        {editing ? (
          asking ? (
            <span className="flex items-center gap-2" role="group" aria-label="Confirm delete">
              <Button type="button" variant="destructive" onClick={remove} disabled={pending}>
                {pending ? "Deleting..." : "Yes, delete"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setAsking(false)} disabled={pending}>
                Keep
              </Button>
            </span>
          ) : (
            <Button type="button" variant="ghost" onClick={() => setAsking(true)} disabled={pending}>
              Delete
            </Button>
          )
        ) : (
          <span />
        )}
        <span className="flex gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving..." : editing ? "Save changes" : "Create event"}
          </Button>
        </span>
      </DialogFooter>
    </form>
  );
}
