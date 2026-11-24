import "../../../dashboard/dashboard.css";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { emptyLetter, type LetterData } from "@/lib/offers/types";
import { ENGAGEMENT_LABEL, getOffer, loadOfferSettings } from "@/lib/offers/server";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { formatInstantDate, todayInOffice } from "@/lib/timesheet/dates";
import { OfferEditor } from "../OfferEditor";

export const metadata = { title: "Offer letter (admin)" };
export const dynamic = "force-dynamic";

const STATUS = { draft: "Draft", sent: "Sent", accepted: "Accepted" } as const;

// One letter: the form with a live preview (read-only once it is sent), and every version of it.
export default async function OfferPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (me?.role !== "admin") redirect("/timesheet/dashboard");
  const { id } = await params;
  const found = await getOffer(id);
  if (!found) notFound();
  const settings = await loadOfferSettings();
  const { row } = found;
  // What was saved, over the defaults (an older letter may lack a newer detail).
  const initial: LetterData = { ...emptyLetter(todayInOffice()), ...found.data, phases: found.data.phases ?? [], salaryBreakup: found.data.salaryBreakup ?? [] };

  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <Link href="/timesheet/admin/offers" className="ts-link w-fit text-sm">
          ← All offer letters
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="ts-h1">{row.name}</h1>
          <Badge variant={row.status === "draft" ? "outline" : "default"}>{STATUS[row.status]}</Badge>
          <span className="text-sm text-muted-foreground">
            {ENGAGEMENT_LABEL[row.type]} · version {row.version}
          </span>
        </div>
        {row.status === "accepted" && (
          <p className="text-sm text-muted-foreground">
            Accepted {row.method === "typed" ? `by typing "${row.acceptedName}"` : "with a signed copy"}
            {row.acceptedOn ? ` on ${formatInstantDate(row.acceptedOn)}` : ""}.
            {row.signedDocumentId && (
              <>
                {" "}
                <a href={`/api/documents/${row.signedDocumentId}/download`} className="underline underline-offset-4">
                  Open the signed copy
                </a>
              </>
            )}
          </p>
        )}
      </div>

      <OfferEditor
        key={row.id}
        letter={{ id: row.id, userId: row.userId, status: row.status, version: row.version, isCurrent: row.isCurrent }}
        initial={initial}
        company={settings.company}
        clauses={settings.clauses}
        logoUrl="/api/offers/asset?kind=logo" signatureUrl="/api/offers/asset?kind=signature" sealUrl="/api/offers/asset?kind=seal"
      />

      {found.versions.length > 1 && (
        <section aria-labelledby="versions" className="grid gap-2 rounded-lg border p-4">
          <h2 id="versions" className="text-sm font-semibold">
            Version history
          </h2>
          <ol className="grid gap-1.5 text-sm">
            {found.versions.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="tabular-nums font-medium">v{v.version}</span>
                <Badge variant={v.status === "draft" ? "outline" : "default"}>{STATUS[v.status]}</Badge>
                <span className="text-muted-foreground">
                  {formatInstantDate(v.updatedAt)}
                  {v.isCurrent ? " · current" : ""}
                </span>
                {v.id !== row.id && (
                  <Link href={`/timesheet/admin/offers/${v.id}`} className="underline underline-offset-4">
                    Open
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
