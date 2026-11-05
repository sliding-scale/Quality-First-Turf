"use client";

/* The shared shell: top bar, sidebar, and the scrolling main area every page sits in. */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { setBusiness, useWorkspace } from "@/lib/clients";
import { useStoredString, writeItem } from "@/lib/store";
import { Icon } from "./icon";
import { ErrorBoundary } from "./error-boundary";
import { UIProvider, useUI } from "./ui-provider";

type NavItem =
  | { divider: true }
  | { divider?: false; key: string; label: string; icon: string; href?: string; create?: boolean };

const NAV: NavItem[] = [
  { key: "create", label: "Create", icon: "circle-plus", create: true },
  { key: "home", label: "Home", icon: "home", href: "/" },
  { key: "schedule", label: "Schedule", icon: "calendar" },
  { divider: true },
  { key: "clients", label: "Clients", icon: "contact", href: "/clients" },
  { key: "requests", label: "Requests", icon: "inbox", href: "/requests" },
  { key: "quotes", label: "Quotes", icon: "quote" },
  { key: "jobs", label: "Jobs", icon: "hammer" },
  { key: "invoices", label: "Invoices", icon: "receipt" },
  { key: "payments", label: "Payments", icon: "card" },
  { divider: true },
  { key: "messages", label: "Messages", icon: "message" },
  { key: "pipeline", label: "Pipeline", icon: "kanban" },
];

const RAIL_KEY = "qft-mock-rail";

export function Shell({ children }: { children: ReactNode }) {
  return (
    <UIProvider>
      <ShellInner>{children}</ShellInner>
    </UIProvider>
  );
}

/** The business switcher. It asks the backend, so it sits behind an error boundary: if the backend says no, the rest of the app still shows. */
function Brand() {
  const { dropdown } = useUI();
  const workspace = useWorkspace();
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
      <span className="brand-mark">Q</span>
      <span className="brand-name">{workspace.state === "ready" ? workspace.business.name : workspace.state === "loading" ? <span className="sk sk-inline" style={{ width: 130, height: 16 }} /> : "Quality First Turf"}</span>
      <Icon name="chevdown" size={16} />
    </button>
  );
}

function ShellInner({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { soon, toggleCreate, createOpen } = useUI();
  const rail = useStoredString(RAIL_KEY, "0") === "1";
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLElement>(null);

  const active = pathname === "/" ? "home" : pathname.startsWith("/clients") ? "clients" : pathname.startsWith("/requests") ? "requests" : "";

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

  return (
    <div className="app">
      <header className="topbar">
        <ErrorBoundary fallback={<span className="brand"><span className="brand-mark">Q</span><span className="brand-name">Quality First Turf</span></span>}>
          <Brand />
        </ErrorBoundary>
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
        <button className="icon-btn" type="button" aria-label="Messages" onClick={() => soon("Messages")}>
          <Icon name="message" size={24} />
        </button>
        <button className="icon-btn" type="button" aria-label="Notifications" onClick={() => soon("Notifications")}>
          <Icon name="bell" size={24} />
          <span className="badge">3</span>
        </button>
        <button className="icon-btn" type="button" aria-label="Settings" onClick={() => soon("Settings")}>
          <Icon name="sliders" size={24} />
        </button>
      </header>

      <nav className="sidebar" aria-label="Main">
        <div className="nav">
          {NAV.map((n, i) => {
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
              return (
                <Link key={n.key} className={on ? "item active" : "item"} href={n.href} title={n.label} aria-current={on ? "page" : undefined}>
                  {inner}
                </Link>
              );
            }
            return (
              <a
                key={n.key}
                className="item soon"
                href="#"
                title={n.label}
                onClick={(e) => {
                  e.preventDefault();
                  soon(n.label);
                }}
              >
                {inner}
              </a>
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
