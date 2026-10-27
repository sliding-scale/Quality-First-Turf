"use client";

import { useMutation, useQuery } from "convex/react";
import { Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useMemo,
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

  const projects = useMemo(
    () => (data?.signedIn === true ? data.projects.filter((project) => matches(project, query)) : []),
    [data, query],
  );

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

      <label className="visit-sidebar__search">
        <span className="visually-hidden">Search projects</span>
        <Search aria-hidden="true" strokeWidth={1.75} />
        <input
          type="search"
          value={query}
          placeholder="Search name, code or address"
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      <nav className="visit-sidebar__list" aria-label="Project list">
        {data === undefined ? (
          Array.from({ length: 6 }, (_, index) => (
            <span key={index} className="visit-sidebar__item sales-skeleton__card" aria-hidden="true">
              <span className="sales-skeleton__line sales-skeleton__line--title" />
              <span className="sales-skeleton__line sales-skeleton__line--meta" />
            </span>
          ))
        ) : projects.length === 0 ? (
          <p className="visit-sidebar__note">
            {query === ""
              ? "No projects yet. They appear here after a customer submits the form."
              : "No projects match that search."}
          </p>
        ) : (
          <>
            <ProjectGroup
              title="Pending"
              hint="Incoming requests waiting for a visit"
              projects={projects.filter((project) => project.visitedAt === null)}
              activeCode={activeCode}
            />
            <ProjectGroup
              title="Completed"
              hint="Visit done"
              projects={projects
                .filter((project) => project.visitedAt !== null)
                .sort((left, right) => (right.visitedAt ?? 0) - (left.visitedAt ?? 0))}
              activeCode={activeCode}
            />
          </>
        )}
        {data?.signedIn === true && data.truncated ? (
          <p className="visit-sidebar__note">Showing the latest 200. Search to find older ones.</p>
        ) : null}
      </nav>
    </aside>
  );
}

type GroupedProject = ListedProject & { visitedAt: number | null };

function ProjectGroup({
  title,
  hint,
  projects,
  activeCode,
}: {
  title: string;
  hint: string;
  projects: GroupedProject[];
  activeCode: string | null;
}) {
  return (
    <section className="visit-sidebar__group" aria-label={`${title} projects`}>
      <h2 className="visit-sidebar__group-title">
        {title}
        <span>{projects.length}</span>
      </h2>
      {projects.length === 0 ? (
        <p className="visit-sidebar__note">{`None. ${hint}.`}</p>
      ) : (
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
