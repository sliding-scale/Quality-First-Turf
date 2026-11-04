# Quality First Turf

Monorepo for the Quality First Turf projects. Each app is self-contained, with its own dependencies, env files and tooling. Both apps share **one Convex deployment**, whose code lives in [`convex/`](convex) at the repo root. Install dependencies once at the root (`npm install`, npm workspaces); run app scripts from inside the app folder.

| Folder | What it is | Domain |
| --- | --- | --- |
| [`forms/`](forms) | The **live** customer-intake and on-site-visit app (Next.js, Convex, Jobber push). Has its own `CLAUDE.md` with handoff rules. | `forms.qualityfirstturf.com` |
| [`CRM/`](CRM) | The CRM that will replace Jobber. Docs and mockups so far; no code scaffolded yet. | `launchpad.qualityfirstturf.com` |

Jobber keeps working in full until the CRM is complete. See [`CLAUDE.md`](CLAUDE.md) for the plan and the rules for working here, and [`CRM/docs/decisions.md`](CRM/docs/decisions.md) for the decisions behind it.
