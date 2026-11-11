"use client";

/* Email on the client Communication tab (D-064). The list is what the sync has already stored, so opening the page
   does not call Zoho. Opening one message loads its body once, if it is not stored yet. There is no send or reply. */

import { ConvexError } from "convex/values";
import { useAction, usePaginatedQuery, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { quoteDateTime } from "@/lib/format";
import { Icon } from "./icon";
import { CommunicationSkeleton, Sk } from "./skeletons";
import { useStaff } from "./staff-context";

type Thread = {
  _id: Id<"clientMailThreads">;
  threadId: string;
  subject: string;
  latestAt: number;
  preview: string;
  fromName: string;
  fromAddress: string;
  toAddresses: string[];
  direction: "incoming" | "outgoing";
  count: number;
  hasAttachment: boolean;
};

const party = (name: string, address: string) => {
  if (!address) return name || "Unknown";
  if (!name || name.toLowerCase() === address) return address;
  return `${name} <${address}>`;
};

const people = (addresses: string[]) => (addresses.length ? addresses.join(", ") : "—");

export function ClientCommunication({
  clientId,
  hasEmail,
  lastCommunication,
}: {
  clientId: Id<"clients">;
  hasEmail: boolean;
  lastCommunication?: { at: number; text: string };
}) {
  const { isAdmin } = useStaff();
  const status = useQuery(api.crm.clientMail.status, {});
  const threads = usePaginatedQuery(api.crm.clientMail.list, { clientId }, { initialNumItems: 20 });
  const syncNow = useAction(api.crm.zohoMailSync.syncNow);
  const [openThread, setOpenThread] = useState<string | null>(null);
  const [openMessage, setOpenMessage] = useState<Id<"clientMailMessages"> | null>(null);
  const [busy, setBusy] = useState(false);
  const [syncError, setSyncError] = useState("");

  const loading = threads.status === "LoadingFirstPage" && threads.results.length === 0;
  if (loading) return <CommunicationSkeleton />;
  const line = statusLine(status);

  async function onSync() {
    setBusy(true);
    setSyncError("");
    try {
      await syncNow({});
    } catch (err) {
      setSyncError(err instanceof ConvexError && typeof err.data === "string" ? err.data : "Could not sync. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="cj-card">
      <div className="cj-card-head">
        <div>
          <h3>Email</h3>
          {line && <div className="cj-mail-sync">{line}</div>}
        </div>
        {isAdmin && (
          <button type="button" className="cj-link" onClick={() => void onSync()} disabled={busy || status?.running}>
            {busy || status?.running ? "Syncing…" : "Sync now"}
          </button>
        )}
      </div>
      {(hasEmail || threads.results.length > 0) && <p className="cj-mail-note">Read only. Sending and replying stay in Zoho Mail.</p>}
      {isAdmin && status?.lastError ? <p className="cj-mail-error">{status.lastError}</p> : null}
      {syncError ? <p className="cj-mail-error">{syncError}</p> : null}

      {threads.results.length === 0 ? (
        <div className="cj-empty">
          {lastCommunication && (
            <div className="cj-msg">
              <div className="when">{quoteDateTime(lastCommunication.at)}</div>
              <p>{lastCommunication.text}</p>
            </div>
          )}
          <b>{hasEmail ? "No emails yet" : "No email address on this client"}</b>
          <span>{emptyCopy(hasEmail, status)}</span>
        </div>
      ) : (
        <>
          {threads.results.map((thread) => (
            <ThreadRow
              key={thread._id}
              clientId={clientId}
              thread={thread}
              open={openThread === thread.threadId}
              openMessage={openMessage}
              onToggle={() => {
                setOpenMessage(null);
                setOpenThread((current) => (current === thread.threadId ? null : thread.threadId));
              }}
              onOpenMessage={setOpenMessage}
            />
          ))}
          {(threads.status === "CanLoadMore" || threads.status === "LoadingMore") && (
            <div className="cj-mail-more">
              <button type="button" className="btn" onClick={() => threads.loadMore(20)} disabled={threads.status === "LoadingMore"}>
                {threads.status === "LoadingMore" ? "Loading…" : "Show more"}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function ThreadRow({
  clientId,
  thread,
  open,
  openMessage,
  onToggle,
  onOpenMessage,
}: {
  clientId: Id<"clients">;
  thread: Thread;
  open: boolean;
  openMessage: Id<"clientMailMessages"> | null;
  onToggle: () => void;
  onOpenMessage: (id: Id<"clientMailMessages"> | null) => void;
}) {
  const messages = useQuery(api.crm.clientMail.threadMessages, open ? { clientId, threadId: thread.threadId } : "skip");
  return (
    <div className={`cj-thread${open ? " open" : ""}`}>
      <button type="button" className="cj-mail" aria-expanded={open} onClick={onToggle}>
        <div className="cj-mail-top">
          <b><span className="cj-chev"><Icon name="chevright" size={16} /></span>{thread.subject}</b>
          <span className="when">{quoteDateTime(thread.latestAt)}</span>
        </div>
        <div className="cj-mail-meta">
          <span className={`cj-dir${thread.direction === "outgoing" ? " out" : ""}`}><i />{thread.direction === "outgoing" ? "Outgoing" : "Incoming"}</span>
          <span>{party(thread.fromName, thread.fromAddress)} → {people(thread.toAddresses)}</span>
          {thread.hasAttachment && <span>Has an attachment</span>}
        </div>
        {thread.preview && <p className="cj-mail-preview">{thread.preview}</p>}
        {thread.count > 1 && <div className="cj-mail-count">{thread.count} messages in this conversation</div>}
      </button>
      {open && (
        <div className="cj-thread-body fade-in">
          {messages === undefined ? (
            <div className="cj-mail"><Sk w="70%" h={16} /><Sk w="40%" h={14} style={{ marginTop: 8 }} /></div>
          ) : messages.map((message) => (
            <div key={message._id}>
              <button
                type="button"
                className={`cj-mail-line${openMessage === message._id ? " open" : ""}`}
                aria-expanded={openMessage === message._id}
                onClick={() => onOpenMessage(openMessage === message._id ? null : message._id)}
              >
                <div className="cj-mail-top">
                  <b>{message.subject}</b>
                  <span className="when">{quoteDateTime(message.receivedAt)}</span>
                </div>
                <div className="cj-mail-meta">
                  <span className={`cj-dir${message.direction === "outgoing" ? " out" : ""}`}><i />{message.direction === "outgoing" ? "Outgoing" : "Incoming"}</span>
                  <span>{party(message.fromName, message.fromAddress)} → {people(message.toAddresses)}</span>
                </div>
                {openMessage !== message._id && message.preview && <p className="cj-mail-preview">{message.preview}</p>}
              </button>
              {openMessage === message._id && <MessageBody id={message._id} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MessageBody({ id }: { id: Id<"clientMailMessages"> }) {
  const detail = useQuery(api.crm.clientMail.detail, { messageId: id });
  const load = useAction(api.crm.zohoMailSync.loadContent);
  const [failed, setFailed] = useState("");
  const status = detail?.contentStatus;

  useEffect(() => {
    if (status !== "pending") return;
    let cancelled = false;
    load({ messageId: id }).catch((err: unknown) => {
      if (!cancelled) setFailed(err instanceof ConvexError && typeof err.data === "string" ? err.data : "The message could not be loaded.");
    });
    return () => {
      cancelled = true;
    };
  }, [status, id, load]);

  if (detail === undefined) {
    return <div className="cj-mail-body"><Sk w="100%" h={14} /><Sk w="80%" h={14} style={{ marginTop: 8 }} /></div>;
  }
  if (detail === null) return <div className="cj-mail-body">This email is no longer available.</div>;
  if (detail.contentStatus === "pending" && !failed) {
    return <div className="cj-mail-body" aria-busy="true"><Sk w="100%" h={14} /><Sk w="92%" h={14} style={{ marginTop: 8 }} /><Sk w="70%" h={14} style={{ marginTop: 8 }} /></div>;
  }
  if (detail.contentStatus !== "stored") {
    return (
      <div className="cj-mail-body">
        {detail.ccAddresses.length > 0 && <p>Cc: {people(detail.ccAddresses)}</p>}
        <p>{failed || detail.preview || "The full message could not be loaded from Zoho Mail."}</p>
      </div>
    );
  }
  return (
    <div className="cj-mail-body">
      {detail.ccAddresses.length > 0 && <p>Cc: {people(detail.ccAddresses)}</p>}
      {detail.hasAttachment && <p>This message has an attachment. Open it in Zoho Mail to download it.</p>}
      {detail.imagesHidden && <p className="cj-mail-images">Images are left out so opening this here does not notify the sender.</p>}
      {detail.html ? <div dangerouslySetInnerHTML={{ __html: detail.html }} /> : <p>{detail.preview || "This message has no body."}</p>}
    </div>
  );
}

function statusLine(status: { configured: boolean; running: boolean; historyComplete: boolean; lastSuccessAt: number | null; lastError: string } | undefined): string {
  if (!status) return "";
  if (!status.configured) return "Zoho Mail isn't connected yet.";
  if (status.running) return "Syncing…";
  if (status.lastError) return "The last sync did not finish. It will try again.";
  if (!status.historyComplete) return "Loading earlier emails…";
  if (status.lastSuccessAt) return `Updated ${quoteDateTime(status.lastSuccessAt)}`;
  return "";
}

function emptyCopy(hasEmail: boolean, status: { configured: boolean; historyComplete: boolean } | undefined): string {
  if (!hasEmail) return "Add an email address and messages with the office mailbox will show up here. Texts and chats are not connected.";
  if (status && !status.configured) return "Messages will appear here once Zoho Mail is connected. Texts and chats are not connected.";
  if (status && !status.historyComplete) return "Looking through the mailbox. Emails will show up here as they are found.";
  return "Emails with the office mailbox will appear here. Texts and chats are not connected.";
}
