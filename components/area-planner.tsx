"use client";

import { Plus, X } from "lucide-react";
import {
  areaBaseName,
  areaPlaces,
  areaSizeId,
  areasTotal,
  areaTotal,
  decimalInput,
  emptyArea,
  emptySection,
  fieldIdFor,
  nextAreaId,
  workedSize,
  type AreaDraft,
  type AreaSection,
} from "@/lib/discovery";

/**
 * Lists the yards a job covers (front yard, back yard, side yard, other). Each yard is made of one
 * or more sections with a length and width; the size of every section is worked out and the yard
 * and the whole job are totalled as the customer types.
 */
export function AreaPlanner({
  areaKey,
  areas,
  onChange,
  linear = false,
  problems,
  clearProblem,
}: {
  areaKey: string;
  areas: AreaDraft[];
  onChange: (next: AreaDraft[]) => void;
  /** Linear feet (a turf strip) instead of square feet. */
  linear?: boolean;
  problems: Record<string, string>;
  clearProblem: (id: string) => void;
}) {
  // A fresh card always shows one empty yard; the list only fills in once something is typed.
  const list = areas.length > 0 ? areas : [emptyArea("a1")];
  const unit = linear ? "lin ft" : "sq ft";

  function update(areaId: string, change: (area: AreaDraft) => AreaDraft) {
    onChange(list.map((area) => (area.id === areaId ? change(area) : area)));
  }

  function updateSection(areaId: string, at: number, change: (section: AreaSection) => AreaSection) {
    update(areaId, (area) => ({
      ...area,
      sections: area.sections.map((section, index) => (index === at ? change(section) : section)),
    }));
  }

  function setDimension(areaId: string, at: number, side: "length" | "width", raw: string) {
    clearProblem(areaSizeId(areaKey, areaId, at));
    updateSection(areaId, at, (section) => {
      const before = workedSize(section);
      const next = { ...section, [side]: decimalInput(raw) };
      const after = workedSize(next);
      // Once the dimensions stop making a size, drop the figure they had produced.
      return { ...next, size: after !== null ? String(after) : before !== null ? "" : section.size };
    });
  }

  const total = areasTotal(list);
  const taken = new Set<string>(list.map((area) => area.place).filter((place) => place !== "" && place !== "Other"));

  return (
    <div className="areas" id={fieldIdFor("areas", areaKey)}>
      <p className="grass-heading">Where is the work?</p>
      <p className="areas__hint">
        Add each area on its own, like the front yard and the back yard. If an area is made of more than one
        section, add each section&apos;s {linear ? "length" : "length and width"} and we&apos;ll add them up.
      </p>

      {list.map((area, index) => {
        const named = areaBaseName(area);
        const heading = named || `Area ${index + 1}`;
        const areaSum = areaTotal(area);
        return (
          <section key={area.id} className="area-card" aria-label={heading}>
            <div className="area-card__head">
              <h4>{heading}</h4>
              {list.length > 1 ? (
                <button
                  type="button"
                  className="area-link"
                  onClick={() => onChange(list.filter((item) => item.id !== area.id))}
                >
                  Remove area
                </button>
              ) : null}
            </div>

            <div className="area-places" role="radiogroup" aria-label={`Which part of the property is ${heading}?`}>
              {areaPlaces.map((place) => {
                const chosen = area.place === place;
                const blocked = !chosen && taken.has(place);
                return (
                  <label
                    key={place}
                    className={`area-place${chosen ? " is-on" : ""}${blocked ? " is-disabled" : ""}`}
                  >
                    <input
                      type="radio"
                      name={`${areaKey}-${area.id}-place`}
                      checked={chosen}
                      disabled={blocked}
                      onChange={() => update(area.id, (current) => ({ ...current, place }))}
                      onClick={() => {
                        if (chosen) update(area.id, (current) => ({ ...current, place: "" }));
                      }}
                    />
                    <span>{place}</span>
                  </label>
                );
              })}
            </div>

            {area.place === "Other" ? (
              <div className="form-field">
                <label htmlFor={`${areaKey}-${area.id}-other`}>Name this area</label>
                <input
                  id={`${areaKey}-${area.id}-other`}
                  placeholder="e.g. Around the pool"
                  autoComplete="off"
                  maxLength={40}
                  value={area.other}
                  onChange={(event) => update(area.id, (current) => ({ ...current, other: event.target.value }))}
                />
              </div>
            ) : null}

            <div className="area-sections">
              {area.sections.map((section, at) => {
                const sizeId = areaSizeId(areaKey, area.id, at);
                const worked = workedSize(section);
                const error = problems[sizeId];
                return (
                  <div key={at} className={error ? "area-section is-invalid" : "area-section"}>
                    <p className="area-section__label">Section {at + 1}</p>
                    <div className="area-section__row">
                      {linear ? null : (
                        <>
                          <label className="area-dim" htmlFor={`${sizeId}-length`}>
                            <span>Length (ft)</span>
                            <input
                              id={`${sizeId}-length`}
                              inputMode="decimal"
                              placeholder="e.g. 20"
                              autoComplete="off"
                              value={section.length}
                              onChange={(event) => setDimension(area.id, at, "length", event.target.value)}
                            />
                          </label>
                          <span className="area-times" aria-hidden="true">
                            ×
                          </span>
                          <label className="area-dim" htmlFor={`${sizeId}-width`}>
                            <span>Width (ft)</span>
                            <input
                              id={`${sizeId}-width`}
                              inputMode="decimal"
                              placeholder="e.g. 25"
                              autoComplete="off"
                              value={section.width}
                              onChange={(event) => setDimension(area.id, at, "width", event.target.value)}
                            />
                          </label>
                          <span className="area-times" aria-hidden="true">
                            =
                          </span>
                        </>
                      )}
                      <label className="area-dim area-dim--size" htmlFor={sizeId}>
                        <span>{linear ? "Length (ft)" : "Size (sq ft)"}</span>
                        <input
                          id={sizeId}
                          inputMode="numeric"
                          placeholder={linear ? "e.g. 120" : worked !== null ? "" : "e.g. 500"}
                          autoComplete="off"
                          readOnly={worked !== null}
                          aria-invalid={error ? true : undefined}
                          value={section.size}
                          onChange={(event) => {
                            clearProblem(sizeId);
                            const size = event.target.value.replace(/\D/g, "").slice(0, 8);
                            updateSection(area.id, at, (current) => ({ ...current, size }));
                          }}
                        />
                      </label>
                      {area.sections.length > 1 ? (
                        <button
                          type="button"
                          className="area-icon"
                          aria-label={`Remove section ${at + 1} of ${heading}`}
                          onClick={() =>
                            update(area.id, (current) => ({
                              ...current,
                              sections: current.sections.filter((_, index) => index !== at),
                            }))
                          }
                        >
                          <X strokeWidth={2} aria-hidden="true" />
                        </button>
                      ) : null}
                    </div>
                    {error ? <p className="field-error">{error}</p> : null}
                  </div>
                );
              })}
            </div>

            <div className="area-card__foot">
              <button
                type="button"
                className="area-link"
                onClick={() =>
                  update(area.id, (current) => ({ ...current, sections: [...current.sections, emptySection()] }))
                }
              >
                <Plus strokeWidth={2.25} aria-hidden="true" />
                Add another section
              </button>
              <p className="area-total" aria-live="polite">
                Total for {named || `area ${index + 1}`}: <strong>{areaSum === null ? "not entered" : `${areaSum} ${unit}`}</strong>
              </p>
            </div>
          </section>
        );
      })}

      <button
        type="button"
        className="area-add"
        onClick={() => onChange([...list, emptyArea(nextAreaId(list))])}
      >
        <Plus strokeWidth={2.25} aria-hidden="true" />
        Add another area
      </button>
      {list.length > 1 && total !== null ? (
        <p className="areas__all" aria-live="polite">
          All areas together: <strong>{`${total} ${unit}`}</strong>
        </p>
      ) : null}
    </div>
  );
}
