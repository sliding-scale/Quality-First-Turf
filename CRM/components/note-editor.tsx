"use client";

/* The box every note is written in (D-067): a bigger text area with an Evernote-style bar for a checkbox list, bullets and numbers,
   a camera/photo button, dictation (speech to text) and a voice note (an audio recording). Photos and recordings wait on the screen
   until Save, then `uploadPending` sends them to storage and the note is saved with their ids, so cancelling leaves nothing behind.
   Dictation uses the browser's own speech recognition (Chrome, Edge, Safari); where it is missing the button says so. */

import { useMutation } from "convex/react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { api } from "@/convex/_generated/api";
import { continueList, parseLine, toggleList, type ListKind } from "@/convex/crm/lib/noteText";
import { Icon } from "./icon";
import { useUI } from "./ui-provider";

export type PendingFile = { id: string; kind: "image" | "audio"; blob: Blob; name: string; url: string };

const MAX_RECORDING_SECONDS = 300;
const MAX_FILES = 10;

type SpeechCtor = new () => {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void; stop: () => void;
};
const speechApi = (): SpeechCtor | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

/** Sends the waiting photos and recordings to storage and returns what the note mutations take. */
export function useUploadPending() {
  const makeUrl = useMutation(api.crm.noteFiles.generateUploadUrl);
  return async (files: PendingFile[]) => {
    const out: { storageId: never; name: string }[] = [];
    for (const f of files) {
      const url = await makeUrl({});
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": f.blob.type || "application/octet-stream" }, body: f.blob });
      if (!res.ok) throw new Error("A file could not be uploaded.");
      const { storageId } = (await res.json()) as { storageId: never };
      out.push({ storageId, name: f.name });
    }
    return out;
  };
}

const stamp = () => new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export function NoteEditor({ id, value, onChange, files, onFiles, placeholder, rows = 7, autoFocus, disabled, noFiles }: {
  id?: string;
  value: string;
  onChange: (text: string) => void;
  files: PendingFile[];
  onFiles: (next: PendingFile[]) => void;
  placeholder?: string;
  rows?: number;
  autoFocus?: boolean;
  disabled?: boolean;
  /** Hide the photo and voice-note buttons (a place that has nowhere to keep files). */
  noFiles?: boolean;
}) {
  const { toast } = useUI();
  const area = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [kindNow, setKindNow] = useState<ListKind | null>(null);
  const [listening, setListening] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recognition = useRef<InstanceType<SpeechCtor> | null>(null);
  const recorder = useRef<{ rec: MediaRecorder; chunks: Blob[]; stream: MediaStream; timer: ReturnType<typeof setInterval> } | null>(null);
  const live = useRef({ value, files });
  const supportsSpeech = useMemo(() => speechApi() !== null, []);
  const supportsRecording = useMemo(() => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined", []);

  useEffect(() => {
    live.current = { value, files };
  });
  useEffect(() => () => {
    recognition.current?.stop();
    if (recorder.current) {
      clearInterval(recorder.current.timer);
      recorder.current.rec.onstop = null;
      recorder.current.stream.getTracks().forEach((t) => t.stop());
    }
  }, []);

  /** Which list style the line under the cursor has, so its button shows as pressed. */
  function look(el: HTMLTextAreaElement) {
    const text = el.value;
    const from = text.lastIndexOf("\n", Math.max(0, el.selectionStart) - 1) + 1;
    const end = text.indexOf("\n", from);
    const k = parseLine(text.slice(from, end === -1 ? text.length : end)).kind;
    setKindNow(k === "text" ? null : k);
  }

  function format(kind: ListKind) {
    const el = area.current;
    if (!el) return;
    const r = toggleList(el.value, el.selectionStart, el.selectionEnd, kind);
    onChange(r.text);
    // With just a cursor (nothing selected), the cursor goes to the end of the line so typing carries on in the list. A selection stays selected.
    const collapsed = el.selectionStart === el.selectionEnd;
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(collapsed ? r.end : r.start, r.end); look(el); });
  }

  /** Enter inside a list line starts the next item; Enter on an empty item ends the list. */
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    const el = e.currentTarget;
    if (el.selectionStart !== el.selectionEnd) return;
    const at = el.selectionStart;
    const from = el.value.lastIndexOf("\n", at - 1) + 1;
    const lineEnd = el.value.indexOf("\n", at);
    const line = el.value.slice(from, lineEnd === -1 ? el.value.length : lineEnd);
    if (at < (lineEnd === -1 ? el.value.length : lineEnd)) return; // only at the end of the line
    const next = continueList(line);
    if (!next) return;
    e.preventDefault();
    if ("clear" in next) {
      onChange(el.value.slice(0, from) + el.value.slice(at));
      requestAnimationFrame(() => el.setSelectionRange(from, from));
    } else {
      const text = el.value.slice(0, at) + next.insert + el.value.slice(at);
      onChange(text);
      requestAnimationFrame(() => el.setSelectionRange(at + next.insert.length, at + next.insert.length));
    }
  }

  function toggleDictation() {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const Ctor = speechApi();
    if (!Ctor) return toast("Dictation is not available in this browser. Chrome, Edge or Safari can do it.");
    const r = new Ctor();
    r.lang = "en-US";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      let heard = "";
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) heard += e.results[i][0].transcript;
      heard = heard.trim();
      if (!heard) return;
      const cur = live.current.value;
      const el = area.current;
      const at = el ? el.selectionEnd : cur.length;
      const before = cur.slice(0, at);
      const sep = before === "" || /\s$/.test(before) ? "" : " ";
      const insert = sep + heard;
      onChange(before + insert + cur.slice(at));
      requestAnimationFrame(() => el?.setSelectionRange(at + insert.length, at + insert.length));
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") toast("Allow the microphone for this site to dictate.");
      else if (e.error !== "no-speech" && e.error !== "aborted") toast("Dictation stopped. Try again.");
    };
    r.onend = () => { setListening(false); recognition.current = null; };
    recognition.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      toast("Dictation could not start. Try again.");
    }
  }

  async function toggleRecording() {
    if (recording) {
      recorder.current?.rec.stop();
      return;
    }
    if (!supportsRecording) return toast("Voice notes are not available in this browser.");
    if (live.current.files.length >= MAX_FILES) return toast(`A note can have up to ${MAX_FILES} files.`);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((t) => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        const state = recorder.current;
        if (state) clearInterval(state.timer);
        stream.getTracks().forEach((t) => t.stop());
        recorder.current = null;
        setRecording(false);
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        if (blob.size === 0) return;
        const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
        onFiles([...live.current.files, { id: crypto.randomUUID(), kind: "audio", blob, name: `Voice note ${stamp()}.${ext}`, url: URL.createObjectURL(blob) }]);
      };
      setSeconds(0);
      const timer = setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= MAX_RECORDING_SECONDS) rec.stop();
          return s + 1;
        });
      }, 1000);
      recorder.current = { rec, chunks, stream, timer };
      rec.start();
      setRecording(true);
    } catch {
      toast("Allow the microphone for this site to record a voice note.");
    }
  }

  function addPhotos(list: FileList | null) {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      if (!f.type.startsWith("image/")) { toast(`${f.name} is not a photo.`); continue; }
      if (f.size > 15 * 1024 * 1024) { toast(`${f.name} is over 15 MB.`); continue; }
      if (next.length >= MAX_FILES) { toast(`A note can have up to ${MAX_FILES} files.`); break; }
      next.push({ id: crypto.randomUUID(), kind: "image", blob: f, name: f.name || "Photo", url: URL.createObjectURL(f) });
    }
    onFiles(next);
    if (picker.current) picker.current.value = "";
  }

  function removeFile(fid: string) {
    const gone = files.find((f) => f.id === fid);
    if (gone) URL.revokeObjectURL(gone.url);
    onFiles(files.filter((f) => f.id !== fid));
  }


  return (
    <div className="ne">
      <div className="ne-bar" role="toolbar" aria-label="Note tools">
        <button type="button" className={`ne-btn${kindNow === "check" ? " on" : ""}`} aria-label="Checkbox list" title="Checkbox list" disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={() => format("check")}><Icon name="checkbox" size={20} /></button>
        <button type="button" className={`ne-btn${kindNow === "bullet" ? " on" : ""}`} aria-label="Bullet list" title="Bullet list" disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={() => format("bullet")}><Icon name="bullets" size={20} /></button>
        <button type="button" className={`ne-btn${kindNow === "number" ? " on" : ""}`} aria-label="Numbered list" title="Numbered list" disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={() => format("number")}><Icon name="numbers" size={20} /></button>
        <span className="ne-sep" aria-hidden="true" />
        {!noFiles && (
          <>
            <button type="button" className="ne-btn" aria-label="Add photos" title="Add photos or take one" disabled={disabled} onClick={() => picker.current?.click()}><Icon name="camera" size={20} /></button>
            <input ref={picker} type="file" accept="image/*" multiple hidden onChange={(e) => addPhotos(e.target.files)} />
          </>
        )}
        <button type="button" className={`ne-btn${listening ? " live" : ""}`} aria-label={listening ? "Stop dictating" : "Dictate (speech to text)"} aria-pressed={listening} title={supportsSpeech ? (listening ? "Stop dictating" : "Dictate: speak and it is typed for you") : "Dictation needs Chrome, Edge or Safari"} disabled={disabled || !supportsSpeech} onClick={toggleDictation}><Icon name="mic" size={20} /><span>{listening ? "Listening…" : "Dictate"}</span></button>
        {!noFiles && (
          <button type="button" className={`ne-btn${recording ? " live" : ""}`} aria-label={recording ? "Stop recording" : "Record a voice note"} aria-pressed={recording} title={supportsRecording ? (recording ? "Stop recording" : "Record a voice note") : "Voice notes are not available in this browser"} disabled={disabled || !supportsRecording} onClick={() => void toggleRecording()}>
            <Icon name={recording ? "stop" : "mic"} size={20} /><span>{recording ? `Stop ${clock(seconds)}` : "Voice note"}</span>
          </button>
        )}
      </div>
      <textarea
        id={id}
        ref={area}
        className="ne-area"
        rows={rows}
        autoFocus={autoFocus}
        disabled={disabled}
        maxLength={5000}
        placeholder={placeholder ?? "Leave an internal note for yourself or a team member"}
        aria-label="Note"
        value={value}
        onChange={(e) => { onChange(e.target.value); look(e.target); }}
        onKeyDown={onKeyDown}
        onKeyUp={(e) => look(e.currentTarget)}
        onClick={(e) => look(e.currentTarget)}
      />
      {files.length > 0 && (
        <div className="ne-files">
          {files.map((f) => (
            <div key={f.id} className={`ne-file ${f.kind}`}>
              {f.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element -- a local preview of a file that has not been uploaded yet
                <img src={f.url} alt={f.name} />
              ) : (
                <audio controls preload="metadata" src={f.url} aria-label={f.name} />
              )}
              <button type="button" className="ne-remove" aria-label={`Remove ${f.name}`} disabled={disabled} onClick={() => removeFile(f.id)}><Icon name="x" size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
