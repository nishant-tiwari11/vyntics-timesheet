import { NextResponse, type NextRequest } from "next/server";
import { DOC_BUCKET, KIND_MIME } from "@/lib/documents/config";
import { fillDocx } from "@/lib/documents/docxTemplate";
import { readSigningImage } from "@/lib/documents/signingAssets";
import { checkOffer, checkTemplate, placeholderValues } from "@/lib/documents/offerLetter";
import { loadOfferTemplate, readTemplateFile } from "@/lib/documents/offerTemplate";
import { buildOfferPdf } from "@/lib/documents/offerPdf";
import { isUuid } from "@/lib/avatar";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { createClient } from "@/lib/supabase/server";
import { logError } from "@/lib/timesheet/log";

// POST /api/documents/offer-letter   { userId, fields, template?: string, save?: boolean, visibility?: "employee" | "hr_only",
//                                      signature?: boolean, seal?: boolean }
// Admins only. Makes the offer letter from the saved template plus the details given:
//   * if an admin uploaded their own Word template, that file is filled in and the letter is a .docx (formatting kept);
//   * otherwise the wording (the one sent with the request, so what is on screen is what you get, or else the saved one)
//     is typeset as a PDF.
// `signature` / `seal` add the uploaded pictures (when they exist). Without `save` the file comes back as a download. With `save` it is stored on the employee's profile as an "Offer Letter"
// document, the same way an upload is (private bucket, audit entry), and the new document's id comes back.
const HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const fail = (error: string, status: number) => NextResponse.json({ ok: false, error }, { status, headers: HEADERS });

export async function POST(request: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return fail("Please sign in again.", 401);
  if (me.role !== "admin") return fail("Only admins can do that.", 403);

  const body = (await request.json().catch(() => null)) as { userId?: unknown; fields?: unknown; template?: unknown; save?: unknown; visibility?: unknown; signature?: unknown; seal?: unknown } | null;
  if (!body || typeof body.fields !== "object" || body.fields === null) return fail("Fill in the letter details first.", 400);
  const checked = checkOffer(body.fields as Record<string, unknown>);
  if (!checked.ok) return fail(checked.error, 400);

  const saved = await loadOfferTemplate();
  let wording = saved.body;
  if (saved.kind !== "docx" && typeof body.template === "string") {
    const t = checkTemplate(body.template);
    if (!t.ok) return fail(t.error, 400);
    wording = t.data;
  }

  try {
    let file: Uint8Array;
    let mime: string;
    let ext: "pdf" | "docx";
    const signature = body.signature === true ? await readSigningImage("signature") : null;
    const seal = body.seal === true ? await readSigningImage("seal") : null;
    if (saved.kind === "docx") {
      const template = await readTemplateFile(saved.fileKey);
      if (!template) return fail("Couldn't read the uploaded Word template. Upload it again.", 500);
      file = await fillDocx(template, placeholderValues(checked.data), { ...(signature ? { signature } : {}), ...(seal ? { seal } : {}) });
      mime = KIND_MIME.docx;
      ext = "docx";
    } else {
      file = await buildOfferPdf(checked.data, wording, { ...(signature ? { signature } : {}), ...(seal ? { seal } : {}) });
      mime = KIND_MIME.pdf;
      ext = "pdf";
    }
    const safeName = checked.data.name.replace(/[^\w .()-]+/g, "_").trim().slice(0, 60) || "Employee";
    const fileName = `Offer Letter - ${safeName}.${ext}`;

    if (body.save !== true) {
      return new NextResponse(Buffer.from(file), {
        headers: {
          ...HEADERS,
          "Content-Type": mime,
          "Content-Length": String(file.byteLength),
          "Content-Disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        },
      });
    }

    if (!isUuid(body.userId)) return fail("Choose the employee to save it for.", 400);
    const visibility = body.visibility === "hr_only" ? "hr_only" : "employee";
    const supabase = await createClient();
    const key = `${body.userId}/${crypto.randomUUID()}`;
    const up = await supabase.storage.from(DOC_BUCKET).upload(key, file, { contentType: mime, upsert: false });
    if (up.error) {
      logError("offer letter upload", up.error);
      return fail("Couldn't store the letter. Please try again.", 500);
    }
    const { data, error } = await supabase.rpc("doc_create" as never, {
      p_user: body.userId,
      p_category: "offer_letter",
      p_name: "Offer Letter",
      p_filename: fileName,
      p_key: key,
      p_mime: mime,
      p_size: file.byteLength,
      p_issue: checked.data.issueDate,
      p_expiry: null,
      p_notes: `Joining date ${checked.data.joiningDate}`,
      p_visibility: visibility,
      p_replace: null,
    } as never);
    if (error) {
      await supabase.storage.from(DOC_BUCKET).remove([key]);
      logError("offer letter create", error);
      return fail(error.code === "P0001" ? error.message : "Couldn't save the letter. Please try again.", 400);
    }
    return NextResponse.json({ ok: true, id: data }, { headers: HEADERS });
  } catch (e) {
    logError("offer letter", e);
    return fail("Something went wrong. Please try again.", 500);
  }
}
