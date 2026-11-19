# Calls and WhatsApp (by hand until connected) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** PRD 5.3's calls and PRD 5.4's WhatsApp, built the way texting was (D-097, golden rule D-091): the communication log works today with the sending done by hand, and a provider can be connected later without changing the log.

**Architecture:**
- **Calls:** a `calls` table, logged by hand ("Log a call": direction, outcome, how long, notes, against the client and optionally the project, by the signed-in user), shown in the Messages thread among the texts in time order, plus a `tel:` Call link. A Twilio voice webhook can write the same rows later.
- **WhatsApp:** `messages` gains an optional `channel` ("sms" default, or "whatsapp"). On a project's Work package Share panel, "Send by WhatsApp" opens WhatsApp with the message and the secret link filled in (`https://wa.me/<digits>?text=...`) and logs it against the project as sent by hand. With the WhatsApp Business Platform connected later, the same row is written by the sender.

**Spec:** D-102 in `CRM/docs/decisions.md`. Assumptions: a WhatsApp number needs a country code (we normalise to E.164 as texts do); the installer is reached on a crew's phone or a number typed in.

## Global Constraints
- Additive schema; code in `convex/crm/`; no hyphens in file names; the Messages module governs both (view to read, edit to log or send); the work-package link needs Preplanning view on the project.
- No secret goes into a log: the link's token is part of the message text, so the log keeps it; that is the user's own message to the installer.

## Review Focus
- A call needs a number or a client with one; a client or project from another business is refused.
- A call time in the future is refused; an absurd duration is refused.
- A WhatsApp send for a project that has no live link still logs (it can be a plain message), but the project must be Closed Won and visible to the person.
- WhatsApp rows show in the inbox with their channel and never as texts sent through Twilio.
- Texting rules are unchanged: `messages.send` still writes SMS rows only.

### Task 1: pure rules `lib/calls.ts` and `whatsAppDigits` in `lib/phone.ts`; tests.
### Task 2: schema, `calls.ts`, `whatsapp.ts`, `channel` in the thread; tests.
### Task 3: UI: Log a call and Call in the Messages thread (calls in time order), channel label, Send by WhatsApp on the Share panel.
### Task 4: browser check, D-102, phases.md, final checks.
