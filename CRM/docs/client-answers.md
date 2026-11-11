# Client answers and status

Working tracker for the two client documents. IDs are the original numbering and stay stable until a final renumber.

- `client-questions-later.docx`: the single backlog of valid client questions (24 checklist items and 83 questions). **None are asked now.** We ask only when a question blocks the build (D-018).
- Answered or internal items are in neither document.

"Held" means valid but not now. It does not mean dropped.

All remaining questions are held. None are asked now (D-018).
Asking now: nothing. B1.3 (what differs between the three businesses) and B2.6 (duplicate clients) are the next candidates.

Roles for Sal, May and Robert are not asked yet; the office@qualityfirsturf.com spelling is assumed to be a typo.

## Received
| Item | What we got |
|------|-------------|
| A2 Staff and accounts | Three businesses and their mailboxes (below). Roles not stated |
| A4 Google Workspace Super Admin and DNS | Done in Milestone 1 |
| A5 Email set-up | Done in Milestone 1 |
| B12.1 Workspace Super Admin / DNS owner | Done in Milestone 1 |
| B1.3 "Multiple company entities" | Answered by the staff list: three businesses. Follow-up reworded in the document |

### Businesses, users and mailboxes
| Business | Mailbox | User |
|----------|---------|------|
| Quality First Turf Landscape | sal.t@qualityfirstturf.com | Sal |
| | office@qualityfirsturf.com (typo as supplied, verify spelling) | May |
| | info@qualityfirstturf.com | Sal |
| Quality First Turf Construction | sal.t@qualityfirstturf.com | Sal |
| | office@qualityfirstturf.com | May |
| | robert.p@qualityfirstturf.com | Robert |
| Quality First Patios | info@qualityfirstpatios.com | Sal |
| | office@qualityfirstpatios.com | May |
| | sal.t@qualityfirstpatios.com | Sal |
| | robert.p@qualityfirstpatios.com | Robert |

Note from the client (May): Google Drive is currently on qualityfirstturf@gmail.com and should be merged into office@ in Workspace.

### Answers to Part B
| ID | Answer |
|----|--------|
| B1.1 | United States, all states |
| B1.2 | Not relevant: the system must handle any number of clients |
| B1.4 to B1.7 | Removed by the user |
| B2.1 | Client type comes from the customer form. The CRM clients list needs a Homeowner/Contractor filter |
| B2.2, B2.3, B2.4 | Removed as irrelevant |
| B2.5 | Removed (read as irrelevant): client details come from the customer form. Confirm if this was meant the other way |
| B2.7 | Removed as irrelevant (lead sources) |
| B12.4 | The CRM must be responsive on all devices |
| B12.5 | Removed as irrelevant |
| B12.6 | The CRM will have an export option |

See D-017 in `decisions.md` for the design consequences.

## Ours, not the client's
- A1 Jobber export: we pull it ourselves (Jobber API is already connected in `../forms`, or a CSV export).
- A7 Logo: the user supplies it.
- Brand colours: the same as Jobber's.

## Held (in client-questions-later.docx, to ask later)
- A3 Main contact and approver
- A6 Google Drive details (see the note above)
- A7 CRM web address
- A9 to A14 (needed for the Sales part)
- A15 to A23 (needed for Preplanning and Construction)
- A24 to A29 (needed for Finance and Launch)

## Removed
- A8 Accounts and subscriptions

## Still to answer
Everything else in the document.
