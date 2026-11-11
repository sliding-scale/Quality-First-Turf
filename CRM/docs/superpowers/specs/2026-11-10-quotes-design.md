# Quotes: builder, sending, client approval (Milestone 3, step 3.2): design

Status: **awaiting the user's approval.** Nothing is built. Written 2026-11-10 after reading Jobber's New Quote form in the browser (nothing saved in Jobber) and PRD 3.6, 3.3 and 3.4. The user's instruction: replicate Jobber, cover every PRD point, and make it **mobile responsive**. What exists already (D-056): the Quotes list with its figure cards and filters, and a read-only quote page with quote #1.

## Intent
Staff build a quote for a project (line items from the price list, scope of work, optional items, discount, tax, deposit, site plans), send it to the client, see when it is viewed, approved, rejected or sent back for changes, and resubmit. Approval with a signature and the deposit are what let a project close as won (PRD 3.3).

## What Jobber's builder has (copied)
- **Header:** the quote's title; Select a client; Quote # (next number); Salesperson (a person menu); Customize, Add Field (custom fields).
- **Sections** you can add: Introduction (image, heading, message), Product / Service, Attachments, Images, Reviews, Client Message; Contract / Disclaimer (a default text, "Apply to all future quotes"); Notes (internal, with attachments).
- **Product / Service lines:** Name, Quantity, Unit price, Total, Description, an image, "Mark as optional"; **Add Line Item** and **Add Text** (a line that is only words); lines can be reordered.
- **Client view** (Change): tick what the client sees: Quantities, Unit prices, Line item totals, Totals.
- **Totals:** Subtotal, Discount (an amount in $ or %), Tax, Total; **Add Deposit or Payment Schedule**.
- **Save Quote** with a menu: Send as Email, Send as Text Message, Convert to Job, Mark as Awaiting Response; Cancel.
- **The quote page** (already built read-only): status, activity, Edit, More menu (Convert to Job, Email, Send Text, Preview as Client, Collect Signature, Print or Save PDF, Delete), notes.

## PRD points (3.6, 3.3, 3.4) and how each is met
| PRD | How |
|---|---|
| Dedicated Quotes module, overview cards Draft, Pending, Sent, Awaiting Approval, Approved / Converted | The list already has cards; the five PRD cards replace the current four (see my calls). |
| Create and edit quotes; line items, quantities, pricing; scope of work | The builder; scope of work is the Introduction and the line descriptions. |
| Associate with customers and opportunities | A quote is created for a client and a project (a project is chosen or created from the pipeline); both are stored. |
| Attach site plans | Attachments section (files and images) on the quote. |
| Track sent, viewed, approved, rejected | Status plus timestamps and an activity list: Sent, Viewed, Approved, Rejected. |
| Track requested changes and resubmissions | The client can ask for changes with a message; staff edit and **Resubmit**; each sent version is kept (Revision 1, 2...) and the activity says which. |
| Pricing from the price list (phases.md: catalogue, 2026 price list, homeowner and contractor rates, area bands) | "Add from price list" picker in the builder using the shared catalogue; the rate follows the client's type; for a project that came from the customer form, **Fill from the site visit** proposes lines from the visit's measurements (the forms app's own rules). |
| Closed Won needs a signed contract and a received deposit (3.3) | Approval with a signature, and a deposit marked received, now satisfy that rule for anyone who can edit (today only an Admin can close as won). |
| Pipeline stages follow the quote (3.3) | Quote created: Quote Draft & Site Plan / Design. Sent: Proposal Delivered. Client asks for changes: Changes Requested. Approved and signed: Quotes Approved. Rejected: Closed Lost (reason from the client). |

## Decisions I am proposing (correctable)
- **Statuses:** Draft, Awaiting response, Changes requested, Approved, **Rejected** (new), Converted, Archived. Overdue is not a status. "Viewed" is a timestamp, not a status.
- **Overview cards (PRD wording mapped):** Draft (count and value); Pending (open quotes: Draft, Awaiting response, Changes requested); Sent (sent in the last 30 days, against the 30 days before); Awaiting approval (Awaiting response); Approved / Converted (count and value).
- **The client's page:** a public page at `/q/<secret link>` (no sign-in) that shows the quote the way the client view allows: Introduction, lines (optional lines can be ticked on or off, the total follows), totals, deposit, attachments, contract, with **Approve and sign** (a drawn signature and typed name), **Request changes** (a message), **Decline** (a reason). It records Viewed the first time it opens. Mobile first.
- **Sending:** staff press Send; the quote becomes Awaiting response, a secure link is created, and the activity records who sent it, to which address, and as which revision. **The email or text itself is not sent yet**: the client moved to Zoho Workspace, and the CRM has no mail or SMS provider yet (Q-006). Until then Send gives the staff the link to **copy** (and an email draft opened with `mailto:`), and the activity says "Link created". Delivery from the CRM is its own later step.
- **Staff-collected signature** ("Collect Signature") uses the same signature pad, for a client signing in person.
- **Deposit:** a percent or an amount on the quote; staff mark it **received** with an amount and a date (payments come in Milestone 5). Closed Won needs the approval, the signature and, when a deposit is set, the deposit received.
- **Tax:** a percentage on the quote (blank means none), typed per quote, because tax varies by job (D-017); no tax-rate tables.
- **Discount:** an amount or a percent of the subtotal.
- **Resubmission:** after the client asks for changes, staff edit and press **Resubmit**; the quote goes back to Awaiting response with a new link version and the client sees the newest version only; older versions stay in the activity.
- **Convert to Job** stays greyed (Jobs are not built). Marking a quote Approved does not create a job.
- **Permissions:** Admin, Sales and Office Team build and send; Project Managers look only. The client link is a secret, expires when the quote is archived or deleted, and can be reissued. Staff never share their own sign-in with it.
- **Mobile:** the builder is one column on a phone (header fields stacked, each line a card with its fields stacked, totals below, a bar pinned to the bottom with Save and the Save menu); the list becomes cards; the client page is designed for a phone first.

## Backend (additive; existing quote tables keep working)
- `quotes` gains optional `projectId` use (it has `opportunityId`), `discountKind` and `discountValue`, `taxPercent`, `depositKind` and `depositValue`, `clientView` (four ticks), `revision`, `shareToken` (random, unique), `viewedAt` (exists), `rejectedAt`, `rejectedReason`, `changesRequestedAt` and `changesMessage`; statuses gain `Rejected`.
- `quoteLineItems` gains `kind` ("item" or "text") and an optional catalogue code.
- New `quoteEvents` (activity: created, sent, link created, viewed, changes requested, resubmitted, approved, rejected, deposit received, converted, with who, when, detail), `quoteRevisions` (the lines and totals as sent, per revision), `quoteAttachments` (site plans and files), and a per-business default contract text.
- `convex/crm/quotes.ts` gains create, update, save lines, send, resubmit, mark received, collect signature; a public `convex/crm/clientQuote.ts` for the client page (view, approve, request changes, decline), checked by the secret token, rate-limited, never exposing staff data. The pipeline moves reuse `applyMove` with a system actor (the stage history's "by" becomes optional and says "Client (quote link)").
- Pure rules in `convex/crm/lib/quoteMath.ts`: line totals, optional lines, discount, tax, deposit, in cents, rounded one way and tested.

## Needs a decision from the user
1. **Sending (above):** link and a prepared email now, real delivery from the CRM later with Zoho Mail and an SMS provider. Is that okay?
2. **Client approval and signature (Q-005 was undecided):** the on-screen signature on the public quote page, as described. Is that the method, or does the client want a document signing service?
3. **Closed Won rule:** staff may close a project as won once the quote is approved, signed and the deposit received, instead of Admin only. Okay?

## Not in the PRD but kept (tell the user)
Quote # and salesperson; Add Field (custom fields) shown greyed; Introduction section with image; Add Text lines; optional lines and line images; the Client view ticks; discount in $ or %; tax percent; Attachments, Images and Notes sections; the Save menu choices; Preview as Client; Collect Signature; Print or Save PDF; duplicate ("Create similar quote"); archive; the Reviews section greyed. **Greyed, not built:** Convert to Job, Send by email or text from the CRM, Reviews, Add Field.

## In the PRD but not in Jobber (added by us)
Rejected status and reason; the revision history and Resubmit; the price-list picker and Fill from the site visit; the pipeline following the quote; the Closed Won rule using the signed quote and deposit.

## Left to the builder
Exact copy of the client page; the signature pad's size; how many revisions are shown in the activity (all); numbering of quotes (next number per business, as now).

## After this
The Tasks items from the PRD (Home dashboard task list and the rest), then Home dashboard figures.
