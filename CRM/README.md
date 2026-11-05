# Quality First Turf CRM

A custom CRM that replaces Jobber for Quality First Turf. It covers the full project lifecycle: enquiry, sales, preplanning, installation, invoicing and closure, in one system built around a single central record per customer project.

## Status
Brainstorming and design. No application code yet. The UI/UX is being designed first, one step at a time, to be built on sample data. See [phases.md](docs/phases.md) for the plan.

## Documents
| File | Purpose |
|------|---------|
| [prd.md](docs/prd.md) | Requirements (transcribed from the client PRD PDF) |
| [phases.md](docs/phases.md) | Ordered build plan and checklists |
| [decisions.md](docs/decisions.md) | Decisions made, open questions, client inputs |
| [architecture.md](docs/architecture.md) | Planned directory layout and where things live |
| [CLAUDE.md](CLAUDE.md) | Instructions for Claude Code working in this repo |
| [client-answers.md](docs/client-answers.md) | What the client has told us, what is held, what is ours |
| docs/client-questions-later.docx | Backlog of valid client questions. None are being asked now; ask only when one blocks the build |

The original source is `docs/Quality First Turf – CRM Development PRD.pdf`. Superpowers skills are installed in `.claude/skills/`.

## The app
Next.js 16 on sample data (D-033): Home, Clients (search, filters, sorting, pagination, CSV export, one list per business), Client page, New/Edit client. Run `npm install` once at the repo root, then `npm run dev` in this folder. New and edited clients and notes are kept in the browser's localStorage until Convex is wired. Convex, Clerk and access control are not wired yet.

| Route | Screen |
|-------|--------|
| `/` | Home |
| `/clients` | Clients list |
| `/clients/new` | New client |
| `/clients/[id]` | Client page |
| `/clients/[id]/edit` | Edit client |

## How it is being built
- **Monorepo.** The git root is the folder above this one: `forms/` (the live intake and on-site visit app) and `CRM/` (this folder), sharing one Convex backend (D-026). The forms app is not changed without the user's go-ahead.
- **UI first.** Inside each milestone the interface is built on sample data, step by step, before the backend is wired. Phase N is PRD Milestone N.
- **Ship per milestone, Jobber stays until the end.** Each PRD milestone is completed and released in order (D-027). Jobber keeps working in full until the whole CRM is complete, then it is ended (D-028). Jobber data is pulled by us and imported (timing under review, D-022).
- **Hosting.** Vercel, one project per app. The CRM is served at `launchpad.qualityfirstturf.com`.

## Stack
- **Frontend:** Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui
- **Backend / DB:** Convex
- **Auth:** Clerk (roles stored in Convex)
- **Integrations (planned):** Google Calendar and Drive, phone/SMS provider, WhatsApp Business Platform

## Design
Heavily inspired by Jobber and minimalist: white, off-white, gray and black with Jobber's green as the accent. Kanban boards wherever there is a pipeline. Responsive on every device.

## Core idea
Every project is one record. Sales, Preplanning, Construction and Finance are pipelines it moves through, not separate records. Quotes, takeoffs, work packages, punch items, invoices and payments all attach to it.

```
Business (Quality First Turf / Construction / Patios)
   |
Client (a Jobber client: homeowner or contractor)
   |
Project  (one record, whole lifecycle)
   |-- Sales pipeline        New Request ... Closed Won / Lost
   |-- Preplanning pipeline  Ready for Preplanning ... Installs Scheduled
   |-- Construction pipeline Ready to Start ... 100% Completed & Sign-off
   '-- Finance pipeline      Send Final Invoice ... Archive
```

## Roles
Admin, Sales, Office Team and Project Managers log in, and one person can hold several roles. Installers do not log in; they receive work packages by WhatsApp link. Access is enforced in Convex functions at the data level.

## Getting started
Not yet scaffolded. After Phase 0 this section will cover install, env vars (Convex, Clerk) and `npm run dev`.
