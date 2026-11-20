import { redirect } from "next/navigation";

// Events now live on the Calendar page (company events, meetings and your own, with Add event). Old links and bookmarks
// to /timesheet/events land there.
export default function EventsPage() {
  redirect("/timesheet/calendar");
}
