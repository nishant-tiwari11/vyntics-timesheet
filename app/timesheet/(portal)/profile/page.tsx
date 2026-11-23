import "../dashboard/dashboard.css";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ROLE_LABEL, toRole } from "@/lib/access/config";
import { AVATAR_BUCKET, avatarPath, isUuid } from "@/lib/avatar";
import { emptyAnswers } from "@/lib/onboarding/rules";
import { requiredChecklist } from "@/lib/documents/config";
import { listDocuments, type DocumentList } from "@/lib/documents/server";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { createClient } from "@/lib/supabase/server";
import { formatInstantDate, todayInOffice } from "@/lib/timesheet/dates";
import { logError } from "@/lib/timesheet/log";
import { displayName } from "@/lib/timesheet/people";
import { UserAvatar } from "../../_components/UserAvatar";
import { AvatarUploader } from "./AvatarUploader";
import { ChatReminderToggle } from "./ChatReminderToggle";
import { loadMyOnboarding } from "@/lib/onboarding/server";
import { DocumentsWorkspace } from "./documents/DocumentsWorkspace";
import { MyDocuments } from "./MyDocuments";

export const metadata = { title: "Profile" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// Your profile, in two tabs: Overview and Documents. An admin can open anyone's with ?user=<id> to change their photo
// and manage their documents.
export default async function ProfilePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [me, raw] = await Promise.all([getCurrentUser(), searchParams]);
  if (!me) notFound();

  const asked = one(raw.user);
  const targetId = me.role === "admin" && isUuid(asked) ? asked : me.id;
  const own = targetId === me.id;
  // Documents are for HR to manage (Admin > Documents). An employee's own profile has no Documents tab: they hand those in once,
  // during onboarding.
  const ownDocs = own && (me.role === "employee" || me.role === "manager");
  const tab = (!own || ownDocs) && one(raw.tab) === "documents" ? "documents" : "overview";

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, created_at, manager_id")
    .eq("id", targetId)
    .maybeSingle();
  if (!profile) notFound();

  // Your Chat reminder switch. Before step 33 has been run the column is not there, so the switch is left out.
  const chatRow = own && me.role !== "viewer" ? await supabase.from("profiles").select("chat_reminders" as never).eq("id", targetId).maybeSingle() : null;
  const chatOn = chatRow && !chatRow.error && chatRow.data ? (chatRow.data as unknown as { chat_reminders: boolean }).chat_reminders !== false : null;

  const [manager, photo, docs] = await Promise.all([
    profile.manager_id ? supabase.from("profiles").select("full_name, email").eq("id", profile.manager_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.storage.from(AVATAR_BUCKET).list("", { limit: 1, search: avatarPath(profile.id) }),
    listDocuments(profile.id).catch((e): DocumentList => {
      logError("profile documents", e);
      return { ready: false };
    }),
  ]);
  const name = displayName(profile);
  const hasPhoto = (photo.data ?? []).some((f) => f.name === avatarPath(profile.id));
  const isAdmin = me.role === "admin";
  const canChangePhoto = isAdmin || (own && me.role !== "viewer");
  
  const checklist = requiredChecklist(docs.ready ? docs.current.map((d) => ({ category: d.category, status: d.status })) : []);

  const base = own ? "/timesheet/profile" : `/timesheet/profile?user=${profile.id}`;
  const tabHref = (t: string) => (t === "overview" ? base : `${base}${base.includes("?") ? "&" : "?"}tab=${t}`);

  const details: [string, string][] = [
    ["Email", profile.email],
    ["Role", ROLE_LABEL[toRole(profile.role) ?? "employee"]],
    ["Reports to", manager.data ? displayName(manager.data) : "Not set"],
    ["Joined", formatInstantDate(profile.created_at)],
  ];

  return (
    <div className="ts-page ts-dash grid max-w-4xl gap-5">
      {!own && (
        <Link href="/timesheet/admin/access" className="ts-link text-sm">
          ← Back to employees
        </Link>
      )}

      <header className="grid gap-4 rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-center gap-5">
          {canChangePhoto ? <AvatarUploader userId={profile.id} name={name} hasPhoto={hasPhoto} /> : <UserAvatar userId={profile.id} name={name} className="size-24 text-2xl" />}
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight break-words">{name}</h1>
            <p className="text-sm break-all text-muted-foreground">{profile.email}</p>
            <p className="mt-1 text-sm">{own ? "Your profile" : "Viewing as admin"}</p>
          </div>
        </div>
      </header>

      {(!own || ownDocs) && (
      <nav aria-label="Profile sections" className="flex gap-1 border-b">
        {[
          { id: "overview", label: "Overview" },
          { id: "documents", label: "Documents" },
        ].map((t) => (
          <Link
            key={t.id}
            href={tabHref(t.id)}
            aria-current={tab === t.id ? "page" : undefined}
            className={`-mb-px inline-flex min-h-10 items-center border-b-2 px-4 text-sm font-medium max-md:min-h-11 ${tab === t.id ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      )}

      {tab === "overview" ? (
        <section aria-labelledby="details-title" className="rounded-xl border bg-card p-5">
          <h2 id="details-title" className="mb-3 text-base font-semibold">
            Details
          </h2>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {details.map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="text-sm font-medium break-words">{value}</dd>
              </div>
            ))}
          </dl>
          {chatOn !== null && (
            <div className="mt-5 border-t pt-4">
              <ChatReminderToggle initial={chatOn} />
            </div>
          )}
        </section>
      ) : ownDocs ? (
        <MyDocuments docs={docs.ready ? docs.current : []} answers={(await loadMyOnboarding().catch(() => null))?.answers ?? emptyAnswers()} />
      ) : !docs.ready ? (
        <p role="note" className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          Documents aren&apos;t set up yet. An admin needs to run <code>supabase/step26_documents.sql</code> in Supabase.{docs.code && <span className="mt-1 block text-xs">Database error code: {docs.code}</span>}
        </p>
      ) : (
        <DocumentsWorkspace
          userId={profile.id}
          docs={docs.current}
          versions={docs.versions}
          checklist={checklist}
          today={todayInOffice()}
          isAdmin={isAdmin}
          canEdit={false}
        />
      )}
    </div>
  );
}
