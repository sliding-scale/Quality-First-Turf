"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useEffect } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { OnSiteVisit } from "@/components/on-site-visit";
import { VisitSkeleton } from "@/components/sales-skeleton";
import { useSales } from "@/components/visit-shell";

/** The project pane of `/visit/[code]`; the shell supplies the session and the project list. */
export function OnSiteForm({ projectId }: { projectId: string }) {
  const { token, signOut } = useSales();
  const isCode = /^[A-Za-z0-9]{3}-?[A-Za-z0-9]{3}$/.test(projectId);
  const resolved = useQuery(
    api.projects.queries.resolveCode,
    isCode ? { sessionToken: token, code: projectId } : "skip",
  );
  const id = isCode ? (resolved ?? null) : asProjectId(projectId);
  const data = useQuery(
    api.projects.queries.visit,
    id !== null ? { sessionToken: token, projectId: id } : "skip",
  );

  useEffect(() => {
    if (data !== undefined && data !== null && data.access === "signed-out") signOut();
  }, [data, signOut]);

  if (isCode && resolved === undefined) return <VisitSkeleton />;
  if (id === null || data === null) {
    return (
      <div className="visit-empty">
        <h1>Project not found</h1>
        <p>This project is no longer available.</p>
        <Link className="visit-empty__link" href="/visit">
          Back to projects
        </Link>
      </div>
    );
  }
  if (data === undefined || data.access === "signed-out") return <VisitSkeleton />;

  return (
    <OnSiteVisit
      key={id}
      projectId={id}
      sessionToken={token}
      project={data.project}
      workAreas={data.workAreas}
      revisions={data.revisions}
    />
  );
}

/** `/visit` with no project chosen yet. */
export function OpenVisit() {
  return (
    <div className="visit-empty">
      <h1>Choose a project</h1>
      <p>Pick a project from the list, or search by name, address or project code.</p>
    </div>
  );
}

function asProjectId(value: string): Id<"projects"> | null {
  if (!/^[a-z0-9]{20,}$/.test(value)) return null;
  return value as Id<"projects">;
}
