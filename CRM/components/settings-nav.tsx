"use client";

/* The navigation down the left of every Settings page, like Jobber's: a title, then groups of links with the current page in
   green. Only the pages that exist are listed (D-024); Businesses is in the PRD but not built yet. */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStaff } from "./staff-context";
import { useUI } from "./ui-provider";

export function SettingsNav() {
  const pathname = usePathname();
  const staff = useStaff();
  const { soon } = useUI();

  return (
    <nav className="settings-nav" aria-label="Settings">
      <h2>Settings</h2>
      {staff.isAdmin && (
        <>
          <div className="group">
            <div className="group-title">Business management</div>
            <button type="button" onClick={() => soon("Business settings")}>Businesses</button>
          </div>
          <div className="group">
            <div className="group-title">Team organization</div>
            <Link href="/settings/users" className={pathname.startsWith("/settings/users") ? "active" : undefined} aria-current={pathname.startsWith("/settings/users") ? "page" : undefined}>
              Manage Team
            </Link>
          </div>
        </>
      )}
    </nav>
  );
}
