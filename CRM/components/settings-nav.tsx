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
      <div className="group">
        <div className="group-title">Personal</div>
        <Link href="/settings/calendar" className={pathname.startsWith("/settings/calendar") ? "active" : undefined} aria-current={pathname.startsWith("/settings/calendar") ? "page" : undefined}>
          My calendar
        </Link>
      </div>
      {(staff.isAdmin || staff.roles.includes("office")) && (
        <div className="group">
          <div className="group-title">Business management</div>
          {staff.isAdmin && <button type="button" disabled>Businesses</button>}
          {staff.isAdmin && (
            <Link href="/settings/automations" className={pathname.startsWith("/settings/automations") ? "active" : undefined} aria-current={pathname.startsWith("/settings/automations") ? "page" : undefined}>
              Automations
            </Link>
          )}
          <Link href="/settings/disclaimers" className={pathname.startsWith("/settings/disclaimers") ? "active" : undefined} aria-current={pathname.startsWith("/settings/disclaimers") ? "page" : undefined}>
            Disclaimers
          </Link>
        </div>
      )}
      {staff.isAdmin && (
        <>
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
