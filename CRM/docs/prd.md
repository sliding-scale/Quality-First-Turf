# Quality First Turf CRM: Product Requirements

> Source: `Quality First Turf – CRM Development PRD.pdf` (image-only PDF, transcribed via OCR).
> The PDF begins at "Milestone 2". Milestone 1 (Google Workspace, DNS and email set-up) is already done (D-009).
> Section 8 rules 1 and 2 (release modules early) are relaxed: one switch-over at the end of Milestone 5, with UI built first inside each milestone (D-013).
> "Multiple company entities" means three businesses: Quality First Turf, Quality First Turf Construction, Quality First Patios (D-016).
> Per [D-005](decisions.md), the delivery dates in the PDF are ignored. Milestones are treated as ordered phases only.
> Assumption stated in the PRD: **"company" in this document means a "client" from Jobber.**
> Decided: Companies and Contacts are merged into one **Clients** module (D-008), so read 2.1 and 2.2 together. Installers do not log in (D-010). Jobber is replaced by a one-time import (D-011).

## Product Objective

Build a custom CRM for Quality First Turf to manage the complete business workflow, from the initial customer enquiry through sales, preplanning, installation, invoicing and project closure.

The system must support multiple company entities, individual team accounts, role-based access and connected operational pipelines.

**Core architecture principle:** each customer and project has a central record. Information must carry forward as the project moves between departments. Do not create disconnected records for each pipeline.

---

## Milestone 2: CRM Foundation (Client Module)

**Objective:** build the foundational CRM modules so the Sales team can begin transitioning away from Jobber.

### 2.1 Companies Module
Users must be able to:
- Create, edit and view companies.
- Maintain multiple company entities.
- Store company name and business details.
- Associate customers and projects with companies.
- Search and filter companies.

### 2.2 Contacts Module
Two contact types: **Homeowners** and **Contractors**.

Each contact profile contains: name, email, phone number, address, contact type, associated company (where applicable), related projects, activity history, notes.

Users must be able to create, edit, view, search and filter contacts.

### 2.3 Data Import
- Import existing contacts and companies from Jobber exports.
- Map available fields to the new CRM structure.
- Prevent duplicate records.
- Preserve available customer and company relationships.

### 2.4 User Access
- User authentication.
- Basic roles and permissions.
- Admin can manage users.
- Restrict records based on assigned permissions.

### Acceptance Criteria
- Contacts and Companies modules are fully usable.
- Existing Jobber contact and company records can be imported.
- Contacts can be associated with companies.
- Sales users can manage their customer records without relying on Jobber for these functions.

---

## Milestone 3: Sales CRM & Pipeline

**Objective:** build the complete sales workflow, from initial enquiry to approved contract.

### 3.1 Dashboard
Dynamic summaries for: new leads, approved leads, pending quotes, jobs awaiting invoicing, outstanding payments, today's scheduled jobs, upcoming consultations, tasks assigned to the logged-in user.

Dashboard figures must be derived from actual CRM records.

### 3.2 Quick Create
Quick actions to: open customer intake forms, add a customer, create a quote, create a job, create an invoice.

### 3.3 Sales Pipeline
Stages, in order:
1. New Request
2. Schedule Onsite Consultation
3. Onsite Consultation
4. Quote Draft & Site Plan / Design
5. Proposal Delivered, Awaiting Response
6. Changes Requested
7. Quotes Approved, Contract Out for Signature
8. Closed Won
9. Closed Lost

Requirements:
- Pipeline/board view of opportunities.
- Move opportunities between stages.
- Record stage changes, timestamps and responsible users.
- Maintain the complete opportunity history.
- Trigger relevant notifications and handoffs.
- Apply stage-specific validation rules.

Business rules:
- **Closed Won** requires a signed contract and a received deposit, if applicable.
- **Closed Lost** applies when the customer declines, cancels, or is unresponsive after the defined three-month follow-up period.

### 3.4 Opportunity / Lead Detail Page
One central detail page per opportunity. Information accumulates as the project progresses. Includes:
- Customer and company details
- Property information
- Requested and confirmed services
- Measurements and photos
- Consultation information
- Notes and activity history
- Assigned salesperson
- Quotes and line items
- Site plan attachments
- Contract and approval information
- Current pipeline and stage

**Do not create a separate opportunity record when the project moves into Preplanning or Construction.**

### 3.5 Consultations, Calendar & Tasks
- Calendar with daily, weekly and monthly views.
- Schedule consultations and follow-up visits.
- Assign appointments to salespeople.
- Retrieve Google Calendar availability before booking.
- Maintain individual user calendars.
- Assign tasks to users.
- Display personal task lists on the dashboard.
- Prevent double-booking based on calendar availability.

### 3.6 Quotes & Proposals
A dedicated Quotes module.
- Overview cards: Draft, Pending, Sent, Awaiting Approval, Approved / Converted to Jobs.
- Create and edit quotes.
- Add line items, quantities and pricing.
- Define scope of work.
- Associate quotes with customers and opportunities.
- Attach site plans.
- Track sent, viewed, approved and rejected statuses.
- Track requested changes and resubmissions.

### Acceptance Criteria
- New enquiries can progress through all Sales Pipeline stages.
- Each opportunity maintains its complete history.
- Quotes are linked to the correct customer and project.
- Consultations and tasks can be assigned and scheduled.
- Closed Won opportunities can be handed over to Preplanning.

---

## Milestone 4: Preplanning & Construction Management

**Objective:** manage projects from sales handoff through material procurement, installation and customer sign-off.

### 4.1 Preplanning Pipeline
Stages:
1. Ready for Preplanning
2. Contract & Scope of Work Review
3. Material Takeoff & Availability
4. Installer Work Package
5. Crew Alignment & Hold
6. Schedule & Access Confirmation
7. Order & Schedule Delivery for Materials
8. Ready for Construction / Installs Scheduled

When an opportunity enters Closed Won:
- Create/activate its Preplanning workflow.
- Notify the Office Team.
- Carry forward the contract, quote, site plan and customer details.

### 4.2 Material Takeoff
A structured Material Takeoff Form.
- Calculate material quantities from project measurements.
- Support configurable product units.
- Use configurable material calculation formulas.
- Record quantities required.
- Record supplier information.
- Track stock availability and lead times.
- Generate a material requirements summary.

Calculation rules must be configurable using the product catalogue and formulas supplied by the client.

### 4.3 Installer Work Packages
- Generate installer budgets.
- Record labour costs.
- Create installation schedules.
- Assign installers and crews.
- Attach drawings, specifications, photos and project notes.
- Generate a consolidated work package.
- Allow the package to be shared with installers.

### 4.4 Crew & Material Scheduling
(Numbered 7 in the source, which has no item 4.)
- Record crew availability and agreed rates.
- Assign crews to projects.
- Record target start dates.
- Track customer availability and site access requirements.
- Record purchase orders and material delivery dates.
- Track material readiness before construction begins.

### 4.5 Construction Pipeline
Stages:
1. Ready to Start
2. PM Job Walk & Mark-up
3. 20% Completed
4. 40% Completed
5. 60% Completed
6. 80% Completed
7. PM Job Walk with Client
8. Punch List / Corrections Needed
9. 100% Completed & Sign-off

### 4.6 Construction Management
- Assign project managers and installation crews.
- Schedule job walks and installation dates.
- Record progress updates.
- Attach progress photos and notes.
- Create and assign punch-list items.
- Track correction status.
- Schedule reinspection.
- Capture customer completion approval.
- Generate a digital completion sign-off.

**A project must not enter the final completed stage until required punch-list items are resolved and customer sign-off is recorded.**

### Acceptance Criteria
- Closed Won opportunities enter Preplanning.
- Material Takeoff Forms calculate quantities using configured rules.
- Installer work packages can be generated.
- Projects can be assigned to crews and scheduled.
- Construction progress is recorded against the project.
- Completion and sign-off are recorded before final billing.

---

## Milestone 5: Finance, Integrations & Launch

**Objective:** complete the final operational workflow, communication integrations and production deployment.

### 5.1 Backend / Finance Pipeline
Stages:
1. Send Final Invoice
2. Pending Final Payment
3. Final Payment Received
4. Get Client Review
5. Consolidate Files
6. Archive

### 5.2 Invoices & Payments
- Create invoices against projects.
- Track invoice status.
- Record payment amounts and dates.
- Display outstanding balances.
- Track deposits and final payments.
- Display pending payments on the dashboard.

### 5.3 Phone & SMS Integration
- Multiple business phone numbers.
- Inbound and outbound calls.
- Send and receive text messages.
- Communication logs against customers and opportunities.
- Associate communication activity with the relevant user.

### 5.4 WhatsApp Integration
- Connect WhatsApp Business Platform.
- Send installer work packages through WhatsApp.
- Support document attachments or secure work-package links.
- Associate sent communication with the relevant project.

### 5.5 User Management & Permissions
Role-based and record-level permissions. Required user groups: **Admin, Sales, Office Team, Project Managers, Installers.**
- Admin can manage users and module permissions.
- Restrict users to assigned records and permitted modules.
- Support controlled access between departments.
- Managers and Admins can have broader visibility.
- Each user has an individual calendar and task area.

### 5.6 Final Delivery
- Test the complete customer-to-payment workflow.
- Verify pipeline transitions.
- Verify data integrity.
- Test user permissions.
- Test integrations.
- Fix critical bugs.
- Deploy the production CRM.
- Provide basic documentation and handover.

### Acceptance Criteria
- Projects move from construction completion into final billing.
- Invoice and payment status are tracked.
- Agreed phone, SMS and WhatsApp integrations work.
- Permissions are enforced.
- CRM is deployed and usable by the team.

---

## 6. Shared System Requirements (all milestones)

### Central Data Structure
Connected records for: Companies, Contacts, Users, Opportunities / Projects, Activities and Notes, Tasks, Calendar Events, Quotes, Jobs, Site Plans and Documents, Materials and Takeoffs, Installer Work Packages, Invoices, Payments.

Every record must have the necessary relationships and ownership information.

### Pipeline Behaviour
- Preserve project data when changing stages.
- Record who changed a stage and when.
- Maintain stage history.
- Trigger the relevant notifications and tasks.
- Support handoffs between departments.
- Prevent invalid stage transitions where business rules require validation.

### Search & Filtering
Search and relevant filters across Contacts, Companies, Opportunities, Quotes, Jobs, Invoices. **Jobs must be filterable by company.**

### UI / UX
Clean, familiar interface inspired by Jobber. Dashboard summaries, searchable tables, pipeline/board views, calendar views, quick-create actions, consistent forms and detail pages, responsive desktop and mobile layouts.

---

## 7. Required Client Inputs & Dependencies

From Quality First Turf:
1. Jobber exports for existing contacts and companies.
2. Google Workspace Super Admin and DNS access.
3. Confirmation of email accounts, aliases and shared mailboxes.
4. Google Drive access and storage details.
5. Complete product catalogue and measurement units.
6. Material calculation formulas and wastage rules.
7. Supplier details and availability information.
8. Installer budget structure and work package requirements.
9. Contract, invoice and completion sign-off templates.
10. Phone/SMS provider and WhatsApp Business access.

Third-party subscriptions, API fees and provider verification are external dependencies.

## 8. Development Rules

1. Build and release functional modules milestone by milestone.
2. Do not wait until the entire CRM is finished to make completed modules usable.
3. Contacts and Companies must be ready for Sales to use first (the source gives a date; ignored per D-005).
4. All pipelines must use the same central project record.
5. Avoid duplicate data and disconnected modules.
6. Make stage changes, ownership and activity history auditable.
7. Enforce access control at the data level, not just by hiding UI elements.
8. Handle API failures and migration exceptions without silently losing data.
9. Report blockers and missing client inputs early.
10. Test each milestone before handing it over.

**Final outcome:** a production-ready Quality First Turf CRM that replaces Jobber for the agreed workflows and connects Sales, Preplanning, Construction and Finance in one system.
