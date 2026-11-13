"use client";

/* The shared shell: top bar, sidebar, and the scrolling main area every page sits in. */

import { useMutation } from "convex/react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type MouseEvent, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { setBusiness, useWorkspace } from "@/lib/clients";
import { forgetClientsPlace } from "@/lib/clients-place";
import { useStoredString, writeItem } from "@/lib/store";
import { Icon } from "./icon";
import { AccountMenu } from "./account-menu";
import { ErrorBoundary } from "./error-boundary";
import { NotificationsBell } from "./notifications-bell";
import { useStaff } from "./staff-context";
import { UIProvider, useUI } from "./ui-provider";

type NavItem =
  | { divider: true }
  | { divider?: false; key: string; label: string; icon: string; href?: string; create?: boolean };

const NAV: NavItem[] = [
  { key: "create", label: "Create", icon: "circle-plus", create: true },
  { key: "home", label: "Home", icon: "home", href: "/home" },
  { key: "schedule", label: "Schedule", icon: "calendar", href: "/schedule" },
  { divider: true },
  { key: "clients", label: "Clients", icon: "contact", href: "/clients" },
  { key: "requests", label: "Requests", icon: "inbox", href: "/requests" },
  { key: "quotes", label: "Quotes", icon: "quote", href: "/quotes" },
  { key: "jobs", label: "Jobs", icon: "hammer" },
  { key: "invoices", label: "Invoices", icon: "receipt" },
  { key: "payments", label: "Payments", icon: "card" },
  { divider: true },
  { key: "pipeline", label: "Pipeline", icon: "kanban", href: "/pipeline" },
  { key: "tasks", label: "Tasks", icon: "tasks", href: "/tasks" },
  { divider: true },
  { key: "messages", label: "Messages", icon: "message" },
];

/** Only Admins see this, in the same group as Messages at the bottom of the sidebar (the backend refuses everyone else anyway). */
const ADMIN_NAV: NavItem[] = [{ key: "team", label: "Manage Team", icon: "user", href: "/settings/users" }];

/** The pipelines in the PRD. Only Sales is built; the others show greyed out under Pipeline. */
const PIPELINES: { label: string; href?: string }[] = [
  { label: "Sales", href: "/pipeline" },
  { label: "Preplanning" },
  { label: "Construction" },
  { label: "Finance" },
];

const RAIL_KEY ="qft-mock-rail";

/** Phones: below this width the sidebar becomes a menu that opens over the page (keep in step with the 700px rules in globals.css). */
const MOBILE_QUERY = "(max-width: 700px)";

function useIsMobile(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(MOBILE_QUERY);
      list.addEventListener("change", notify);
      return () => list.removeEventListener("change", notify);
    },
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  );
}

export function Shell({ children }: { children: ReactNode }) {
  return (
    <UIProvider>
      <ShellInner>{children}</ShellInner>
    </UIProvider>
  );
}

/** The Quality First Turf Landscape logo for that business; the other businesses keep the plain "Q" tile until they have a logo of their own. */
function BrandMark({ turf }: { turf: boolean }) {
  if (!turf) return <span className="brand-mark">Q</span>;
  return <Image className="brand-logo" src="/brand/logo-full.png" alt="" width={39} height={30} priority />;
}

/** The business switcher. It asks the backend, so it sits behind an error boundary: if the backend says no, the rest of the app still shows. */
function Brand() {
  const { dropdown } = useUI();
  const workspace = useWorkspace();
  const align = useMutation(api.crm.businesses.alignNames);
  const aligning = useRef(false);
  const turfName = workspace.state === "ready" ? workspace.businesses.find((b) => b.slug === "quality-first-turf")?.name : undefined;
  // Also true while any business still has an old name, such as "Quality First Construction".
  const oldName = workspace.state === "ready" && workspace.businesses.some((b) => b.name === "Quality First Construction" || b.name === "Quality First Turf");
  // The stored name was "Quality First Turf". Rename it once, in place, the first time someone opens the CRM (D-066).
  useEffect(() => {
    if (turfName === undefined || (turfName === "Quality First Turf Landscape" && !oldName) || aligning.current) return;
    aligning.current = true;
    void align().catch(() => { aligning.current = false; });
  }, [turfName, oldName, align]);
  return (
    <button
      type="button"
      className="brand"
      aria-label="Switch business"
      onClick={(e) => {
        if (workspace.state !== "ready") return;
        const current = workspace.business._id;
        dropdown(
          e.currentTarget,
          workspace.businesses.map((b) => ({ label: b.name, checked: b._id === current, onSelect: () => setBusiness(b._id) })),
        );
      }}
    >
      <BrandMark turf={workspace.state === "ready" ? workspace.business.slug === "quality-first-turf" : workspace.state !== "empty"} />
      <span className="brand-name">{workspace.state === "ready" ? workspace.business.name : workspace.state === "loading" ? <span className="sk sk-inline" style={{ width: 130, height: 16 }} /> : "Quality First Turf Landscape"}</span>
      <Icon name="chevdown" size={16} />
    </button>
  );
}

function ShellInner({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { popover, toggleCreate, createOpen } = useUI();
  const staff = useStaff();
  const nav = staff.isAdmin ? [...NAV, ...ADMIN_NAV] : NAV;
  const mobile = useIsMobile();
  // The phone menu is open only for the page it was opened on, so going anywhere (any link in it) closes it without an effect.
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const menuOpen = menuPath === pathname;
  const rail = useStoredString(RAIL_KEY, "0") === "1";
  const [pipeOpen, setPipeOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLElement>(null);

  const active = pathname === "/home" || pathname === "/" ? "home" : pathname.startsWith("/clients") ? "clients" : pathname.startsWith("/requests") ? "requests" : pathname.startsWith("/quotes") ? "quotes" : pathname.startsWith("/schedule") ? "schedule" : pathname.startsWith("/pipeline") ? "pipeline" : pathname.startsWith("/tasks") ? "tasks" : pathname.startsWith("/settings/users") ? "team" : "";

  // The collapsed sidebar is a class on <html>, so a small script in layout.tsx can set it before first paint.
  useEffect(() => {
    document.documentElement.classList.toggle("rail", rail);
  }, [rail]);

  // The main area scrolls on its own, so reset it when the page changes.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  // "/" jumps to search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName ?? "";
      if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Escape closes the phone menu.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuPath(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <div className={menuOpen ? "app menu-open" : "app"}>
      <header className="topbar">
        <button
          type="button"
          className="menu-btn"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls="main-nav"
          onClick={() => setMenuPath(menuOpen ? null : pathname)}
        >
          <Icon name="menu" size={24} />
          Menu
        </button>
        {/* On a phone the business name moves into the menu, to leave room for the buttons. */}
        <span className="brand-slot">
          <ErrorBoundary fallback={<span className="brand"><BrandMark turf /><span className="brand-name">Quality First Turf Landscape</span></span>}>
            <Brand />
          </ErrorBoundary>
        </span>
        <span className="grow" />
        <form
          className="search"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            if (search.trim()) router.push("/clients?q=" + encodeURIComponent(search.trim()));
          }}
        >
          <Icon name="search" size={18} />
          <input
            ref={searchRef}
            type="search"
            placeholder="Press / to search"
            aria-label="Search clients, projects, quotes"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </form>
        <button className="icon-btn" type="button" aria-label="Messages" disabled>
          <Icon name="message" size={24} />
        </button>
        <NotificationsBell />
        <button
          className="icon-btn"
          type="button"
          aria-label="Settings and account"
          aria-haspopup="menu"
          onClick={(e) => popover(e.currentTarget, (close) => <AccountMenu close={close} />, { className: "account", alignRight: true })}
        >
          <Icon name="sliders" size={24} />
        </button>
      </header>

      <div className="menu-backdrop" aria-hidden="true" onClick={() => setMenuPath(null)} />

      <nav className="sidebar" id="main-nav" aria-label="Main" inert={mobile && !menuOpen}>
        <div className="sidebar-brand">
          <ErrorBoundary fallback={<span className="brand"><BrandMark turf /><span className="brand-name">Quality First Turf Landscape</span></span>}>
            <Brand />
          </ErrorBoundary>
        </div>
        <div className="nav">
          {nav.map((n, i) => {
            if (n.divider) return <hr key={i} className="divider" />;
            if (n.create) {
              return (
                <button
                  key={n.key}
                  type="button"
                  className={createOpen ? "item open" : "item"}
                  title="Create"
                  onClick={(e) => toggleCreate(e.currentTarget)}
                >
                  {createOpen ? (
                    <>
                      <span className="xcircle">
                        <Icon name="x" size={14} />
                      </span>
                      <span className="label">Create</span>
                    </>
                  ) : (
                    <>
                      <Icon name={n.icon} size={24} />
                      <span className="label">{n.label}</span>
                    </>
                  )}
                </button>
              );
            }
            const inner = (
              <>
                <Icon name={n.icon} size={24} />
                <span className="label">{n.label}</span>
              </>
            );
            if (n.href) {
              const on = n.key === active;
              // A sidebar tab always opens its first page. The Clients list's saved place is dropped, so only Back from a client page (which reads
              // it) returns to where the person was.
              const openClients = (e: MouseEvent<HTMLAnchorElement>) => {
                if (n.key !== "clients" || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                forgetClientsPlace();
              };
              if (n.key === "pipeline") {
                // Pipeline opens a list of pipelines under it. Sales is the one that exists and is selected; the rest are greyed out until they are built.
                const open = pipeOpen || on;
                return (
                  <div key={n.key} className="nav-group">
                    <Link
                      className={on ? "item on-path" : "item"}
                      href={n.href}
                      title={n.label}
                      aria-current={undefined}
                      aria-expanded={open}
                      aria-controls="pipeline-sub"
                      onClick={(e) => {
                        // Already on a pipeline page: the click only folds or unfolds the list.
                        if (on && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) {
                          e.preventDefault();
                          setPipeOpen(!pipeOpen);
                          return;
                        }
                        setPipeOpen(true);
                      }}
                    >
                      {inner}
                      <span className={open ? "chev open" : "chev"}><Icon name="chevdown" size={16} /></span>
                    </Link>
                    <div className={open ? "nav-sub open" : "nav-sub"} id="pipeline-sub" inert={!open}>
                      <div className="nav-sub-in">
                        {PIPELINES.map((p) =>
                          p.href ? (
                            <Link key={p.label} className={on ? "subitem active" : "subitem"} href={p.href} aria-current={on ? "page" : undefined}>{p.label}</Link>
                          ) : (
                            <span key={p.label} className="subitem soon" aria-disabled="true" title={`${p.label} is not available yet`}>{p.label}</span>
                          ),
                        )}
                      </div>
                    </div>
                  </div>
                );
              }
              return (
                <Link key={n.key} className={on ? "item active" : "item"} href={n.href} title={n.label} aria-current={on ? "page" : undefined} onClick={openClients}>
                  {inner}
                </Link>
              );
            }
            return (
              <span key={n.key} className="item soon" aria-disabled="true" title={`${n.label} is not available yet`}>
                {inner}
              </span>
            );
          })}
        </div>
        <button type="button" className="collapse" aria-label="Collapse menu" onClick={() => writeItem(RAIL_KEY, rail ? "0" : "1")}>
          <Icon name="arrowleft" size={24} />
          <span className="label">Collapse</span>
        </button>
      </nav>

      <main className="main" id="main" ref={mainRef}>
        <div className="page">{children}</div>
      </main>
    </div>
  );
}
