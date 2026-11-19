"use client";

/* Messages (plan 2026-11-19-messages, PRD 5.3): the text log as an inbox. The conversations on the left (a client, or a bare number no client
   matches), the chosen thread on the right, and a box to write in. Until Twilio is connected, Send logs the text as "sent by hand" and opens the
   phone's messaging app with it filled in; once it is connected the text goes out from the business's number. The backend does all the grouping. */

import { useMutation } from "convex/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { displayPhone } from "@/convex/crm/lib/phone";
import { useWorkspace, type BusinessDoc } from "@/lib/clients";
import { quoteDateTime } from "@/lib/format";
import { useCalls, useConversations, useTextingStatus, useThread } from "@/lib/messages";
import { durationLabel, OUTCOME_LABEL } from "@/convex/crm/lib/calls";
import { clock, failure } from "@/lib/pipeline";
import { useClientSearch } from "@/lib/quotes";
import { openText } from "@/lib/sms";
import { EmptyBackend } from "./empty-backend";
import { Icon } from "./icon";
import { LogCall } from "./log-call";
import { PipelineModal } from "./pipeline-dialogs";
import { MessagesSkeleton } from "./skeletons";
import { useStaff } from "./staff-context";
import { useUI } from "./ui-provider";

export function MessagesPage() {
  const workspace = useWorkspace();
  if (workspace.state === "loading") return <MessagesSkeleton />;
  if (workspace.state === "empty") return <EmptyBackend />;
  return <Messages business={workspace.business} />;
}

const STATUS_NOTE: Record<string, string> = { manual: "Sent by hand", queued: "Sending…", sent: "Sent", failed: "Not sent", received: "" };

function Messages({ business }: { business: BusinessDoc }) {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useUI();
  const staff = useStaff();
  const canSend = staff.can("messages", "edit");
  const clientParam = (params.get("client") ?? undefined) as Id<"clients"> | undefined;
  const phoneParam = params.get("phone") ?? undefined;
  const conversations = useConversations(business._id);
  const thread = useThread(business._id, { clientId: clientParam, phone: phoneParam });
  const calls = useCalls(business._id, { clientId: clientParam, phone: phoneParam });
  const status = useTextingStatus(business._id);
  const send = useMutation(api.crm.messages.send);
  const markRead = useMutation(api.crm.messages.markRead);
  const [q, setQ] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [logging, setLogging] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  const selected = !!(clientParam || phoneParam);
  const current = conversations?.find((c) => (clientParam ? c.clientId === clientParam : c.clientId === null && c.phone.replace(/\D/g, "").slice(-10) === (phoneParam ?? "").replace(/\D/g, "").slice(-10)));
  const unreadHere = current?.unread ?? 0;

  // Opening a conversation marks what it holds as read; the thread sits at its newest text.
  useEffect(() => {
    if (selected && unreadHere > 0) void markRead({ businessId: business._id, ...(clientParam ? { clientId: clientParam } : { phone: phoneParam }), now: clock() }).catch(() => undefined);
  }, [selected, unreadHere, business._id, clientParam, phoneParam, markRead]);
  const timeline = useMemo(() => {
    if (thread === undefined || calls === undefined) return undefined;
    return [
      ...thread.map((m) => ({ kind: "text" as const, at: m.at, m })),
      ...calls.map((c) => ({ kind: "call" as const, at: c.at, c })),
    ].sort((a, b) => a.at - b.at);
  }, [thread, calls]);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [timeline?.length, clientParam, phoneParam]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (conversations ?? []).filter((c) => !t || c.name.toLowerCase().includes(t) || c.phone.includes(t) || c.lastBody.toLowerCase().includes(t));
  }, [conversations, q]);

  if (conversations === undefined) return <MessagesSkeleton />;
  const openConversation = (c: { clientId: Id<"clients"> | null; phone: string }) => router.push(c.clientId ? `/messages?client=${c.clientId}` : `/messages?phone=${encodeURIComponent(c.phone)}`);

  async function submit() {
    if (!body.trim() || !selected) return;
    setBusy(true);
    try {
      const r = await send({ businessId: business._id, ...(clientParam ? { clientId: clientParam } : { phone: phoneParam }), body, now: clock() });
      setBody("");
      if (r.mode === "manual") {
        openText(r.phone, r.body);
        toast("The text is logged as sent by hand. Your messaging app is opening with it.");
      }
    } catch (e) {
      toast(failure(e, "The text could not be sent."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fade-in msg">
      <div className="page-head">
        <h1>Messages</h1>
        {canSend && <button type="button" className="btn primary" onClick={() => setPicking(true)}><Icon name="plus" size={18} /> New message</button>}
      </div>
      {status && !status.connected && (
        <div className="msg-note" role="status">
          Texting is not connected yet. Send logs the text as sent by hand and opens your messaging app with it. {staff.isAdmin ? <Link href="/settings/phone-numbers">Set up phone numbers</Link> : "An Admin sets up the business number."}
        </div>
      )}
      <div className="msg-grid">
        <aside className="card msg-list" aria-label="Conversations">
          <div className="searchbox"><span><Icon name="search" size={20} /></span><input type="search" placeholder="Search messages" aria-label="Search messages" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          {shown.length === 0 ? (
            <div className="msg-empty">{conversations.length === 0 ? "No texts yet. Texts to and from clients are kept here." : "Nothing matches that search."}</div>
          ) : (
            <ul>
              {shown.map((c) => {
                const on = clientParam ? c.clientId === clientParam : c.clientId === null && phoneParam !== undefined && c.phone === phoneParam;
                return (
                  <li key={c.key}>
                    <button type="button" className={`msg-row${on ? " on" : ""}${c.unread ? " unread" : ""}`} onClick={() => openConversation(c)}>
                      <span className="msg-name">{c.clientId ? c.name : displayPhone(c.name)}{c.unread > 0 && <span className="bell-count msg-count">{c.unread}</span>}</span>
                      <span className="msg-last">{c.lastDirection === "out" ? "You: " : ""}{c.lastBody}</span>
                      <small>{quoteDateTime(c.lastAt)}</small>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        <section className="card msg-thread" aria-label="Conversation">
          {!selected ? (
            <div className="msg-empty tall">Choose a conversation, or start a new message.</div>
          ) : (
            <>
              <header className="msg-head">
                <b>{current ? (current.clientId ? current.name : displayPhone(current.name)) : phoneParam ? displayPhone(phoneParam) : "New message"}</b>
                <span className="msg-actions">
                  {(current?.phone ?? phoneParam) && <a className="btn" href={`tel:${(current?.phone ?? phoneParam ?? "").replace(/[^\d+]/g, "")}`}>Call</a>}
                  {canSend && <button type="button" className="btn" onClick={() => setLogging(true)}>Log a call</button>}
                  {clientParam && <Link href={`/clients/${clientParam}`}>View client</Link>}
                </span>
              </header>
              <div className="msg-scroll" ref={scroller}>
                {timeline === undefined ? <div className="sk" style={{ height: 120, margin: 12 }} /> : timeline.length === 0 ? <div className="msg-empty">No texts or calls with this person yet.</div> : timeline.map((e) => e.kind === "call" ? (
                  <div key={e.c.id} className="msg-call">
                    <b>{e.c.direction === "in" ? "Incoming call" : "Outgoing call"}</b> · {OUTCOME_LABEL[e.c.outcome]}{durationLabel(e.c.durationSeconds) ? ` · ${durationLabel(e.c.durationSeconds)}` : ""}
                    {e.c.notes && <p>{e.c.notes}</p>}
                    <small>
                      {quoteDateTime(e.c.at)} · {e.c.userName}
                      {e.c.opportunityId && <> · <Link href={`/jobs/${e.c.opportunityId}`}>Job</Link></>}
                    </small>
                  </div>
                ) : (
                  <div key={e.m.id} className={`msg-bubble ${e.m.direction}${e.m.status === "failed" ? " failed" : ""}`}>
                    <p>{e.m.body}</p>
                    <small>
                      {e.m.channel === "whatsapp" ? "WhatsApp · " : ""}{quoteDateTime(e.m.at)}{e.m.userName ? ` · ${e.m.userName}` : ""}{STATUS_NOTE[e.m.status] ? ` · ${STATUS_NOTE[e.m.status]}` : ""}
                      {e.m.status === "failed" && e.m.error ? ` (${e.m.error})` : ""}
                      {e.m.opportunityId && <> · <Link href={`/jobs/${e.m.opportunityId}`}>Job</Link></>}
                    </small>
                  </div>
                ))}
              </div>
              {canSend ? (
                <form className="msg-compose" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
                  <textarea aria-label="Write a text" rows={2} maxLength={1600} placeholder="Write a text" value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void submit(); } }} />
                  <button type="submit" className="btn primary" disabled={busy || !body.trim()}>{busy ? "Sending…" : "Send"}</button>
                </form>
              ) : (
                <div className="msg-note">Your role can read texts but not send them.</div>
              )}
            </>
          )}
        </section>
      </div>
      {logging && <LogCall businessId={business._id} clientId={clientParam} phone={current?.phone ?? phoneParam} onClose={() => setLogging(false)} />}
      {picking && <NewMessage businessId={business._id} onClose={() => setPicking(false)} onPick={(id) => { setPicking(false); router.push(`/messages?client=${id}`); }} />}
    </div>
  );
}

function NewMessage({ businessId, onClose, onPick }: { businessId: Id<"businesses">; onClose: () => void; onPick: (id: Id<"clients">) => void }) {
  const [q, setQ] = useState("");
  const found = useClientSearch(businessId, q);
  return (
    <PipelineModal title="New message" onClose={onClose} className="au-modal">
      {(close) => (
        <div className="cat-fields">
          <div className="field">
            <label htmlFor="nm-client">To</label>
            <input id="nm-client" placeholder="Search for a client" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" autoFocus />
          </div>
          {q.trim() && found && (
            <div className="sc-results" role="listbox" style={{ position: "static" }}>
              {found.rows.length === 0 && <div className="menu-empty">No clients match</div>}
              {found.rows.map((c) => (
                <button key={c._id} type="button" role="option" aria-selected={false} onClick={() => onPick(c._id)}>
                  <b>{c.name}</b> <span>{c.phone ? displayPhone(c.phone) : "No phone number"}</span>
                </button>
              ))}
            </div>
          )}
          <div className="modal-foot"><button type="button" className="btn" onClick={close}>Cancel</button></div>
        </div>
      )}
    </PipelineModal>
  );
}
