"use client";

/* The bell in the top bar (D-073): a count of the notes that tag the signed-in person with @, and a list of them. Opening one goes to
   the project, client or quote the note is on and marks it read. */

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import { quoteDateTime } from "@/lib/format";
import { failure } from "@/lib/pipeline";
import { Icon } from "./icon";
import { useUI } from "./ui-provider";

export function NotificationsBell() {
  const { popover } = useUI();
  const data = useQuery(api.crm.mentions.mine, {});
  const unread = data?.unread ?? 0;
  return (
    <button
      className="icon-btn bell"
      type="button"
      aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
      aria-haspopup="dialog"
      onClick={(e) => popover(e.currentTarget, (close) => <MentionsPanel close={close} />, { className: "mentions", alignRight: true })}
    >
      <Icon name="bell" size={24} />
      {unread > 0 && <span className="bell-count" aria-hidden="true">{unread > 9 ? "9+" : unread}</span>}
    </button>
  );
}

function MentionsPanel({ close }: { close: () => void }) {
  const { toast } = useUI();
  const data = useQuery(api.crm.mentions.mine, {});
  const markRead = useMutation(api.crm.mentions.markRead);
  const read = (id?: (typeof items)[number]["id"]) => void markRead({ ...(id ? { id } : {}), now: Date.now() }).catch((e) => toast(failure(e, "That could not be marked as read.")));
  const items = data?.items ?? [];
  return (
    <div className="mn">
      <div className="mn-head">
        <b>Notifications</b>
        {(data?.unread ?? 0) > 0 && <button type="button" className="btn link" onClick={() => read()}>Mark all read</button>}
      </div>
      {data === undefined ? (
        <div className="mn-empty"><span className="sk" style={{ display: "block", height: 14, width: "70%" }} /></div>
      ) : items.length === 0 ? (
        <div className="mn-empty">Nothing yet. When someone tags you in a note with @, it shows here.</div>
      ) : (
        <ul>
          {items.map((m) => {
            const body = (
              <>
                {!m.read && <span className="mn-dot" aria-label="Unread" />}
                <span className="mn-text">
                  <b>{m.byName}</b> tagged you in {m.where}
                  <span className="mn-excerpt">{m.excerpt}</span>
                  <small>{quoteDateTime(m.at)}{m.businessName ? ` · ${m.businessName}` : ""}</small>
                </span>
              </>
            );
            return (
              <li key={m.id} className={m.read ? undefined : "unread"}>
                {m.href ? <Link href={m.href} onClick={() => { read(m.id); close(); }}>{body}</Link> : <div>{body}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
