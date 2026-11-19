"use client";

/* The Message Center in the top bar (plan 2026-11-19-messages), after Jobber's: a count of unread texts and, opened, the latest conversations with a
   way into Messages. It shows only to someone who may read texts. */

import Link from "next/link";
import type { Id } from "@/convex/_generated/dataModel";
import { useWorkspace } from "@/lib/clients";
import { quoteDateTime } from "@/lib/format";
import { useConversations, useUnreadTexts } from "@/lib/messages";
import { displayPhone } from "@/convex/crm/lib/phone";
import { Icon } from "./icon";
import { useStaff } from "./staff-context";
import { useUI } from "./ui-provider";

export function MessageCenterButton() {
  const { popover } = useUI();
  const staff = useStaff();
  const ws = useWorkspace();
  const businessId = ws.state === "ready" ? ws.business._id : undefined;
  const can = staff.can("messages");
  const unread = useUnreadTexts(businessId, can) ?? 0;
  if (!can) return null;
  return (
    <button
      className="icon-btn bell"
      type="button"
      aria-label={unread ? `Messages, ${unread} unread` : "Messages"}
      aria-haspopup="dialog"
      onClick={(e) => popover(e.currentTarget, (close) => <Panel businessId={businessId} close={close} />, { className: "mentions", alignRight: true })}
    >
      <Icon name="message" size={24} />
      {unread > 0 && <span className="bell-count" aria-hidden="true">{unread > 9 ? "9+" : unread}</span>}
    </button>
  );
}

function Panel({ businessId, close }: { businessId: Id<"businesses"> | undefined; close: () => void }) {
  const list = useConversations(businessId);
  const top = (list ?? []).slice(0, 8);
  return (
    <div className="mn">
      <div className="mn-head">
        <b>Message Center</b>
        <Link className="btn link" href="/messages" onClick={close}>Open Messages</Link>
      </div>
      {list === undefined ? (
        <div className="mn-empty"><span className="sk" style={{ display: "block", height: 14, width: "70%" }} /></div>
      ) : top.length === 0 ? (
        <div className="mn-empty">No texts yet. Texts to and from clients show here.</div>
      ) : (
        <ul>
          {top.map((c) => (
            <li key={c.key} className={c.unread ? "unread" : undefined}>
              <Link href={c.clientId ? `/messages?client=${c.clientId}` : `/messages?phone=${encodeURIComponent(c.phone)}`} onClick={close}>
                {c.unread > 0 && <span className="mn-dot" aria-label="Unread" />}
                <span className="mn-text">
                  <b>{c.clientId ? c.name : displayPhone(c.name)}</b>
                  <span className="mn-excerpt">{c.lastDirection === "out" ? "You: " : ""}{c.lastBody}</span>
                  <small>{quoteDateTime(c.lastAt)}</small>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
