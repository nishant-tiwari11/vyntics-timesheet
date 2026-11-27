import TicketsPage from "../TicketsPage";

export const metadata = { title: "Raise ticket" };
export const dynamic = "force-dynamic";

// "Raise Ticket" in the menu: your tickets, with the drawer for a new one already open.
export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <TicketsPage scope="mine" searchParams={searchParams} raise />;
}
