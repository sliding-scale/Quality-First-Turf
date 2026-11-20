# Demo data on the dev deployment

Made through the real screens (the forms app and the CRM), not by script, so each record shows how a feature is used. Everything uses the `dummy.test` email domain or a "Demo" name, so it is easy to find and delete. Dev only. The dev deployment is connected to Jobber, so a customer-form or New Request submission also creates a client and request in Jobber (the user accepted test data there on 2026-11-06).

| Record | Made how | What it shows |
| --- | --- | --- |
| **Dana Dummy-Reachout**, "Customer enquiry", dana.reachout@dummy.test | Customer form (`localhost:3001`): details and project, then "Have a professional reach out" | A request with no services; the request page's Services & Project Details shows Contact preference and the project answers; the Consultation Worksheet card |
| **Test job by hand** (Bryan Mendoza), Preplanning | Existing; the Takeoff tab was used on it | Takeoff: Area 1,000 saved, kit "Turf: Standard install" added (77, 7, 2, 4, 1, 30); Length 20, Width 10, Depth 6 saved, kit "Demo: dirt to haul away" added (3.7 cubic yards) |
| 24 kits and 51 materials in Settings > Materials | The Load button in Settings > Materials > Kits | The client's material calculator |

| Irrigation on Test job by hand | The Takeoff tab: Irrigation measurements 3 valves, 92 plants, 370 ft drip line, 4 tree rings; kit Irrigation: Drip system | The sheet's own example: 420 ft tubing, 184 emitters, 84 stake holders, 34 oz glue |

| **Marcus Dummy-Turf**, "Artificial Grass" XEXZ45, marcus.turf@dummy.test | Customer form, services path: Backyard, Medium, pet-friendly, 1 to 3 months, $7,000 to $15,000; Artificial Grass, Installation, Standard, La Jolla Lush, back yard 30 x 20 ft, add-on seam tape 40 ft | A request with services, a turf product, an area and an add-on; the Overview shows them all |
| **Quote #3 "Back yard turf (demo)"** for Marcus | More > Convert to Quote on his request (pre-filled: RP - AG Standard Install - La Jolla Lush [300-699], 600 x $7.50, and Additional Seam Tape 40 x $1.55 = $4,562), Save, More > Collect Signature | Quote pre-fill, saving, approving by signature |
| **Job #4 "Artificial Grass"** (same project) | Quote > More > Convert to Job | A won project that is a job and sits in Preplanning: Ready for Preplanning; revenue $4,562 |
| **Takeoff on that project** | Area 600 and Length 40 saved; kits Turf: Standard install (46 ft roll, 4.5 cubic yd base, 2 boxes nails, 2 bags staples, 1 pre-emergent, 18 bags infill) and Add on: Seam tape (40 ft tape, 1 quart glue) | Kits on a real project; headings; the merged table |
| **Purchase order PO-XEXZ45-1** | Takeoff > Create from takeoff, Place order, Mark delivered (supplier "Site One (demo)") | Orders and readiness: lines go Not ordered, Ordered, Delivered, and "Materials are ready" |
| **Work package on that project** | Scope, notes, target start 12/07, install 12/08 to 12/09, site access, budget line "Standard installation, artificial grass" 600 sq ft at $2.00 = $1,200, Save, Make a link | The installer package: saved, with its share link and WhatsApp sender |

| **Marcus's project through Preplanning** | Dragged on the Preplanning board through Contract & Scope of Work Review, Crew Alignment & Hold, Schedule & Access Confirmation, Order & Schedule Delivery for Materials and Ready for Construction (Material Takeoff and Installer Work Package were skipped by the drags) | Stage moves; the last one hands the project to Construction automatically ("In Construction: Ready to Start") |
| **Construction on that project** | Progress update "Day 1 (demo)..."; punch item "Seam visible near the back fence" added, Marked as fixed, Verified; crew ZZ Crew A ticked; Start sign-off (automatic summary), Sign on this device | The Construction tab; signing moved the project to Finance: Send Final Invoice |
| **Invoice #1 "For Services Rendered"** | Billing tab > New invoice (typed both lines, $4,562), Save, More > Mark as Sent, More > Collect Payment, reference DEMO-1001, Save | Invoice and payment; the invoice became Paid and the project moved itself to Final Payment Received, "Nothing owed" |
| **Finance stages** | Dragged on the Finance board to Get Client Review, Consolidate Files, Archive | The whole life of a job, from the customer form to Archive |

Not made yet through the screens: a request through New Request (services path and reach-out path with a consultation), a request moved to Closed Lost, a quote sent to the client link, a deposit, a payment schedule, a job walk and installation day on the Schedule, Messages and call logs, the Schedule, tasks and notes, automations, and a CSV export.

## How to
- **Work out a take-off:** open a project in Preplanning, the Takeoff tab; enter the measurement the kit shows in brackets (area for turf, length for drains and waterlines, length, width and depth for the demo) and Save measurements; pick the kit under "What kind of job is this?" and press Add kit.
- **Start a quote from a visit:** on a request that came from the customer form, More > Convert to Quote; the lines the visit works out are already there.
- **Have a customer ask to be called:** the customer form's choice page, "Have a professional reach out". In New Request the same choice goes straight to Schedule consultation.
- **Work out an irrigation or lighting takeoff:** on the Takeoff tab open Irrigation measurements or Lighting measurements, fill in the counts (valves, plants, drip line, tree rings, lights, transformers), Save measurements, then pick Irrigation: Drip system or Lighting: Install lights under "What kind of job is this?".
