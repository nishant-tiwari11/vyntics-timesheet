import TicketsPage from "./TicketsPage";

export const metadata = { title: "My tickets" };
export const dynamic = "force-dynamic";

export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <TicketsPage scope="mine" searchParams={searchParams} />;
}
