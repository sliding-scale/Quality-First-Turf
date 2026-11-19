# Client import (Jobber CSV) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** The first part of the Jobber import (phases.md, Launch; D-015's CSV fallback): bring a Jobber clients CSV into the CRM safely, with a dry run, de-duplication and a per-row report, so the team can move across and a final top-up run before Jobber ends (D-022) only adds the new ones.

**Conflict noted:** D-022 says import tooling is built once, at the very end, and is marked UNDER REVIEW. D-027 puts "import" in Milestone 2 and D-028 keeps Jobber working beside the CRM, so the import is built now. It is safe to run more than once: a client already here (same email or phone) is skipped and reported, never doubled or overwritten. Nothing here calls Jobber or touches the forms' Jobber code; the file is exported by us (D-015) and uploaded.

**Architecture:** `lib/clientImport.ts` (pure) reads the CSV with tolerant header names, builds client rows and marks duplicates inside the file. `convex/crm/clientImport.ts` has `preview` (a query: what would happen, writes nothing) and `run` (a mutation: does it), both taking at most 100 rows and sharing one planning function that reuses the client form's own cleaning rules (`normalizeClientInput`) so an imported client obeys the same rules as a typed one. Settings > Import data does the file, the check, the import and the report.

**Spec:** D-103 in `CRM/docs/decisions.md`. Assumptions (D-091): a client already in the business matches on email, then on phone; a company with no person's name is a Contractor, otherwise a Homeowner, unless the tags say contractor; status comes from a Status column (Lead, Archived) else Active; Jobber's created date is kept; extra phones and emails are kept as additional ones; properties and notes beyond the first address are out of scope.

## Global Constraints
- Additive; code in `convex/crm/`; no hyphens in file names; needs the Clients module at the Edit and delete level.
- Every row that is not created is reported with its line, name and why (CRM rule 6); the file is never changed or dropped silently.
- Pure rules import no Convex or React.

## Review Focus
- Quoted fields with commas and line breaks, a byte-order mark, Windows line endings.
- A row with no name, a bad email, a 9-digit phone, a bad state: reported, others still import.
- The same person twice in the file, and again on a second run: created once.
- Another business's clients are not matched against.
- Preview writes nothing.

### Task 1: `lib/clientImport.ts` + `tests/clientImport.test.ts`.
### Task 2: `convex/crm/clientImport.ts` (`preview`, `run`) + `tests/clientImportApi.test.ts`.
### Task 3: Settings > Import data page, nav link, route, skeleton.
### Task 4: browser check with a sample file, D-103, phases.md, final checks.
