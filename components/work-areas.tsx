"use client";

import { Dispatch, SetStateAction } from "react";
import { Id } from "@/convex/_generated/dataModel";

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
      return { error: `Name work area ${index + 1}.`, workAreas: null };
    }
    const length = optionalNumber(area.length);
    const width = optionalNumber(area.width);
    if (length === "invalid" || width === "invalid") {
      return {
        error: `Enter a length and width for ${label}, or leave both blank.`,
        workAreas: null,
      };
    }
    const typedQuantity = optionalNumber(area.quantity);
    if (typedQuantity === "invalid") {
      return { error: `Enter a quantity for ${label}, or leave it blank.`, workAreas: null };
    }
    const quantity =
      typedQuantity ??
      (length !== null && width !== null ? length * width : null);
    workAreas.push({
      label,
      length,
      width,
      quantity,
      notes: area.notes.trim(),
      photoIds: area.photoIds,
    });
  }
  return { error: null, workAreas };
}

function optionalNumber(value: string): number | null | "invalid" {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return "invalid";
  return parsed;
}

export function WorkAreas({
  areas,
  onChange,
  onPhoto,
}: {
  areas: WorkAreaDraft[];
  onChange: Dispatch<SetStateAction<WorkAreaDraft[]>>;
  onPhoto: (index: number, file: File) => void;
}) {
  function update(index: number, partial: Partial<WorkAreaDraft>) {
    onChange((current) =>
      current.map((area, areaIndex) => (areaIndex === index ? { ...area, ...partial } : area)),
    );
  }

  return (
    <section className="form-panel">
      <h2>Work areas</h2>
      <p className="muted">
        Add each area you measured. Length and width are optional. A quantity can be a count or the square feet.
      </p>
      {areas.map((area, index) => (
        <div key={index} className="follow-block">
          <div className="field-grid">
            <div className="form-field span-2">
              <label htmlFor={`area-${index}-label`}>Area name</label>
              <input
                id={`area-${index}-label`}
                value={area.label}
                onChange={(event) => update(index, { label: event.target.value })}
              />
            </div>
            <div className="form-field">
              <label htmlFor={`area-${index}-length`}>Length</label>
              <input
                id={`area-${index}-length`}
                type="number"
                value={area.length}
                onChange={(event) => update(index, { length: event.target.value })}
              />
            </div>
            <div className="form-field">
              <label htmlFor={`area-${index}-width`}>Width</label>
              <input
                id={`area-${index}-width`}
                type="number"
                value={area.width}
                onChange={(event) => update(index, { width: event.target.value })}
              />
            </div>
            <div className="form-field">
              <label htmlFor={`area-${index}-quantity`}>Quantity</label>
              <input
                id={`area-${index}-quantity`}
                type="number"
                value={area.quantity}
                onChange={(event) => update(index, { quantity: event.target.value })}
              />
            </div>
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
