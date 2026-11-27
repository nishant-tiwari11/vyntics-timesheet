import TicketsPage from "../TicketsPage";

export const metadata = { title: "All tickets" };
export const dynamic = "force-dynamic";

export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <TicketsPage scope="all" searchParams={searchParams} />;
}
