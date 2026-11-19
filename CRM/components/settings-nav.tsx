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
      {(staff.isAdmin || staff.can("templates")) && (
        <div className="group">
          <div className="group-title">Business management</div>
          {staff.isAdmin && <button type="button" disabled>Businesses</button>}
          {staff.isAdmin && (
            <Link href="/settings/automations" className={pathname.startsWith("/settings/automations") ? "active" : undefined} aria-current={pathname.startsWith("/settings/automations") ? "page" : undefined}>
              Automations
            </Link>
          )}
          {staff.can("templates") && (
            <Link href="/settings/invoices" className={pathname.startsWith("/settings/invoices") ? "active" : undefined} aria-current={pathname.startsWith("/settings/invoices") ? "page" : undefined}>
              Invoices
            </Link>
          )}
          <Link href="/settings/products" className={pathname.startsWith("/settings/products") ? "active" : undefined} aria-current={pathname.startsWith("/settings/products") ? "page" : undefined}>
            Products &amp; Services
          </Link>
          {staff.isAdmin && (
            <Link href="/settings/import" className={pathname.startsWith("/settings/import") ? "active" : undefined} aria-current={pathname.startsWith("/settings/import") ? "page" : undefined}>
              Import data
            </Link>
          )}
          <Link href="/settings/export" className={pathname.startsWith("/settings/export") ? "active" : undefined} aria-current={pathname.startsWith("/settings/export") ? "page" : undefined}>
            Export data
          </Link>
          {staff.isAdmin && (
            <Link href="/settings/phone-numbers" className={pathname.startsWith("/settings/phone-numbers") ? "active" : undefined} aria-current={pathname.startsWith("/settings/phone-numbers") ? "page" : undefined}>
              Phone numbers
            </Link>
          )}
          {staff.can("pipelinePreplanning") && (
            <Link href="/settings/materials" className={pathname.startsWith("/settings/materials") ? "active" : undefined} aria-current={pathname.startsWith("/settings/materials") ? "page" : undefined}>
              Materials
            </Link>
          )}
          <Link href="/settings/checklists" className={pathname.startsWith("/settings/checklists") ? "active" : undefined} aria-current={pathname.startsWith("/settings/checklists") ? "page" : undefined}>
            Checklists
          </Link>
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
