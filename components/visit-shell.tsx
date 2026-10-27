"use client";

import { useMutation, useQuery } from "convex/react";
import { Check, ChevronLeft, ChevronRight, ListFilter, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { api } from "@/convex/_generated/api";
import { SalesLogin } from "@/components/sales-login";
import { RetryNextImage } from "@/components/ui/retry-image";
import { serviceLabel } from "@/lib/discovery";
import { formatShortCode, normalizeShortCode } from "@/lib/errors";
import {
  clearSalesSession,
  readSalesSession,
  subscribeSalesSession,
  writeSalesSession,
} from "@/lib/sales-session";

type SalesSession = { token: string; signOut: () => void };

const SalesContext = createContext<SalesSession | null>(null);

/** The signed-in staff session; only valid below `VisitShell`. */
export function useSales(): SalesSession {
  const session = useContext(SalesContext);
  if (session === null) throw new Error("useSales must be used inside VisitShell");
  return session;
}

/**
 * Everything under `/visit`: sign-in, then a persistent project list on the left
 * and the chosen project (or a prompt to choose one) on the right.
 */
export function VisitShell({ children }: { children: ReactNode }) {
  // `undefined` on the server and while hydrating, so signed-in staff never see the login flash.
  const token = useSyncExternalStore<string | null | undefined>(
    subscribeSalesSession,
    readSalesSession,
    () => undefined,
  );
  const signIn = useCallback((next: string, remember = false) => writeSalesSession(next, remember), []);
  const signOut = useCallback(() => clearSalesSession(), []);
  const pathname = usePathname();

  if (token === undefined) {
    return <div className="visit-shell" aria-busy="true" />;
  }
  if (token === null) return <SalesLogin onSignedIn={signIn} />;

  // On phones only one pane shows at a time: the list, or the project.
  const view = pathname === "/visit" ? "list" : "project";
  return (
    <SalesContext.Provider value={{ token, signOut }}>
      <div className="visit-shell" data-view={view}>
        <ProjectSidebar token={token} signOut={signOut} activeCode={pathname.split("/")[2] ?? null} />
        <div className="visit-shell__main">{children}</div>
      </div>
    </SalesContext.Provider>
  );
}

function ProjectSidebar({
  token,
  signOut,
  activeCode,
}: {
  token: string;
  signOut: () => void;
  activeCode: string | null;
}) {
  const endSession = useMutation(api.sales.mutations.end);
  const data = useQuery(api.projects.queries.listForSales, { sessionToken: token });
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);

  const projects = useMemo(
    () => (data?.signedIn === true ? data.projects.filter((project) => matches(project, query)) : []),
    [data, query],
  );
  const pending = useMemo(() => projects.filter((project) => project.visitedAt === null), [projects]);
  const completed = useMemo(
    () =>
      projects
        .filter((project) => project.visitedAt !== null)
        .sort((left, right) => (right.visitedAt ?? 0) - (left.visitedAt ?? 0)),
    [projects],
  );
  const shown = filter === "pending" ? pending : filter === "completed" ? completed : [...pending, ...completed];
  const pageCount = Math.max(1, Math.ceil(shown.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const onPage = shown.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  async function signOutAndClear() {
    try {
      await endSession({ sessionToken: token });
    } finally {
      signOut();
    }
  }

  if (data?.signedIn === false) signOut();

  return (
    <aside className="visit-sidebar" aria-label="Projects">
      <div className="visit-sidebar__head">
        <Link className="visit-sidebar__brand" href="/visit">
          <RetryNextImage
            src="/brand/logo-mark.png"
            alt="Quality First Turf"
            width={771}
            height={605}
            priority
          />
        </Link>
        <button type="button" className="visit-sidebar__signout" onClick={() => void signOutAndClear()}>
          Sign out
        </button>
      </div>

      <div className="visit-sidebar__searchbar">
        <label className="visit-sidebar__search">
          <span className="visually-hidden">Search projects</span>
          <Search aria-hidden="true" strokeWidth={1.75} />
          <input
            type="search"
            value={query}
            placeholder="Search projects"
            autoComplete="off"
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <StatusFilterMenu
          value={filter}
          counts={{ all: projects.length, pending: pending.length, completed: completed.length }}
          onChange={(next) => {
            setFilter(next);
            setPage(1);
          }}
        />
      </div>

      <nav className="visit-sidebar__list" aria-label="Project list">
        {data === undefined ? (
          Array.from({ length: 6 }, (_, index) => (
            <span key={index} className="visit-sidebar__item sales-skeleton__card" aria-hidden="true">
              <span className="sales-skeleton__line sales-skeleton__line--title" />
              <span className="sales-skeleton__line sales-skeleton__line--meta" />
            </span>
          ))
        ) : shown.length === 0 ? (
          <p className="visit-sidebar__note">
            {projects.length === 0 && query === ""
              ? "No projects yet. They appear here after a customer submits the form."
              : projects.length === 0
                ? "No projects match that search."
                : `No ${filter} projects${query === "" ? "" : " match that search"}.`}
          </p>
        ) : (
          <>
            <ProjectGroup
              title="Pending"
              total={pending.length}
              projects={onPage.filter((project) => project.visitedAt === null)}
              activeCode={activeCode}
            />
            <ProjectGroup
              title="Completed"
              total={completed.length}
              projects={onPage.filter((project) => project.visitedAt !== null)}
              activeCode={activeCode}
            />
          </>
        )}
        {data?.signedIn === true && data.truncated ? (
          <p className="visit-sidebar__note">Showing the latest 200. Search to find older ones.</p>
        ) : null}
      </nav>

      {shown.length > pageSize ? (
        <nav className="visit-pager" aria-label="Project pages">
          <button
            type="button"
            className="visit-pager__btn"
            onClick={() => setPage(currentPage - 1)}
            disabled={currentPage <= 1}
            aria-label="Previous page"
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <span className="visit-pager__text" aria-live="polite">
            {`${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, shown.length)} of ${shown.length}`}
          </span>
          <button
            type="button"
            className="visit-pager__btn"
            onClick={() => setPage(currentPage + 1)}
            disabled={currentPage >= pageCount}
            aria-label="Next page"
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </nav>
      ) : null}
    </aside>
  );
}

const pageSize = 10;

type StatusFilter = "all" | "pending" | "completed";

const filterOptions: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "completed", label: "Completed" },
];

/** The filter button inside the search bar: a small menu of All, Pending and Completed. */
function StatusFilterMenu({
  value,
  counts,
  onChange,
}: {
  value: StatusFilter;
  counts: Record<StatusFilter, number>;
  onChange: (next: StatusFilter) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (root.current !== null && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const current = filterOptions.find((option) => option.value === value)?.label ?? "All";
  return (
    <div className="visit-filter" ref={root}>
      <button
        type="button"
        className={value === "all" ? "visit-filter__btn" : "visit-filter__btn is-filtered"}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Filter projects: ${current}`}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        <ListFilter aria-hidden="true" strokeWidth={1.75} />
        {value === "all" ? null : <span className="visit-filter__label">{current}</span>}
      </button>
      {open ? (
        <div className="visit-filter__menu" role="menu" aria-label="Filter by status">
          {filterOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={value === option.value}
              className="visit-filter__option"
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              <span className="visit-filter__check">
                {value === option.value ? <Check aria-hidden="true" strokeWidth={2.5} /> : null}
              </span>
              <span>{option.label}</span>
              <span className="visit-filter__count">{counts[option.value]}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

type GroupedProject = ListedProject & { visitedAt: number | null };

function ProjectGroup({
  title,
  total,
  projects,
  activeCode,
}: {
  title: string;
  total: number;
  projects: GroupedProject[];
  activeCode: string | null;
}) {
  // A group with nothing on this page is left out; its total still shows on the pages that have it.
  if (projects.length === 0) return null;
  return (
    <section className="visit-sidebar__group" aria-label={`${title} projects`}>
      <h2 className="visit-sidebar__group-title">
        {title}
        <span>{total}</span>
      </h2>
      {(
        projects.map((project) => {
          const key = project.shortCode ?? project.projectId;
          const active = activeCode !== null && normalizeShortCode(activeCode) === normalizeShortCode(key);
          const name = `${project.firstName} ${project.lastName}`.trim() || "Unnamed customer";
          const address = [project.street1, project.city].filter((part) => part.trim() !== "").join(", ");
          return (
            <Link
              key={project.projectId}
              className={active ? "visit-sidebar__item is-active" : "visit-sidebar__item"}
              href={`/visit/${key}`}
              aria-current={active ? "page" : undefined}
            >
              <strong>{name}</strong>
              <span>
                {[formatShortCode(project.shortCode), address].filter((part) => part !== "").join(" · ")}
              </span>
            </Link>
          );
        })
      )}
    </section>
  );
}

type ListedProject = {
  projectId: string;
  shortCode: string | null;
  visitedAt: number | null;
  firstName: string;
  lastName: string;
  email: string;
  street1: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  services: string[];
};

function matches(project: ListedProject, query: string) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter((term) => term !== "");
  if (terms.length === 0) return true;
  const compact = normalizeShortCode(query);
  if (compact.length >= 3 && project.shortCode?.includes(compact)) return true;
  const haystack = [
    project.firstName,
    project.lastName,
    `${project.firstName} ${project.lastName}`,
    project.street1,
    project.street2,
    project.city,
    project.state,
    project.zip,
    project.phone,
    project.email,
    project.shortCode ?? "",
    formatShortCode(project.shortCode),
    ...project.services.map(serviceLabel),
  ]
    .join(" ")
    .toLowerCase();
  return terms.every((term) => haystack.includes(term));
}
