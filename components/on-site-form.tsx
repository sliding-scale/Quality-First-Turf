"use client";

import { useQuery } from "convex/react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { projectToForm } from "@/lib/discovery";
import { DiscoveryForm, FormShell } from "@/components/discovery-form";
import { emptyWorkArea, WorkAreaDraft } from "@/components/work-areas";

export function OnSiteForm({ projectId }: { projectId: string }) {
  const id = asProjectId(projectId);
  const data = useQuery(api.projects.queries.visit, id === null ? "skip" : { projectId: id });

  if (id === null) {
    return (
      <FormShell>
        <div className="form-intro">
          <h1>Project not found</h1>
          <p>Check the reference and open the visit link again.</p>
        </div>
      </FormShell>
    );
  }
  if (data === undefined) {
    return (
      <FormShell>
        <p>Loading the project.</p>
      </FormShell>
    );
  }
  if (data === null) {
    return (
      <FormShell>
        <div className="form-intro">
          <h1>Project not found</h1>
          <p>Check the reference and open the visit link again.</p>
        </div>
      </FormShell>
    );
  }

  const loaded = projectToForm(data.project);
  return (
    <DiscoveryForm
      key={id}
      visit={{
        projectId: id,
        initialState: loaded.form,
        visitNote: loaded.visitNote,
        areas: draftsFor(data.workAreas, data.project.measurements),
      }}
    />
  );
}

export function OpenVisit() {
  const router = useRouter();
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = asProjectId(reference.trim());
    if (id === null) {
      setError("Enter the project reference from the customer's form.");
      return;
    }
    router.push(`/visit/${id}`);
  }

  return (
    <FormShell>
      <p className="eyebrow">On site</p>
      <div className="form-intro">
        <h1>Open a project</h1>
        <p>Paste the reference from the customer's form. This opens that property only.</p>
      </div>
      <form className="form-stack" onSubmit={onSubmit}>
        <div className="form-field">
          <label htmlFor="project-reference">Project reference</label>
          <input
            id="project-reference"
            value={reference}
            onChange={(event) => setReference(event.target.value)}
          />
        </div>
        {error !== null ? (
          <p className="form-alert" role="alert">
            {error}
          </p>
        ) : null}
        <div className="button-row">
          <button type="submit" className="button">
            Open project
          </button>
        </div>
      </form>
    </FormShell>
  );
}

function asProjectId(value: string): Id<"projects"> | null {
  if (!/^[a-z0-9]{20,}$/.test(value)) return null;
  return value as Id<"projects">;
}

function draftsFor(
  workAreas: {
    label: string;
    length: number | null;
    width: number | null;
    quantity: number | null;
    notes: string;
    photoIds: Id<"_storage">[];
    photoUrls: (string | null)[];
  }[],
  measurements: {
    label: string;
    length: number | null;
    width: number | null;
    squareFeet: number | null;
    linearFeet: number | null;
  }[],
): WorkAreaDraft[] {
  if (workAreas.length > 0) {
    return workAreas.map((area) => ({
      label: area.label,
      length: area.length === null ? "" : String(area.length),
      width: area.width === null ? "" : String(area.width),
      quantity: area.quantity === null ? "" : String(area.quantity),
      notes: area.notes,
      photoIds: area.photoIds,
      photoUrls: area.photoUrls,
    }));
  }
  if (measurements.length === 0) return [emptyWorkArea("Area 1")];
  return measurements.map((measurement) => ({
    label: measurement.label,
    length: measurement.length === null ? "" : String(measurement.length),
    width: measurement.width === null ? "" : String(measurement.width),
    quantity:
      measurement.squareFeet !== null
        ? String(measurement.squareFeet)
        : measurement.linearFeet !== null
          ? String(measurement.linearFeet)
          : "",
    notes: "",
    photoIds: [],
    photoUrls: [],
  }));
}
