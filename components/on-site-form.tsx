"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { OnSiteVisit, VisitPlain } from "@/components/on-site-visit";
import { serviceLabel } from "@/lib/discovery";
import { clearSalesSession, readSalesSession, writeSalesSession } from "@/lib/sales-session";

function useSalesSession() {
  const [token, setToken] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    setToken(readSalesSession());
  }, []);

  function signIn(next: string) {
    writeSalesSession(next);
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
      <VisitPlain title="Project not found">
        <p>This project is no longer available.</p>
        <p>
          <Link href="/visit">Back to all projects</Link>
        </p>
      </VisitPlain>
    );
  }
  if (data === undefined || data.access === "signed-out") {
    return (
      <VisitPlain title="Loading the project">
        <p>Opening the customer&apos;s answers and any saved measurements.</p>
      </VisitPlain>
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

export function OpenVisit() {
  const { token, signIn, signOut } = useSalesSession();
  const endSession = useMutation(api.sales.mutations.end);
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
    <VisitPlain title="Projects" wide>
      <div className="visit-list-head">
        <p>Every salesperson sees the same projects. Open the property you are visiting.</p>
        <button type="button" className="visit-secondary" onClick={() => void signOutAndClear()}>
          Sign out
        </button>
      </div>
      {data === undefined ? <p>Loading projects.</p> : null}
      {data?.signedIn === true && data.projects.length === 0 ? (
        <p>No projects yet. They show up here after a customer submits the discovery form.</p>
      ) : null}
      {data?.signedIn === true && data.projects.length > 0 ? (
        <ul className="visit-projects">
          {data.projects.map((project) => {
            const address = [project.street1, project.city, project.state, project.zip]
              .filter((part) => part.trim() !== "")
              .join(", ");
            const when = new Date(project.createdAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            });
            return (
              <li key={project.projectId}>
                <Link className="visit-project" href={`/visit/${project.projectId}`}>
                  <strong>
                    {project.firstName} {project.lastName}
                  </strong>
                  <span>{address}</span>
                  <span>
                    {project.services.length > 0
                      ? project.services.map(serviceLabel).join(", ")
                      : "No services yet"}
                  </span>
                  <span className="visit-status">
                    {project.status} · {when}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </VisitPlain>
  );
}

function SalesLogin({ onSignedIn }: { onSignedIn: (token: string) => void }) {
  const login = useAction(api.sales.login.login);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await login({ email, password });
      if ("error" in result) {
        setError(
          result.error === "unconfigured"
            ? "Sales sign-in is not set up yet."
            : "That email or password is not recognized.",
        );
        return;
      }
      onSignedIn(result.token);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Sign-in could not be completed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <VisitPlain title="Sales sign-in">
      <p>Sign in to see every project. The sales team shares this login.</p>
      <form className="form-stack" onSubmit={onSubmit}>
        <div className="form-field">
          <label htmlFor="sales-email">Email</label>
          <input
            id="sales-email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="form-field">
          <label htmlFor="sales-password">Password</label>
          <input
            id="sales-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        {error !== null ? (
          <p className="form-alert" role="alert">
            {error}
          </p>
        ) : null}
        <div className="button-row">
          <button type="submit" className="visit-primary" disabled={pending}>
            {pending ? "Signing in" : "Sign in"}
          </button>
        </div>
      </form>
    </VisitPlain>
  );
}

function asProjectId(value: string): Id<"projects"> | null {
  if (!/^[a-z0-9]{20,}$/.test(value)) return null;
  return value as Id<"projects">;
}
