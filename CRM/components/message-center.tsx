"use client";

/* The Message Center in the top bar is greyed out for now (user, 2026-11-23): Messages is kept for SMS and WhatsApp, so the button does nothing
   until they are connected. The panel, the unread count and the Messages page (components/messages-page.tsx) are kept in git history. */

import { Icon } from "./icon";

export function MessageCenterButton() {
  return (
    <button className="icon-btn bell" type="button" aria-label="Messages" disabled data-tip="Messages are not available yet">
      <Icon name="message" size={24} />
    </button>
  );
}
