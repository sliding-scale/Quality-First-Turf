"use client";

import { Dispatch, SetStateAction } from "react";
import { Id } from "@/convex/_generated/dataModel";
import { decimalInput } from "@/lib/discovery";

export type WorkAreaDraft = {
  label: string;
  length: string;
  width: string;
  quantity: string;
  notes: string;
  photoIds: Id<"_storage">[];
  photoUrls: (string | null)[];
};

export function emptyWorkArea(label = ""): WorkAreaDraft {
  return {
    label,
    length: "",
    width: "",
    quantity: "",
    notes: "",
    photoIds: [],
    photoUrls: [],
  };
}

export function parseWorkAreas(areas: WorkAreaDraft[]): {
  error: string | null;
  fieldId: string | null;
  workAreas: {
    label: string;
    length: number | null;
    width: number | null;
    quantity: number | null;
    notes: string;
    photoIds: Id<"_storage">[];
  }[] | null;
} {
  const workAreas = [];
  for (const [index, area] of areas.entries()) {
    const label = area.label.trim();
    if (label === "") {
      return {
        error: `Name work area ${index + 1}.`,
        fieldId: `area-${index}-label`,
        workAreas: null,
      };
    }
    const quantity = optionalNumber(area.quantity);
    if (quantity === "invalid") {
      return {
        error: `Enter the square feet for ${label}, or leave it blank.`,
        fieldId: `area-${index}-quantity`,
        workAreas: null,
      };
    }
    workAreas.push({
      label,
      length: null,
      width: null,
      quantity,
      notes: area.notes.trim(),
      photoIds: area.photoIds,
    });
  }
  return { error: null, fieldId: null, workAreas };
}

function optionalNumber(value: string): number | null | "invalid" {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return "invalid";
  return parsed;
}

export function WorkAreas({
  areas,
  problems,
  onChange,
  onPhoto,
  onClear,
}: {
  areas: WorkAreaDraft[];
  problems: Record<string, string>;
  onChange: Dispatch<SetStateAction<WorkAreaDraft[]>>;
  onPhoto: (index: number, file: File) => void;
  onClear: (id: string) => void;
}) {
  function update(index: number, partial: Partial<WorkAreaDraft>) {
    onChange((current) =>
      current.map((area, areaIndex) => (areaIndex === index ? { ...area, ...partial } : area)),
    );
    if (partial.label !== undefined) onClear(`area-${index}-label`);
    if (partial.quantity !== undefined) onClear(`area-${index}-quantity`);
  }

  return (
    <section className="form-panel">
      <h2>Work areas</h2>
      <p className="muted">
        Add each area you measured. Square feet are optional.
      </p>
      {areas.map((area, index) => (
        <div key={index} className="follow-block">
          <div className="field-grid">
            <AreaField
              id={`area-${index}-label`}
              label="Area name"
              value={area.label}
              error={problems[`area-${index}-label`]}
              className="span-2"
              onChange={(value) => update(index, { label: value })}
            />
            <AreaField
              id={`area-${index}-quantity`}
              label="Square feet"
              value={area.quantity}
              error={problems[`area-${index}-quantity`]}
              numeric
              onChange={(value) => update(index, { quantity: value })}
            />
            <div className="form-field span-2">
              <label htmlFor={`area-${index}-notes`}>Area notes</label>
              <textarea
                id={`area-${index}-notes`}
                value={area.notes}
                onChange={(event) => update(index, { notes: event.target.value })}
              />
            </div>
          </div>
          <div className="photo-row">
            {area.photoUrls.map((url, photoIndex) =>
              url === null ? (
                <span key={area.photoIds[photoIndex]} className="photo-missing">
                  Photo saved
                </span>
              ) : (
                <img key={area.photoIds[photoIndex]} src={url} alt="" />
              ),
            )}
          </div>
          <div className="button-row">
            <label className="button button--outline">
              Add photo
              <input
                className="visually-hidden"
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file !== undefined) onPhoto(index, file);
                }}
              />
            </label>
            <button
              type="button"
              className="button button--outline"
              onClick={() => onChange((current) => current.filter((_, areaIndex) => areaIndex !== index))}
            >
              Remove area
            </button>
          </div>
        </div>
      ))}
      <div className="button-row">
        <button
          type="button"
          className="button button--outline"
          onClick={() =>
            onChange((current) => [...current, emptyWorkArea(`Area ${current.length + 1}`)])
          }
        >
          Add work area
        </button>
      </div>
    </section>
  );
}

function AreaField({
  id,
  label,
  value,
  error,
  numeric = false,
  className,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  numeric?: boolean;
  className?: string;
  onChange: (value: string) => void;
}) {
  const errorId = `${id}-error`;
  return (
    <div className={error ? `form-field is-invalid ${className ?? ""}` : `form-field ${className ?? ""}`}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        inputMode={numeric ? "decimal" : undefined}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange(numeric ? decimalInput(event.target.value) : event.target.value)}
      />
      {error ? (
        <p id={errorId} className="field-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
