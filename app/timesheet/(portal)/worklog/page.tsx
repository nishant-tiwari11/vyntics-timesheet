import { WorkLogScreen } from "./WorkLogScreen";

export const metadata = { title: "Work log" };

// The Timesheet: a Day or Week grid of hours by project, with the detailed entries list underneath (see WorkLogScreen).
export default function WorkLogPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <WorkLogScreen searchParams={searchParams} />;
}
