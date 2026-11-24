"use client";

import type { LetterBlock, LetterDoc } from "@/lib/offers/types";

// The letter drawn on screen from the same structure the PDF is drawn from, so what you read here is what the PDF says.
// Black text on white with the purple section headings of the printed letter. A picture that is not uploaded just stays hidden.
const hide = (e: React.SyntheticEvent<HTMLImageElement>) => {
  e.currentTarget.style.display = "none";
};

const PURPLE = "#6b58a8";
const LAVENDER = "#f3f0fa";

function Table({ b }: { b: Extract<LetterBlock, { t: "table" }> }) {
  const cols = b.widths.map((w) => `${w}fr`).join(" ");
  return (
    <div className="my-3 overflow-hidden border text-[13px]" style={{ borderColor: "#d9d9e3" }} role="table">
      {b.header && (
        <div className="grid" style={{ gridTemplateColumns: cols, background: PURPLE, color: "#fff" }} role="row">
          {b.header.map((h, i) => (
            <div key={i} role="columnheader" className={`p-2 font-bold ${b.align?.[i] === "right" ? "text-right" : ""}`}>
              {h}
            </div>
          ))}
        </div>
      )}
      {b.rows.map((row, r) => (
        <div key={r} className="grid border-t" style={{ gridTemplateColumns: cols, borderColor: "#d9d9e3" }} role="row">
          {row.map((cell, i) => (
            <div
              key={i}
              role={i === 0 ? "rowheader" : "cell"}
              className={`break-words p-2 ${i === 0 ? "font-bold" : ""} ${b.boldLastRow && r === b.rows.length - 1 ? "font-bold" : ""} ${b.align?.[i] === "right" ? "text-right" : ""}`}
              style={i === 0 ? { background: LAVENDER } : undefined}
            >
              {cell}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export type LetterPictures = { logo?: string; signature?: string; seal?: string };

export function LetterPreview({ letter, logoUrl, signatureUrl, sealUrl }: { letter: LetterDoc; logoUrl?: string; signatureUrl?: string; sealUrl?: string }) {
  return (
    <article aria-label="Offer letter preview" className="mx-auto w-full max-w-[794px] bg-white p-6 text-[13px] leading-relaxed text-[#1f2937] shadow-sm ring-1 ring-black/10 sm:p-10">
      <header className="flex items-center justify-between gap-3 border-b-2 pb-3" style={{ borderColor: PURPLE }}>
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="size-14 object-contain" onError={hide} />
        ) : (
          <span className="size-14" aria-hidden="true" />
        )}
        <div className="text-right">
          <p className="text-base font-bold" style={{ color: PURPLE }}>
            {letter.company.toUpperCase()}
          </p>
          {letter.gstin && <p className="text-[10px] text-neutral-500">GSTIN {letter.gstin}</p>}
        </div>
      </header>

      <h1 className="mt-5 text-center text-xl font-bold">{letter.title}</h1>
      <p className="mt-1 text-center text-[11px] font-bold tracking-wide text-neutral-500">{letter.subtitle}</p>

      <div className="mt-5 flex justify-between gap-4">
        <div className="min-w-0 break-words">
          {letter.party.map((l, i) => (
            <p key={i}>{l}</p>
          ))}
        </div>
        <p className="shrink-0">Date: {letter.date}</p>
      </div>
      <p className="mt-4 font-bold">Subject: {letter.subject}</p>
      <p className="mt-3">{letter.salutation}</p>

      {letter.blocks.map((b, i) => {
        if (b.t === "para") return <p key={i} className="mt-3 text-justify">{b.text}</p>;
        if (b.t === "heading")
          return (
            <h2 key={i} className="mt-6 text-[15px] font-bold" style={{ color: PURPLE }}>
              {b.text}
            </h2>
          );
        if (b.t === "clause")
          return (
            <div key={i} className="mt-3 grid gap-2 text-justify">
              {b.paras.map((p, k) => (
                <p key={k}>
                  {k === 0 && (
                    <strong>
                      {b.n}. {b.title} -{" "}
                    </strong>
                  )}
                  {p}
                </p>
              ))}
            </div>
          );
        if (b.t === "table") return <Table key={i} b={b} />;
        if (b.t === "annexureTitle")
          return (
            <h2 key={i} className="mt-8 text-center text-lg font-bold" style={{ color: PURPLE }}>
              {b.text}
            </h2>
          );
        if (b.t === "note") return <p key={i} className="mt-4 text-center text-[11px] text-neutral-500">{b.text}</p>;
        if (b.t === "acceptance")
          return (
            <div key={i} className="my-4 grid grid-cols-2 overflow-hidden border text-[13px]" style={{ borderColor: "#d9d9e3" }}>
              <div className="p-2 font-bold text-white" style={{ background: PURPLE }}>For {b.company}</div>
              <div className="p-2 font-bold text-white" style={{ background: PURPLE }}>Accepted by Candidate</div>
              <div className="grid gap-1 p-3" style={{ background: LAVENDER }}>
                <p className="font-bold">Name: {b.signatoryName}</p>
                {b.signatoryTitle && <p className="font-bold">Designation: {b.signatoryTitle}</p>}
                <div className="flex items-center gap-3">
                  <p className="font-bold">Signature:</p>
                  {signatureUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={signatureUrl} alt="" className="h-10 max-w-[9rem] object-contain" onError={hide} />
                  )}
                  {sealUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={sealUrl} alt="" className="ml-auto size-14 object-contain" onError={hide} />
                  )}
                </div>
                <p className="font-bold">Date: {b.letterDate}</p>
              </div>
              <div className="grid gap-1 p-3" style={{ background: LAVENDER }}>
                <p>Name: {b.candidateName}</p>
                <p>
                  Signature: {b.typed && <strong className="italic">{b.typed.name}</strong>}
                </p>
                <p>
                  Date: {b.typed && <strong>{b.typed.date}</strong>}
                </p>
              </div>
            </div>
          );
        return null;
      })}

      <footer className="mt-8 border-t pt-2 text-center text-[10px] text-neutral-500">
        {[letter.company.toUpperCase(), letter.gstin && `GSTIN ${letter.gstin}`, letter.city].filter(Boolean).join(" | ")}
      </footer>
    </article>
  );
}
