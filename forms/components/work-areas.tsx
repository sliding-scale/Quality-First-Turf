"use client";

import { TextField, type TextFieldProps } from "@/components/ui/fields";
import { Dispatch, SetStateAction } from "react";
import { Id } from "@/convex/_generated/dataModel";
import RetryImage from "@/components/ui/retry-image";
import { PhotoPicker } from "@/components/ui/inputs";

export type WorkAreaDraft = {
  label: string;
  length: string;
  width: string;
  quantity: string;
  notes: string;
  photoIds: Id<"_storage">[];
  photoUrls: (string | null)[];
  service?: string;
  installType?: string;
  /** The pieces measured on site; `quantity` holds their total. */
  sections?: { length: string; width: string; size: string }[];
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
    service?: string;
    installType?: string;
    sections?: { length: string; width: string; size: string }[];
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
    const length = optionalNumber(area.length);
    const width = optionalNumber(area.width);
    if (length === "invalid" || width === "invalid") {
      return {
        error: `Enter the length and width for ${label} as numbers, or leave them blank.`,
        fieldId: `area-${index}-length`,
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
      length,
      width,
      quantity,
      notes: area.notes.trim(),
      photoIds: area.photoIds,
      ...(area.service === undefined ? {} : { service: area.service }),
      ...(area.installType === undefined ? {} : { installType: area.installType }),
      ...(area.sections === undefined ? {} : { sections: area.sections }),
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
              placeholder="e.g. Front lawn"
              value={area.label}
              error={problems[`area-${index}-label`]}
              className="span-2"
              onChange={(value) => update(index, { label: value })}
            />
            <AreaField
              id={`area-${index}-quantity`}
              label="Square feet"
              stepper={50}
              placeholder="e.g. 450"
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
                placeholder="Slope, drainage, obstacles"
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
                <RetryImage key={area.photoIds[photoIndex]} src={url} alt="" />
              ),
            )}
          </div>
          <div className="button-row">
            <PhotoPicker className="button button--outline" onFile={(file) => onPhoto(index, file)}>
Add photo
</PhotoPicker>
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

function AreaField(props: Omit<TextFieldProps, "variant">) {
  return <TextField variant="form" {...props} />;
}
