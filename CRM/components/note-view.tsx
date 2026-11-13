"use client";

/* A saved note as it is shown (D-067): the text with its bullets, numbers and checkboxes (a checkbox can be ticked right here), then
   the photos (click one to see it large) and the voice notes (with a player). */

import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { splitTags, type Person } from "@/convex/crm/lib/mentions";
import { parseNote } from "@/convex/crm/lib/noteText";
import { useWorkspace } from "@/lib/clients";
import { ImageViewer } from "./image-viewer";

export type NoteFile = { kind: "image" | "audio"; name: string; contentType: string; url: string };

/** A line of a note, with the people tagged in it (@Name) in colour. */
function Tagged({ text, people }: { text: string; people: readonly Person[] }) {
  if (!text.includes("@")) return <>{text}</>;
  return <>{splitTags(text, people).map((p, i) => (p.tag ? <span key={i} className="nv-tag">{p.text}</span> : <span key={i}>{p.text}</span>))}</>;
}

export function NoteBody({ text, files, canEdit, onToggle }: { text: string; files: NoteFile[]; canEdit: boolean; onToggle: (line: number) => void }) {
  const [viewing, setViewing] = useState<number | null>(null);
  const ws = useWorkspace();
  const team = useQuery(api.crm.pipeline.people, ws.state === "ready" ? { businessId: ws.business._id } : "skip") ?? [];
  const lines = parseNote(text);
  const photos = files.filter((f) => f.kind === "image");
  const voices = files.filter((f) => f.kind === "audio");
  return (
    <div className="nv">
      {text.trim() !== "" && (
        <div className="nv-text">
          {lines.map((l, i) => {
            if (l.kind === "check") {
              return (
                <label key={i} className={`nv-line nv-check${l.done ? " done" : ""}`}>
                  <input type="checkbox" checked={l.done} disabled={!canEdit} onChange={() => onToggle(i)} />
                  <span><Tagged text={l.text} people={team} /></span>
                </label>
              );
            }
            if (l.kind === "bullet") return <div key={i} className="nv-line nv-bullet"><span aria-hidden="true">•</span><span><Tagged text={l.text} people={team} /></span></div>;
            if (l.kind === "number") return <div key={i} className="nv-line nv-bullet"><span aria-hidden="true">{l.n}.</span><span><Tagged text={l.text} people={team} /></span></div>;
            return <div key={i} className="nv-line">{l.text === "" ? <br /> : <Tagged text={l.text} people={team} />}</div>;
          })}
        </div>
      )}
      {photos.length > 0 && (
        <div className="nv-photos">
          {photos.map((p, i) => (
            <button key={p.url} type="button" className="nv-photo" aria-label={`Open ${p.name}`} onClick={() => setViewing(i)}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a stored file served by Convex */}
              <img src={p.url} alt={p.name} loading="lazy" />
            </button>
          ))}
        </div>
      )}
      {voices.map((v) => (
        <div key={v.url} className="nv-voice">
          <small>{v.name}</small>
          <audio controls preload="none" src={v.url} aria-label={v.name} />
        </div>
      ))}
      {viewing !== null && <ImageViewer images={photos.map((p) => ({ url: p.url, caption: p.name }))} start={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
