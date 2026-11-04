<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

## The project is live: handoff rules (read every session)

Quality First Turf has been handed off to the client. Mistakes now reach a real customer. Status, open items and upsells are in `docs/project-status.md`.

**After EVERY change you make, end your final message with this reminder to the user:**

1. Run `npx convex deploy` so production gets the change. Code that is only on the dev deployment is not live.
2. Delete test data from Convex (projects, work areas, sessions, uploaded photos made while testing).
3. Delete test data from Jobber (clients, requests, quotes, assessments).
4. Check that Jobber is the client's official account, not the personal testing one.

Why: at handoff the Jobber connection was left on the personal testing account and Convex was not moved to production, which cost the client's trust. Never run `npx convex deploy`, or touch production data, without the user's explicit go-ahead.
