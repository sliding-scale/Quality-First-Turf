# Quality First Turf: Project Report

**Prepared for:** Quality First Turf  
**Date:** October 27, 2026

---

## Overview

We have built a custom online system for Quality First Turf that handles the full journey from the moment a customer first reaches out to the point where your sales team has a draft quote ready in Jobber. The system has two sides: one for your customers and one for your sales team.

---

## What Your Customers See

### The Online Estimate Request Form

When a customer visits your website and wants an estimate, they are guided through a clean, step-by-step form that is simple and easy to use. Here is what they walk through:

**Step 1: Contact & Property Details**

The customer provides their name, phone number, email, and the full address of their property. The form helps them by showing an example entry in every field (for instance, a sample phone format) so they always know exactly what to type.

**Step 2: Choosing Services**

The customer picks the services they are interested in. The full menu of services available is:

| Service | Description |
|---|---|
| Demolition | Removal of existing grass, concrete, or landscaping |
| Artificial Grass | New turf installation, replacement, or repair |
| Putting Green | Custom backyard putting greens |
| Underground | Drainage, waterlines, conduit, and gas lines |
| Low Voltage Lighting | Outdoor path lights, step lights, uplights, and wiring |
| SOD | Natural grass installation |
| Patio Covers | Covered outdoor structures |
| Concrete | Concrete work |
| Retaining Walls | Structural landscape walls |
| Planter Walls | Decorative garden walls |
| Pavers | Paver walkways and patios |
| Bar & BBQ | Outdoor kitchen and entertainment features |
| Fire Pits | Outdoor fire features |
| Decomposed Granite | Ground cover areas |
| Decorative Rock | Landscape rock and stone |
| Irrigation | Sprinkler and watering systems |
| Planting | Plant and garden installations |

Customers can select as many services as they need for their project.

**Step 3: Service-Specific Questions**

For the more detailed services (Artificial Grass, Putting Green, Demolition, Underground, and Low Voltage Lighting), the form asks follow-up questions:

- **Artificial Grass:** The customer chooses whether it is a new installation, a replacement, or a repair. For installations, they pick from your full product lineup, organized into Budget Friendly, Standard, Premium, Pet, and Playground categories. They can also select optional add-ons such as extra sand, weed cloth, gopher wire, bender board, or aluminum borders. If the customer knows the approximate area size, they can enter that too.

- **Putting Green:** Customers choose between an Entertainment green and a PGA-level green, and select their preferred turf product (Champions Choice, Pro Putter, Poa Annua Natural, or Poa Annua Max). Optional add-ons such as golf cup and flag sets are available.

- **Demolition:** The customer indicates whether they need standard demolition or demolition with regrading. If concrete or rock removal is involved, they can note that as well.

- **Underground:** Customers pick from drainage, waterline, conduit, and gas line options and indicate their soil conditions (standard soil, rocky or clay soil, or not sure).

- **Low Voltage Lighting:** The customer can select from all your lighting products (including Corona uplights, path lights, step lights, transformers, and wiring options) and enter quantities or lengths for each.

**Step 4: Review & Submit**

Before submitting, the customer sees a full summary of everything they have entered. They can go back and correct anything. Once they submit, a few things happen immediately:

1. Their request is saved in your system.
2. A matching client record and request are created in Jobber.
3. The customer sees a confirmation screen that thanks them and clearly explains the next steps: your team will reach out, schedule a visit if needed, and prepare a quote.

### Smart Form Features

- **Saves progress automatically:** If the customer starts filling out the form and closes their browser, their progress is saved so they can pick up where they left off.
- **Homeowner or contractor:** The form asks whether the customer is a homeowner or a contractor, and pricing behind the scenes adjusts accordingly.
- **Area sizes are optional:** Customers can enter approximate measurements if they know them, but it is not required. Your team can measure on-site.
- **Mobile-friendly:** The form works well on phones, tablets, and desktops. Buttons are large and easy to tap, and the layout adjusts to fit any screen size.

---

## What Your Sales Team Sees

### Signing In

Your sales team accesses the system by going to the `/visit` section of your website and signing in with a shared team login. The sign-in is secure and keeps them logged in for 14 days.

### The Project Dashboard

Once signed in, your team sees a clean project dashboard split into two sections:

**Left Panel: Project List**

A sidebar shows all incoming customer requests, organized into two groups:

- **Pending:** New requests that have not been visited yet.
- **Completed:** Projects where the on-site visit is done.

Each project card shows the customer's name, their short project code (like K7M-3PQ, for easy reference), and their address. A search bar at the top lets your team quickly find a project by name, project code, address, phone number, or service type.

**Note:** The system shows the most recent 200 projects. Older projects can still be found using search.

**Right Panel: Project Details**

When your team clicks on a project, they see the full details on the right side of the screen. This is where the on-site visit workflow happens.

### The On-Site Visit Workflow

The visit tool walks your salesperson through a structured process in four clear steps:

**Step 1: Property Review**

Your salesperson reviews and can update the customer's contact information and property address. They can also see exactly what the customer originally submitted, so nothing is lost. Any changes made by the salesperson are tracked, so you always have a record of what the customer said versus what was confirmed on-site.

**Step 2: Services & Measurements**

For each service the customer requested, the salesperson can:

- Confirm or adjust the service selections
- Record precise measurements (length × width) for each area
- Name individual areas (for example, "Front Yard," "Side Strip," or "Backyard") for clear organization
- Add, remove, or adjust product and add-on selections based on what they see on-site
- Add notes for specific items such as repairs or replacements

The system automatically calculates area sizes from the length and width entered and shows running estimates.

**Step 3: Photos & Notes**

The salesperson can:

- Take or upload photos directly from their phone for each work area
- Add detailed notes about site conditions, access, or special considerations
- Organize photos by area so everything is clearly documented

Photos are stored securely and linked to the project. The system accepts only image files under 15 MB, and old photos are cleaned up when they are removed from a project.

**Step 4: Review & Save**

Before saving, the salesperson sees a complete summary of all measurements, services, products, add-ons, photos, and notes. When they save:

1. All the visit data is recorded in the system.
2. A detailed draft quote is automatically created in Jobber, broken down line by line with pricing based on your 2026 price list.
3. The quote is linked to the original customer request in Jobber.

**Important:** The draft quote is never sent to the customer automatically. It is created as a draft in Jobber so your team can review and finalize it before sending.

### Scheduling Consultations

From any project, your salesperson can schedule a consultation visit directly through the system. They pick a date, time, and duration, and can add notes (such as gate codes or parking instructions). The appointment is created in Jobber, which automatically emails the customer a confirmation. If the schedule needs to change, they can reschedule or cancel from the same screen.

### Change Tracking

Every time a salesperson saves changes to a project, the system records exactly what was different from the previous version. This creates a clear audit trail: you can always see what the customer originally requested versus what was confirmed on-site.

---

## Jobber Integration

The system connects directly to your Jobber account and handles several things automatically:

| What happens | When |
|---|---|
| A new client record is created (or an existing one is found) | When a customer submits the form |
| A request is created for the project | When a customer submits the form |
| A draft quote is generated with line-by-line pricing | When a salesperson saves an on-site visit |
| Consultation appointments are booked on the calendar | When a salesperson schedules a consultation |

### Pricing & Product Catalog

The system uses your 2026 price list to automatically calculate quote line items. Pricing adjusts based on:

- **Area size tiers** (299 sq ft and under, 300–699, 700–999, 1,000–1,499, 1,500–1,999, and 2,000+)
- **Customer type** (homeowner or contractor rates)
- **Product selected** (each turf product has its own rate)
- **Service type** (installation, replacement, repair, and so on)

The product catalog in the system stays in sync with your Jobber account. New items can be created or updated, and old items are hidden rather than deleted so historical quotes stay intact.

### Safety Features

- **No duplicate quotes:** If someone accidentally clicks "Save" twice, the system prevents a second quote from being created.
- **No accidental sends:** Quotes are always drafts and are never sent to customers automatically.
- **Customer data is protected:** The customer-facing form never reveals any Jobber IDs or internal system information.

---

## Project Codes

Every project gets a unique 6-character code (like **K7M-3PQ**) that is easy to read and communicate. These codes:

- Appear in the project list and search
- Are used in Jobber quote titles for easy reference
- Use only clear characters (no confusing letters such as O/0 or I/1/L)
- Can be searched in the sidebar to quickly pull up a project

---

## Design & Branding

The entire system is designed to match Quality First Turf's brand identity:

- **Colors:** The color palette (deep forest greens, warm sand tones, earthy neutrals, and clean white surfaces) was taken directly from your existing website at qualityfirstturf.com to keep everything consistent with your established brand.
- **Sales dashboard design:** The layout and feel of the sales dashboard (the project sidebar, project details panel, and on-site visit workflow) was inspired by the Jobber CRM interface, so it feels familiar to your team and works naturally alongside Jobber.
- **Fonts:** Professional, modern typefaces (IBM Plex Sans for body text and DM Sans for headings).
- **Logo:** Your brand mark appears in the sales dashboard and throughout the experience.
- **Mobile-first:** Everything is designed to work smoothly on phones, both for customers filling out the form and for salespeople working on-site.
- **Fast loading:** Pages show placeholder animations while content loads, so the screen never feels blank or broken.

---

## Security & Reliability

- **Sales access is protected:** Only staff with the shared credentials can access the sales dashboard and project details.
- **Sessions expire automatically:** Sign-in sessions last 14 days and are cleaned up automatically.
- **Rate limiting:** The system prevents abuse by limiting how quickly forms can be submitted or logins can be attempted.
- **Secure connections:** The Jobber connection uses industry-standard secure authorization and automatically refreshes its credentials when needed.
- **Data validation:** All form inputs are validated before saving, including phone numbers, email addresses, zip codes, measurements, and photo uploads.

---

## How the Workflow Flows Together

1. The customer visits your website.
2. They fill out the estimate request form.
3. They review and submit their request.
4. The project is saved and a Jobber request is created. The customer sees a confirmation with the next steps.
5. The project appears in your sales dashboard.
6. A salesperson opens the project.
7. They review the property and customer details.
8. They measure areas and confirm services on-site.
9. They take photos and add notes.
10. They review everything and save.
11. A draft quote is created in Jobber.
12. Your team reviews and sends the quote.

---

## Items Still to Complete

The following items are still outstanding before the system is fully production-ready:

### Pricing & Product Catalog

| Item | Status | Detail |
|---|---|---|
| Homeowner pricing for Artificial Grass, Putting Green, Demolition, Underground, and Low Voltage Lighting | Done | Pulled from the 2026 price list and working |
| Contractor pricing (all services) | Not yet done | Contractor quotes currently use placeholder items in Jobber. Real contractor rates need to be provided so the system can generate accurate contractor quotes. |
| Pricing for the remaining 12 services | Not yet done | SOD, Patio Covers, Concrete, Retaining Walls, Planter Walls, Pavers, Bar & BBQ, Fire Pits, Decomposed Granite, Decorative Rock, Irrigation, and Planting all use placeholder items. These services need a price list so proper quote line items can be created in Jobber. |

### Sales Team Features

| Item | Status | Detail |
|---|---|---|
| Shared team login | Done | One shared login for all sales staff |
| Individual sales accounts | Not yet done | Right now everyone shares one login. A future update would give each salesperson their own account so you can see who did what. |

---

## Summary

This system gives Quality First Turf a streamlined, professional process from first customer contact through to a finished quote in Jobber. Your customers get an easy, guided experience to describe their project, and your sales team gets a purpose-built tool for on-site visits that captures everything needed to produce an accurate quote, all connected directly to Jobber so nothing falls through the cracks.
