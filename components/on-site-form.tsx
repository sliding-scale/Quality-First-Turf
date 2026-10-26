"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { ArrowRight, Eye, EyeOff, Lock, Mail, Search } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { FormEvent, ReactNode, useCallback, useEffect, useId, useState } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { OnSiteVisit } from "@/components/on-site-visit";
import { RetryNextImage } from "@/components/ui/retry-image";
import { serviceLabel } from "@/lib/discovery";
import { clearSalesSession, readSalesSession, writeSalesSession } from "@/lib/sales-session";

function useSalesSession() {
  const [token, setToken] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    setToken(readSalesSession());
  }, []);

  function signIn(next: string, remember = true) {
    writeSalesSession(next, remember);
    setToken(next);
  }

  const signOut = useCallback(() => {
    clearSalesSession();
    setToken(null);
  }, []);

  return { token, signIn, signOut };
}

export function OnSiteForm({ projectId }: { projectId: string }) {
  const { token, signIn, signOut } = useSalesSession();
  const id = asProjectId(projectId);
  const data = useQuery(
    api.projects.queries.visit,
    token && id !== null ? { sessionToken: token, projectId: id } : "skip",
  );

  useEffect(() => {
    if (data !== undefined && data !== null && data.access === "signed-out") signOut();
  }, [data, signOut]);

  if (token === undefined || token === null) {
    return <SalesLogin onSignedIn={signIn} />;
  }
  if (id === null || data === null) {
    return (
      <SalesShell title="Project not found">
        <p className="sales-list__note">This project is no longer available.</p>
        <p className="sales-list__note">
          <Link className="sales-list__back" href="/visit">
            Back to all projects
          </Link>
        </p>
      </SalesShell>
    );
  }
  if (data === undefined || data.access === "signed-out") {
    return (
      <SalesShell title="Loading the project">
        <p className="sales-list__note">Opening the customer&apos;s answers and any saved measurements.</p>
      </SalesShell>
    );
  }

  return (
    <OnSiteVisit
      key={id}
      projectId={id}
      sessionToken={token}
      project={data.project}
      workAreas={data.workAreas}
    />
  );
}

const projectPageSize = 8;

export function OpenVisit() {
  const { token, signIn, signOut } = useSalesSession();
  const endSession = useMutation(api.sales.mutations.end);
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const data = useQuery(
    api.projects.queries.listForSales,
    token ? { sessionToken: token } : "skip",
  );

  useEffect(() => {
    if (data?.signedIn === false) signOut();
  }, [data, signOut]);

  if (token === undefined || token === null) return <SalesLogin onSignedIn={signIn} />;

  async function signOutAndClear() {
    try {
      if (token) await endSession({ sessionToken: token });
    } finally {
      signOut();
    }
  }

  return (
    <SalesShell
      title="Projects"
      lead="Every salesperson sees the same projects. Open the property you are visiting."
      onSignOut={() => void signOutAndClear()}
    >
      {data?.signedIn === true ? (
        <ProjectSearch
          value={query}
          onChange={(next) => {
            setQuery(next);
            setPage(0);
          }}
        />
      ) : null}
      {data === undefined ? <p className="sales-list__note">Loading projects.</p> : null}
      {data?.signedIn === true && data.projects.length === 0 ? (
        <p className="sales-list__note">
          No projects yet. They show up here after a customer submits the discovery form.
        </p>
      ) : null}
      {data?.signedIn === true && data.projects.length > 0 ? (
        <ProjectPages
          page={page}
          query={query}
          projects={data.projects}
          onPage={(next) => {
            setPage(next);
            window.scrollTo({ top: 0 });
          }}
        />
      ) : null}
    </SalesShell>
  );
}

type SalesProject = {
  projectId: string;
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
  status: string;
  createdAt: number;
};

function ProjectSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="sales-list__search">
      <span className="visually-hidden">Search projects</span>
      <Search aria-hidden="true" strokeWidth={1.75} />
      <input
        type="search"
        value={value}
        placeholder="Search by name, address, phone, or project ID"
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function projectMatches(project: SalesProject, query: string) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter((term) => term !== "");
  if (terms.length === 0) return true;
  const address = [project.street1, project.street2, project.city, project.state, project.zip]
    .filter((part) => part.trim() !== "")
    .join(" ");
  const haystack = [
    project.firstName,
    project.lastName,
    `${project.firstName} ${project.lastName}`,
    address,
    project.phone,
    project.email,
    project.projectId,
    project.status,
    ...project.services.map(serviceLabel),
  ]
    .join(" ")
    .toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

function pageNumbers(current: number, pageCount: number) {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index);
  const nearby = [0, pageCount - 1, current - 1, current, current + 1].filter(
    (page, index, pages) => page >= 0 && page < pageCount && pages.indexOf(page) === index,
  );
  nearby.sort((left, right) => left - right);
  const items: Array<number | "gap"> = [];
  for (const page of nearby) {
    const previous = items[items.length - 1];
    if (typeof previous === "number" && page - previous > 1) items.push("gap");
    items.push(page);
  }
  return items;
}

function ProjectPages({
  projects,
  page,
  query,
  onPage,
}: {
  projects: SalesProject[];
  page: number;
  query: string;
  onPage: (page: number) => void;
}) {
  const matches = projects.filter((project) => projectMatches(project, query));
  const pageCount = Math.max(1, Math.ceil(matches.length / projectPageSize));
  const current = Math.min(page, pageCount - 1);
  const start = current * projectPageSize;
  const visible = matches.slice(start, start + projectPageSize);

  if (matches.length === 0) {
    return (
      <p className="sales-list__note">No projects match that search. Try a name, address, or project ID.</p>
    );
  }

  return (
    <>
        <ul className="sales-list__cards">
          {visible.map((project) => {
            const address = [project.street1, project.street2, project.city, project.state, project.zip]
              .filter((part) => part.trim() !== "")
              .join(", ");
            const when = new Date(project.createdAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            });
            const name = `${project.firstName} ${project.lastName}`.trim();
            return (
              <li key={project.projectId}>
                <Link className="sales-list__card" href={`/visit/${project.projectId}`}>
                  <span className="sales-list__card-copy">
                    <strong>{name || "Unnamed customer"}</strong>
                    <span className="sales-list__id">Project ID {project.projectId}</span>
                    {address !== "" ? <span>{address}</span> : null}
                    {project.phone.trim() !== "" ? <span>{project.phone}</span> : null}
                    <span>
                      {project.services.length > 0
                        ? project.services.map(serviceLabel).join(", ")
                        : "No services yet"}
                    </span>
                    <span
                      className={
                        project.status === "needs attention"
                          ? "sales-list__status sales-list__status--attention"
                          : "sales-list__status"
                      }
                    >
                      {project.status} · {when}
                    </span>
                  </span>
                  <ArrowRight aria-hidden="true" strokeWidth={2} />
                </Link>
              </li>
            );
          })}
        </ul>
        <nav className="sales-list__pages" aria-label="Project pages">
          <button type="button" disabled={current === 0} onClick={() => onPage(current - 1)}>
            Previous
          </button>
          <div className="sales-list__page-cluster">
            <div className="sales-list__page-numbers">
              {pageNumbers(current, pageCount).map((item, index) =>
                item === "gap" ? (
                  <span key={`gap-${index}`} className="sales-list__page-gap" aria-hidden="true">
                    …
                  </span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    aria-label={`Page ${item + 1}`}
                    aria-current={item === current ? "page" : undefined}
                    onClick={() => onPage(item)}
                  >
                    {item + 1}
                  </button>
                ),
              )}
            </div>
            <span>
              Page {current + 1} of {pageCount}
            </span>
          </div>
          <button
            type="button"
            disabled={current === pageCount - 1}
            onClick={() => onPage(current + 1)}
          >
            Next
          </button>
        </nav>
    </>
  );
}

function SalesShell({
  title,
  lead,
  onSignOut,
  children,
}: {
  title: string;
  lead?: string;
  onSignOut?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="sales-list">
      <header className="sales-list__header">
        <Link className="brand-mark" href="/visit">
          <RetryNextImage
            className="brand-mark__logo"
            src="/brand/logo-mark.png"
            alt="Quality First Turf"
            width={771}
            height={605}
            priority
          />
        </Link>
        {onSignOut ? (
          <button type="button" className="sales-list__signout" onClick={onSignOut}>
            Sign out
          </button>
        ) : null}
      </header>
      <main className="sales-list__main">
        <h1>{title}</h1>
        {lead ? <p className="sales-list__lead">{lead}</p> : null}
        {children}
      </main>
    </div>
  );
}

function SalesLogin({ onSignedIn }: { onSignedIn: (token: string, remember?: boolean) => void }) {
  const login = useAction(api.sales.login.login);
  const emailErrorId = useId();
  const passwordErrorId = useId();
  const formErrorId = useId();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const nextEmail = email.trim();
    const nextEmailError = emailProblem(nextEmail);
    const nextPasswordError = password.trim() === "" ? "Enter your password." : null;
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    setError(null);
    if (nextEmailError !== null || nextPasswordError !== null) return;

    setPending(true);
    try {
      const result = await login({ email: nextEmail, password });
      if ("error" in result) {
        setError(
          result.error === "unconfigured"
            ? "Sales sign-in is not set up yet."
            : "That email or password is not recognized.",
        );
        return;
      }
      onSignedIn(result.token, remember);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Sign-in could not be completed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="sales-login">
      <div className="sales-login__stage">
        <form
          className="sales-login__card"
          onSubmit={onSubmit}
          noValidate
          aria-describedby={error !== null ? formErrorId : undefined}
        >
          <Image
            className="sales-login__logo"
            src="/brand/logo-mark.png"
            alt="Quality First Turf"
            width={771}
            height={605}
            priority
          />
          <h1>Welcome Back</h1>
          <p className="sales-login__lead">
            Sign in to access your account and continue your journey with Quality First Turf.
          </p>

          <div className={emailError !== null ? "sales-login__field is-invalid" : "sales-login__field"}>
            <label htmlFor="sales-email">Email</label>
            <div className="sales-login__control">
              <Mail aria-hidden="true" strokeWidth={1.75} />
              <input
                id="sales-email"
                type="email"
                autoComplete="username"
                inputMode="email"
                placeholder="Enter your email address"
                value={email}
                aria-invalid={emailError !== null}
                aria-describedby={emailError !== null ? emailErrorId : undefined}
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (emailError !== null) setEmailError(null);
                }}
              />
            </div>
            {emailError !== null ? (
              <p id={emailErrorId} className="sales-login__field-error">
                {emailError}
              </p>
            ) : null}
          </div>

          <div className={passwordError !== null ? "sales-login__field is-invalid" : "sales-login__field"}>
            <label htmlFor="sales-password">Password</label>
            <div className="sales-login__control">
              <Lock aria-hidden="true" strokeWidth={1.75} />
              <input
                id="sales-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                aria-invalid={passwordError !== null}
                aria-describedby={passwordError !== null ? passwordErrorId : undefined}
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (passwordError !== null) setPasswordError(null);
                }}
              />
              <button
                type="button"
                className="sales-login__reveal"
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((current) => !current)}
              >
                {showPassword ? <EyeOff aria-hidden="true" strokeWidth={1.75} /> : <Eye aria-hidden="true" strokeWidth={1.75} />}
              </button>
            </div>
            {passwordError !== null ? (
              <p id={passwordErrorId} className="sales-login__field-error">
                {passwordError}
              </p>
            ) : null}
          </div>

          <div className="sales-login__options">
            <label className="sales-login__remember" htmlFor="sales-remember">
              <input
                id="sales-remember"
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
              />
              Remember me
            </label>
          </div>

          {error !== null ? (
            <p id={formErrorId} className="sales-login__alert" role="alert">
              {error}
            </p>
          ) : null}

          <button type="submit" className="sales-login__submit" disabled={pending} aria-busy={pending}>
            {pending ? "Signing in" : "Sign In"}
            {pending ? null : <ArrowRight aria-hidden="true" strokeWidth={2} />}
          </button>
        </form>
      </div>
    </div>
  );
}

function emailProblem(value: string) {
  if (value === "") return "Enter your email address.";
  const at = value.indexOf("@");
  const domain = at > 0 ? value.slice(at + 1) : "";
  if (at < 1 || !domain.includes(".") || domain.startsWith(".") || domain.endsWith(".")) {
    return "Enter an email address with a domain, such as name@company.com.";
  }
  return null;
}

function asProjectId(value: string): Id<"projects"> | null {
  if (!/^[a-z0-9]{20,}$/.test(value)) return null;
  return value as Id<"projects">;
}
