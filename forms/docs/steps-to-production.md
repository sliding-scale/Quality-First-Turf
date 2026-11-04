# Steps to Move to Production

**Project:** Quality First Turf, customer request form and on-site visit tool  
**Status:** Working on the development setup. This list covers everything needed to go live.

---

## Overview

Going live has four parts: what we need from the client (Part 1), the technical work on our side (Part 2), go-live day (Part 3) and what comes after launch (Part 4). Most of Part 2 can start as soon as the domain and the Jobber connection are settled, so the client items marked **First** are the ones that block everything else.

---

## Part 1: What We Need From the Client

### 1. Jobber account

| Item | Who | Detail |
|---|---|---|
| Approve the connection (**First**) | Client admin | Sign in to Jobber and click Allow once on a link we send. This lets our app create clients, requests, quotes and consultations in their account. |
| Verify the business email in Jobber | Client admin | Jobber will not send any emails (request received, booking confirmation, reminders) until Settings, Company Settings shows the email as verified. |
| Confirm the connected user and time zone | Client admin | Consultation times use the time zone of the Jobber user we connect. It must be the business's local time zone. |
| Check the client notification settings | Client admin | Turn on the emails they want customers to receive: request received, booking confirmation, and assessment reminders. |
| Decide who gets assigned | Client | New requests and consultations are currently unassigned. Tell us whether they should go to a specific team member. |

### 2. Domain and website

| Item | Who | Detail |
|---|---|---|
| Choose the web address (**First**) | Client | For example estimate.qualityfirstturf.com. The sales team uses the same address followed by /visit. |
| DNS access | Whoever manages the domain | One record has to be added at the registrar or DNS host (GoDaddy, Cloudflare, Wix, Squarespace and so on). We need either access or someone who can add it on request. |
| Link from the main website | Whoever edits qualityfirstturf.com | Add a "Get an estimate" button that points to the new address. |

### 3. Pricing and products (sign-off)

| Item | Who | Detail |
|---|---|---|
| Contractor pricing for all services | Client | Contractor quotes still use placeholder items. We need the real contractor rates. |
| Pricing for the 12 remaining services | Client | SOD, Patio Covers, Concrete, Retaining Walls, Planter Walls, Pavers, Bar & BBQ, Fire Pits, Decomposed Granite, Decorative Rock, Irrigation and Planting have no price list yet. |
| Review the homeowner prices | Client | Check the generated list of items and prices (docs/jobber-items-retail.csv) against the 2026 price list before we add them to the live Jobber account. |
| Confirm the minimum service charge | Client | The $2,250 minimum is applied by Jobber, not by this system. Confirm it is set up the way they want. |

### 4. Staff access

| Item | Who | Detail |
|---|---|---|
| List of salespeople | Client | Who needs to use the on-site tool. |
| Shared sign-in details | Client | Agree on the email and a strong password for the one shared login. Individual accounts come later. |

### 5. Content and branding

| Item | Who | Detail |
|---|---|---|
| Logo files | Client | The best available originals (SVG or high-resolution PNG), including a version with dark lettering for light backgrounds. |
| Response time promise | Client | The confirmation page says the team will be in touch soon. Confirm whether they want to promise a specific time. |
| Service area | Client | The form currently accepts any US state. Confirm whether to limit it to the states they serve. |
| Privacy policy link | Client | The form collects names, phone numbers and addresses. If they have a privacy policy, we should link it. |

### 6. Accounts and billing

| Item | Who | Detail |
|---|---|---|
| Hosting for the website (Vercel) | Client or us | The free plan is for non-commercial use, so a paid plan is needed for a business site. |
| Database and backend (Convex) | Client or us | The development project is already over the free plan limits, so the production deployment needs a paid plan. |
| Domain renewal | Client | Confirm who owns and renews the domain. |
| Ownership after launch | Both | Decide whether the hosting accounts stay with us or are transferred to the client, and write it down. |

### 7. Testing and sign-off

| Item | Who | Detail |
|---|---|---|
| Acceptance test | Client | Submit a request on a phone and on a desktop, open it in the on-site tool, save a visit, schedule a consultation, and check Jobber and their inbox. |
| Go-live approval | Client | Written approval before the link goes on the public website. |

---

## Part 2: Technical Steps

Do these in order.

1. **Create the production backend.** Create the production Convex deployment and publish the functions with `npm run convex:deploy`.
2. **Set the secrets on that deployment.** `SALES_EMAIL`, `SALES_PASSWORD`, `JOBBER_CLIENT_ID`, `JOBBER_CLIENT_SECRET` and `JOBBER_CONNECT_KEY`. Use a long random value for the connect key and keep it private.
3. **Add the production redirect address to the Jobber app.** It is the production backend address followed by `/jobber/callback`, for example `https://<deployment>.convex.site/jobber/callback`.
4. **Deploy the website.** Create the Vercel project from the repository and set `NEXT_PUBLIC_CONVEX_URL` to the production deployment. Deploy and check the preview address first.
5. **Attach the domain.** Add the custom domain in Vercel, then have the client (or their DNS host) add the record Vercel shows. HTTPS is issued automatically.
6. **Connect Jobber.** With the client present, open `https://<deployment>.convex.site/jobber/connect?key=<connect key>` while signed in to Jobber and click Allow.
7. **Sync the product catalogue.** Run the plan step against production to see what would change, review it, then create the new items and hide the replaced ones. Keep the saved plan file as a record of what was hidden.
8. **Clean out test data.** The production database starts empty, so no migration is needed. Delete any test clients, requests, quotes and appointments left in Jobber.
9. **Run the full smoke test** (below).
10. **Tighten up.** Set a strong shared password, confirm the connect key is not stored anywhere public, and keep the Convex dashboard open for the first few days to watch for errors.
11. **Update the project documentation** with the live addresses, and hand over the credentials and account ownership.

### Smoke test before going public

- Submit a customer request. A request appears in Jobber, and no quote is created yet.
- The customer sees the confirmation page, and the "request received" email arrives if it is switched on.
- Open the project in the on-site tool, complete the visit and save. A draft quote appears in Jobber, linked to the request, with the correct items and prices.
- Schedule a consultation. It appears on the Jobber calendar at the right time, and the confirmation email arrives.
- Repeat the customer form and the on-site tool on a phone.
- Try signing in with a wrong password and confirm it is refused.

---

## Part 3: Go-Live Day

1. Confirm the smoke test passed and the client has approved.
2. Add the "Get an estimate" link to the main website.
3. Watch the first real requests arrive in Jobber and the Convex dashboard.
4. If anything goes wrong, remove the link from the website. Nothing else needs to change, and no customer data is lost.

---

## Part 4: After Launch

| Item | Detail |
|---|---|
| Individual sales accounts | Replace the shared login so each salesperson has their own account and the system can show who did what. |
| Real pricing for the remaining services | Add contractor and the 12 other services once the client supplies prices. |
| Backups and monitoring | Decide how often data should be backed up and who receives error alerts. |
| Annual price list update | Update the price list file and re-run the catalogue sync each year. |
