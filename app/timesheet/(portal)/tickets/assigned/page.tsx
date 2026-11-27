import TicketsPage from "../TicketsPage";

export const metadata = { title: "Assigned to me" };
export const dynamic = "force-dynamic";

export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <TicketsPage scope="assigned" searchParams={searchParams} />;
}
