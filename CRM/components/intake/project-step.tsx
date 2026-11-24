"use client";

import { Dog, Flag, House, LayoutGrid, Sparkles, Trees, type LucideIcon } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import {
  fieldIdFor,
  projectBudgets,
  projectGoals,
  projectScopes,
  projectSizes,
  projectTimelines,
  projectTypes,
  serviceLabel,
  yardPlaces,
  type ChoiceOption,
  type DiscoveryState,
  type ProjectAnswers,
} from "@/convex/shared/discovery";
import { RequiredStar } from "./fields";

/* The "Your project" questions (D-087), part of the first page with the client's details (client notes, 2026-11-20), and the "Where in your yard?"
   question on the Questions step. This is the CRM's copy (D-021), kept in step with forms/components/project-step.tsx by hand. */

const scopeIcons: Record<string, LucideIcon> = {
  "Front yard": House,
  Backyard: Trees,
  "Side yard / Dog run": Dog,
  "Putting green": Flag,
  "Patio / Pavers": LayoutGrid,
  "Complete landscape redesign": Sparkles,
};

type Problems = Record<string, string>;

function Group({ id, legend, hint, error, required, children }: { id: string; legend: string; hint?: string; error?: string; required: boolean; children: React.ReactNode }) {
  return (
    <fieldset className="intake-group pj-group" id={id} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined}>
      <legend>
        {legend}
        {required ? <RequiredStar /> : null}
        {hint ? <span className="pj-hint">{hint}</span> : null}
      </legend>
      {error ? <p id={`${id}-error`} className="field-error" role="alert">{error}</p> : null}
      {children}
    </fieldset>
  );
}

function Options({ name, options, value, invalid, onPick }: { name: string; options: ChoiceOption[]; value: string; invalid: boolean; onPick: (value: string) => void }) {
  return (
    <div className="pj-options" role="radiogroup">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <label key={option.value} className={`pj-option${selected ? " is-selected" : ""}${invalid ? " is-invalid" : ""}`}>
            <input className="visually-hidden" type="radio" name={name} value={option.value} checked={selected} onChange={() => onPick(option.value)} />
            <span className="pj-option__text">
              <strong>{option.title}</strong>
              {option.detail ? <small>{option.detail}</small> : null}
            </span>
            <span className="simple-audience__radio" aria-hidden="true"><span /></span>
          </label>
        );
      })}
    </div>
  );
}

export function ProjectFields({
  form,
  problems,
  onProject,
  required = true,
}: {
  form: DiscoveryState;
  problems: Problems;
  onProject: (partial: Partial<ProjectAnswers>) => void;
  /** The customer form requires every answer. New Request, filled in by staff who may not have asked yet, does not. */
  required?: boolean;
}) {
  const { project } = form;
  return (
    <div className="intake-fields">
      <Group id="project-type" required={required} legend="Is this a residential or commercial project?" error={problems["project-type"]}>
        <Options name="project-type" options={projectTypes} value={project.type} invalid={Boolean(problems["project-type"])} onPick={(type) => onProject({ type })} />
      </Group>
      <Group id="project-scope" required={required} legend="What are we transforming?" hint="Choose all that apply" error={problems["project-scope"]}>
        <div className="pj-chips">
          {projectScopes.map((scope) => {
            const selected = project.scope.includes(scope);
            const Icon = scopeIcons[scope] ?? Sparkles;
            return (
              <label key={scope} className={`pj-chip${selected ? " is-selected" : ""}`}>
                <input
                  className="visually-hidden"
                  type="checkbox"
                  checked={selected}
                  onChange={() => onProject({ scope: selected ? project.scope.filter((item) => item !== scope) : [...project.scope, scope] })}
                />
                <span className="pj-chip__icon"><Icon strokeWidth={1.75} aria-hidden="true" /></span>
                <span>{scope}</span>
              </label>
            );
          })}
        </div>
      </Group>
      <Group id="project-size" required={required} legend="Roughly how big is the space?" error={problems["project-size"]}>
        <Options name="project-size" options={projectSizes} value={project.size} invalid={Boolean(problems["project-size"])} onPick={(size) => onProject({ size })} />
      </Group>
      <Group id="project-goal" required={required} legend="What is the main goal for your new yard?" error={problems["project-goal"]}>
        <Options name="project-goal" options={projectGoals} value={project.goal} invalid={Boolean(problems["project-goal"])} onPick={(goal) => onProject({ goal })} />
      </Group>
      <Group id="project-timeline" required={required} legend="When are you hoping to enjoy your new yard?" error={problems["project-timeline"]}>
        <Options name="project-timeline" options={projectTimelines} value={project.timeline} invalid={Boolean(problems["project-timeline"])} onPick={(timeline) => onProject({ timeline })} />
      </Group>
      <Group id="project-budget" required={required} legend="What is your target investment range for this project?" error={problems["project-budget"]}>
        <Options name="project-budget" options={projectBudgets} value={project.budget} invalid={Boolean(problems["project-budget"])} onPick={(budget) => onProject({ budget })} />
      </Group>
    </div>
  );
}

/** "Where in your yard is this?" for one service, on the Questions step. More than one place can be chosen. */
export function WhereQuestion({
  service,
  form,
  setForm,
  problems,
  clearProblem,
}: {
  service: string;
  form: DiscoveryState;
  setForm: Dispatch<SetStateAction<DiscoveryState>>;
  problems: Problems;
  clearProblem: (id: string) => void;
}) {
  const id = fieldIdFor("where", service);
  const chosen = form.where[service] ?? [];
  const error = problems[id];
  return (
    <fieldset className="intake-group pj-group pj-where" id={id} aria-invalid={error ? true : undefined}>
      <legend>
        Where in your yard is this?
        <span className="pj-hint">Choose all that apply</span>
      </legend>
      {error ? <p className="field-error" role="alert">{error}</p> : null}
      <div className="pj-places" aria-label={`Where ${serviceLabel(service)} goes`}>
        {yardPlaces.map((place) => {
          const selected = chosen.includes(place);
          return (
            <label key={place} className={`pj-place${selected ? " is-selected" : ""}`}>
              <input
                className="visually-hidden"
                type="checkbox"
                checked={selected}
                onChange={() => {
                  clearProblem(id);
                  setForm((current) => {
                    const now = current.where[service] ?? [];
                    return { ...current, where: { ...current.where, [service]: selected ? now.filter((item) => item !== place) : [...now, place] } };
                  });
                }}
              />
              <span>{place}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
