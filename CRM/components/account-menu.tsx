"use client";

/* The Settings menu behind the gear icon in the top bar, laid out like Jobber's: who you are at the top, then a short list, then
   Log Out. Opened with useUI().popover(anchor, (close) => <AccountMenu close={close} />, { className: "account", alignRight: true }). */

import { useClerk } from "@clerk/nextjs";
import Link from "next/link";
import { ROLE_LABEL } from "@/convex/crm/lib/stages";
import { useStaff } from "./staff-context";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase() || "?";

export function AccountMenu({ close }: { close: () => void }) {
  const staff = useStaff();
  const clerk = useClerk();

  return (
    <>
      <div className="acct-head">
        <span className="acct-avatar" aria-hidden="true">{initials(staff.name)}</span>
        <div className="acct-who">
          <div className="acct-name">{staff.name}</div>
          <div className="acct-email">{staff.email}</div>
          <div className="acct-roles">{staff.roles.map((r) => ROLE_LABEL[r]).join(", ")}</div>
        </div>
      </div>

      <div className="acct-list" role="menu">
        {staff.isAdmin ? (
          <Link href="/settings/users" role="menuitem" className="acct-item" onClick={close}>
            Settings
          </Link>
        ) : (
          <button type="button" role="menuitem" className="acct-item" disabled>
            Settings
          </button>
        )}
        <button type="button" role="menuitem" className="acct-item" onClick={() => { close(); clerk.openUserProfile(); }}>
          Account
        </button>
        {staff.isAdmin && (
          <Link href="/settings/users" role="menuitem" className="acct-item" onClick={close}>
            Manage Team
          </Link>
        )}
        <div className="acct-divider" role="separator" />
        <button type="button" role="menuitem" className="acct-item" onClick={() => { close(); void clerk.signOut({ redirectUrl: "/sign-in" }); }}>
          Log Out
        </button>
      </div>
    </>
  );
}
