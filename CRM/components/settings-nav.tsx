"use client";

/* The navigation down the left of every Settings page, like Jobber's: a title, then groups of links with the current page in
   green. Only the pages that exist are listed (D-024); Businesses is in the PRD but not built yet. */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStaff } from "./staff-context";

export function SettingsNav() {
  const pathname = usePathname();
  const staff = useStaff();

  return (
    <nav className="settings-nav" aria-label="Settings">
      <h2>Settings</h2>
      {staff.isAdmin && (
        <>
          <div className="group">
            <div className="group-title">Business management</div>
            <button type="button" disabled>Businesses</button>
            <Link href="/settings/automations" className={pathname.startsWith("/settings/automations") ? "active" : undefined} aria-current={pathname.startsWith("/settings/automations") ? "page" : undefined}>
              Automations
            </Link>
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
