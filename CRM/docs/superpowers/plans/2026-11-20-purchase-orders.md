# Purchase orders and material readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** The rest of PRD 4.4: record purchase orders and material delivery dates, and track material readiness before construction begins.

**Architecture:** A `purchaseOrders` table (one row per order, its lines inside the row). Orders are made from a project's takeoff: one draft per supplier for whatever still has to be ordered (the takeoff's "to order" after stock, less what other live orders already cover). Readiness is computed, never stored: each takeoff line is In stock, Not ordered, Ordered (with the expected date) or Delivered, from the quantities on its non-cancelled orders. No stage guard: the PRD asks to track readiness, not to block on it.

**Spec:** D-100 in `CRM/docs/decisions.md` (assumptions by the golden rule, D-091: statuses Draft, Ordered, Delivered, Cancelled; a number like PO-<project code>-<n>).

## Global Constraints
- Additive schema; CRM code in `convex/crm/`; no hyphens in file names; money is whole cents; dates are UTC midnight.
- Preplanning module (view/edit); unit costs show only with the Prices module.
- Pure rules in `convex/crm/lib/purchaseOrders.ts`, no Convex or React imports.

## Review Focus
- A line already fully covered by a live order is not ordered twice; a cancelled order covers nothing.
- A takeoff line deleted after ordering does not break the list or readiness.
- Delivered needs an order that was Ordered; Cancelled can be undone only by making a new order.
- Expected date before the order date refused is not required, but a delivered date is set when marked delivered.
- A project that is not Closed Won has no orders.

### Task 1: `lib/purchaseOrders.ts`: `toOrderQty`, `lineReadiness`, `readinessOf`, `nextStatusProblem`; tests in `CRM/tests/purchaseOrders.test.ts`.
### Task 2: backend `convex/crm/purchaseOrders.ts` (`list`, `createFromTakeoff`, `save`, `setStatus`, `remove`) and schema; tests in `CRM/tests/purchaseOrdersApi.test.ts`.
### Task 3: UI: a Purchase orders section and a readiness chip on the project's Takeoff tab (`purchase-orders.tsx`).
### Task 4: verify, record D-100, update phases.md, final checks.
