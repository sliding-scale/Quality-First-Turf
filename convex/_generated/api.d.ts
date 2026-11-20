/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as crm_automationSend from "../crm/automationSend.js";
import type * as crm_automations from "../crm/automations.js";
import type * as crm_billing from "../crm/billing.js";
import type * as crm_businesses from "../crm/businesses.js";
import type * as crm_calendarConnect from "../crm/calendarConnect.js";
import type * as crm_calendarHttp from "../crm/calendarHttp.js";
import type * as crm_calendarSync from "../crm/calendarSync.js";
import type * as crm_calls from "../crm/calls.js";
import type * as crm_catalogue from "../crm/catalogue.js";
import type * as crm_checklists from "../crm/checklists.js";
import type * as crm_clerkWebhook from "../crm/clerkWebhook.js";
import type * as crm_clientEmail from "../crm/clientEmail.js";
import type * as crm_clientImport from "../crm/clientImport.js";
import type * as crm_clientInvoice from "../crm/clientInvoice.js";
import type * as crm_clientMail from "../crm/clientMail.js";
import type * as crm_clientQuote from "../crm/clientQuote.js";
import type * as crm_clientSignoff from "../crm/clientSignoff.js";
import type * as crm_clientWorkPackage from "../crm/clientWorkPackage.js";
import type * as crm_clients from "../crm/clients.js";
import type * as crm_construction from "../crm/construction.js";
import type * as crm_customAutomations from "../crm/customAutomations.js";
import type * as crm_devBoardDemo from "../crm/devBoardDemo.js";
import type * as crm_disclaimers from "../crm/disclaimers.js";
import type * as crm_exports from "../crm/exports.js";
import type * as crm_intake from "../crm/intake.js";
import type * as crm_invitations from "../crm/invitations.js";
import type * as crm_invoiceSettings from "../crm/invoiceSettings.js";
import type * as crm_invoices from "../crm/invoices.js";
import type * as crm_jobCosts from "../crm/jobCosts.js";
import type * as crm_jobberConsultation from "../crm/jobberConsultation.js";
import type * as crm_jobs from "../crm/jobs.js";
import type * as crm_lib_access from "../crm/lib/access.js";
import type * as crm_lib_assignees from "../crm/lib/assignees.js";
import type * as crm_lib_automationRules from "../crm/lib/automationRules.js";
import type * as crm_lib_billing from "../crm/lib/billing.js";
import type * as crm_lib_businessNames from "../crm/lib/businessNames.js";
import type * as crm_lib_calendarCrypto from "../crm/lib/calendarCrypto.js";
import type * as crm_lib_calendarSync from "../crm/lib/calendarSync.js";
import type * as crm_lib_calls from "../crm/lib/calls.js";
import type * as crm_lib_catalogue from "../crm/lib/catalogue.js";
import type * as crm_lib_clerk from "../crm/lib/clerk.js";
import type * as crm_lib_clientImport from "../crm/lib/clientImport.js";
import type * as crm_lib_clientInput from "../crm/lib/clientInput.js";
import type * as crm_lib_codes from "../crm/lib/codes.js";
import type * as crm_lib_construction from "../crm/lib/construction.js";
import type * as crm_lib_consultationStage from "../crm/lib/consultationStage.js";
import type * as crm_lib_customAutomation from "../crm/lib/customAutomation.js";
import type * as crm_lib_disclaimers from "../crm/lib/disclaimers.js";
import type * as crm_lib_exportCsv from "../crm/lib/exportCsv.js";
import type * as crm_lib_fields from "../crm/lib/fields.js";
import type * as crm_lib_formula from "../crm/lib/formula.js";
import type * as crm_lib_invoiceMath from "../crm/lib/invoiceMath.js";
import type * as crm_lib_jobCosts from "../crm/lib/jobCosts.js";
import type * as crm_lib_jobNumber from "../crm/lib/jobNumber.js";
import type * as crm_lib_jobStatus from "../crm/lib/jobStatus.js";
import type * as crm_lib_jobberHooks from "../crm/lib/jobberHooks.js";
import type * as crm_lib_materialStarter from "../crm/lib/materialStarter.js";
import type * as crm_lib_mentionNotify from "../crm/lib/mentionNotify.js";
import type * as crm_lib_mentions from "../crm/lib/mentions.js";
import type * as crm_lib_mirror from "../crm/lib/mirror.js";
import type * as crm_lib_noteFiles from "../crm/lib/noteFiles.js";
import type * as crm_lib_noteText from "../crm/lib/noteText.js";
import type * as crm_lib_permissions from "../crm/lib/permissions.js";
import type * as crm_lib_phone from "../crm/lib/phone.js";
import type * as crm_lib_pipelineStages from "../crm/lib/pipelineStages.js";
import type * as crm_lib_purchaseOrders from "../crm/lib/purchaseOrders.js";
import type * as crm_lib_quoteData from "../crm/lib/quoteData.js";
import type * as crm_lib_quoteMath from "../crm/lib/quoteMath.js";
import type * as crm_lib_quoteOptions from "../crm/lib/quoteOptions.js";
import type * as crm_lib_schedule from "../crm/lib/schedule.js";
import type * as crm_lib_stages from "../crm/lib/stages.js";
import type * as crm_lib_svix from "../crm/lib/svix.js";
import type * as crm_lib_systemMove from "../crm/lib/systemMove.js";
import type * as crm_lib_takeoff from "../crm/lib/takeoff.js";
import type * as crm_lib_workPackage from "../crm/lib/workPackage.js";
import type * as crm_lib_zohoCalendarApi from "../crm/lib/zohoCalendarApi.js";
import type * as crm_lib_zohoMail from "../crm/lib/zohoMail.js";
import type * as crm_materialKits from "../crm/materialKits.js";
import type * as crm_materials from "../crm/materials.js";
import type * as crm_mentions from "../crm/mentions.js";
import type * as crm_messageSend from "../crm/messageSend.js";
import type * as crm_messages from "../crm/messages.js";
import type * as crm_messagesHttp from "../crm/messagesHttp.js";
import type * as crm_noteFiles from "../crm/noteFiles.js";
import type * as crm_opportunityPage from "../crm/opportunityPage.js";
import type * as crm_opportunityTasks from "../crm/opportunityTasks.js";
import type * as crm_payments from "../crm/payments.js";
import type * as crm_phoneNumbers from "../crm/phoneNumbers.js";
import type * as crm_pipeline from "../crm/pipeline.js";
import type * as crm_projects from "../crm/projects.js";
import type * as crm_purchaseOrders from "../crm/purchaseOrders.js";
import type * as crm_quoteDraft from "../crm/quoteDraft.js";
import type * as crm_quoteFlow from "../crm/quoteFlow.js";
import type * as crm_quoteImport from "../crm/quoteImport.js";
import type * as crm_quotePrices from "../crm/quotePrices.js";
import type * as crm_quotes from "../crm/quotes.js";
import type * as crm_requestForm from "../crm/requestForm.js";
import type * as crm_requests from "../crm/requests.js";
import type * as crm_sampleData from "../crm/sampleData.js";
import type * as crm_schedule from "../crm/schedule.js";
import type * as crm_seed from "../crm/seed.js";
import type * as crm_takeoff from "../crm/takeoff.js";
import type * as crm_users from "../crm/users.js";
import type * as crm_whatsapp from "../crm/whatsapp.js";
import type * as crm_workPackages from "../crm/workPackages.js";
import type * as crm_zohoMailSync from "../crm/zohoMailSync.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as jobber_client from "../jobber/client.js";
import type * as jobber_connection from "../jobber/connection.js";
import type * as jobber_http from "../jobber/http.js";
import type * as jobber_mutations from "../jobber/mutations.js";
import type * as jobber_queries from "../jobber/queries.js";
import type * as jobber_sync from "../jobber/sync.js";
import type * as projects_actions from "../projects/actions.js";
import type * as projects_consultation from "../projects/consultation.js";
import type * as projects_mutations from "../projects/mutations.js";
import type * as projects_queries from "../projects/queries.js";
import type * as projects_shortCode from "../projects/shortCode.js";
import type * as projects_visits from "../projects/visits.js";
import type * as rateLimits from "../rateLimits.js";
import type * as sales_accounts from "../sales/accounts.js";
import type * as sales_clerk from "../sales/clerk.js";
import type * as sales_mutations from "../sales/mutations.js";
import type * as sales_queries from "../sales/queries.js";
import type * as sales_session from "../sales/session.js";
import type * as shared_catalogue from "../shared/catalogue.js";
import type * as shared_discovery from "../shared/discovery.js";
import type * as shared_errors from "../shared/errors.js";
import type * as shared_jobberNames from "../shared/jobberNames.js";
import type * as shared_priceList from "../shared/priceList.js";
import type * as shared_quoteLines from "../shared/quoteLines.js";
import type * as shared_usStates from "../shared/usStates.js";
import type * as shared_visits from "../shared/visits.js";
import type * as shared_zonedTime from "../shared/zonedTime.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "crm/automationSend": typeof crm_automationSend;
  "crm/automations": typeof crm_automations;
  "crm/billing": typeof crm_billing;
  "crm/businesses": typeof crm_businesses;
  "crm/calendarConnect": typeof crm_calendarConnect;
  "crm/calendarHttp": typeof crm_calendarHttp;
  "crm/calendarSync": typeof crm_calendarSync;
  "crm/calls": typeof crm_calls;
  "crm/catalogue": typeof crm_catalogue;
  "crm/checklists": typeof crm_checklists;
  "crm/clerkWebhook": typeof crm_clerkWebhook;
  "crm/clientEmail": typeof crm_clientEmail;
  "crm/clientImport": typeof crm_clientImport;
  "crm/clientInvoice": typeof crm_clientInvoice;
  "crm/clientMail": typeof crm_clientMail;
  "crm/clientQuote": typeof crm_clientQuote;
  "crm/clientSignoff": typeof crm_clientSignoff;
  "crm/clientWorkPackage": typeof crm_clientWorkPackage;
  "crm/clients": typeof crm_clients;
  "crm/construction": typeof crm_construction;
  "crm/customAutomations": typeof crm_customAutomations;
  "crm/devBoardDemo": typeof crm_devBoardDemo;
  "crm/disclaimers": typeof crm_disclaimers;
  "crm/exports": typeof crm_exports;
  "crm/intake": typeof crm_intake;
  "crm/invitations": typeof crm_invitations;
  "crm/invoiceSettings": typeof crm_invoiceSettings;
  "crm/invoices": typeof crm_invoices;
  "crm/jobCosts": typeof crm_jobCosts;
  "crm/jobberConsultation": typeof crm_jobberConsultation;
  "crm/jobs": typeof crm_jobs;
  "crm/lib/access": typeof crm_lib_access;
  "crm/lib/assignees": typeof crm_lib_assignees;
  "crm/lib/automationRules": typeof crm_lib_automationRules;
  "crm/lib/billing": typeof crm_lib_billing;
  "crm/lib/businessNames": typeof crm_lib_businessNames;
  "crm/lib/calendarCrypto": typeof crm_lib_calendarCrypto;
  "crm/lib/calendarSync": typeof crm_lib_calendarSync;
  "crm/lib/calls": typeof crm_lib_calls;
  "crm/lib/catalogue": typeof crm_lib_catalogue;
  "crm/lib/clerk": typeof crm_lib_clerk;
  "crm/lib/clientImport": typeof crm_lib_clientImport;
  "crm/lib/clientInput": typeof crm_lib_clientInput;
  "crm/lib/codes": typeof crm_lib_codes;
  "crm/lib/construction": typeof crm_lib_construction;
  "crm/lib/consultationStage": typeof crm_lib_consultationStage;
  "crm/lib/customAutomation": typeof crm_lib_customAutomation;
  "crm/lib/disclaimers": typeof crm_lib_disclaimers;
  "crm/lib/exportCsv": typeof crm_lib_exportCsv;
  "crm/lib/fields": typeof crm_lib_fields;
  "crm/lib/formula": typeof crm_lib_formula;
  "crm/lib/invoiceMath": typeof crm_lib_invoiceMath;
  "crm/lib/jobCosts": typeof crm_lib_jobCosts;
  "crm/lib/jobNumber": typeof crm_lib_jobNumber;
  "crm/lib/jobStatus": typeof crm_lib_jobStatus;
  "crm/lib/jobberHooks": typeof crm_lib_jobberHooks;
  "crm/lib/materialStarter": typeof crm_lib_materialStarter;
  "crm/lib/mentionNotify": typeof crm_lib_mentionNotify;
  "crm/lib/mentions": typeof crm_lib_mentions;
  "crm/lib/mirror": typeof crm_lib_mirror;
  "crm/lib/noteFiles": typeof crm_lib_noteFiles;
  "crm/lib/noteText": typeof crm_lib_noteText;
  "crm/lib/permissions": typeof crm_lib_permissions;
  "crm/lib/phone": typeof crm_lib_phone;
  "crm/lib/pipelineStages": typeof crm_lib_pipelineStages;
  "crm/lib/purchaseOrders": typeof crm_lib_purchaseOrders;
  "crm/lib/quoteData": typeof crm_lib_quoteData;
  "crm/lib/quoteMath": typeof crm_lib_quoteMath;
  "crm/lib/quoteOptions": typeof crm_lib_quoteOptions;
  "crm/lib/schedule": typeof crm_lib_schedule;
  "crm/lib/stages": typeof crm_lib_stages;
  "crm/lib/svix": typeof crm_lib_svix;
  "crm/lib/systemMove": typeof crm_lib_systemMove;
  "crm/lib/takeoff": typeof crm_lib_takeoff;
  "crm/lib/workPackage": typeof crm_lib_workPackage;
  "crm/lib/zohoCalendarApi": typeof crm_lib_zohoCalendarApi;
  "crm/lib/zohoMail": typeof crm_lib_zohoMail;
  "crm/materialKits": typeof crm_materialKits;
  "crm/materials": typeof crm_materials;
  "crm/mentions": typeof crm_mentions;
  "crm/messageSend": typeof crm_messageSend;
  "crm/messages": typeof crm_messages;
  "crm/messagesHttp": typeof crm_messagesHttp;
  "crm/noteFiles": typeof crm_noteFiles;
  "crm/opportunityPage": typeof crm_opportunityPage;
  "crm/opportunityTasks": typeof crm_opportunityTasks;
  "crm/payments": typeof crm_payments;
  "crm/phoneNumbers": typeof crm_phoneNumbers;
  "crm/pipeline": typeof crm_pipeline;
  "crm/projects": typeof crm_projects;
  "crm/purchaseOrders": typeof crm_purchaseOrders;
  "crm/quoteDraft": typeof crm_quoteDraft;
  "crm/quoteFlow": typeof crm_quoteFlow;
  "crm/quoteImport": typeof crm_quoteImport;
  "crm/quotePrices": typeof crm_quotePrices;
  "crm/quotes": typeof crm_quotes;
  "crm/requestForm": typeof crm_requestForm;
  "crm/requests": typeof crm_requests;
  "crm/sampleData": typeof crm_sampleData;
  "crm/schedule": typeof crm_schedule;
  "crm/seed": typeof crm_seed;
  "crm/takeoff": typeof crm_takeoff;
  "crm/users": typeof crm_users;
  "crm/whatsapp": typeof crm_whatsapp;
  "crm/workPackages": typeof crm_workPackages;
  "crm/zohoMailSync": typeof crm_zohoMailSync;
  crons: typeof crons;
  http: typeof http;
  "jobber/client": typeof jobber_client;
  "jobber/connection": typeof jobber_connection;
  "jobber/http": typeof jobber_http;
  "jobber/mutations": typeof jobber_mutations;
  "jobber/queries": typeof jobber_queries;
  "jobber/sync": typeof jobber_sync;
  "projects/actions": typeof projects_actions;
  "projects/consultation": typeof projects_consultation;
  "projects/mutations": typeof projects_mutations;
  "projects/queries": typeof projects_queries;
  "projects/shortCode": typeof projects_shortCode;
  "projects/visits": typeof projects_visits;
  rateLimits: typeof rateLimits;
  "sales/accounts": typeof sales_accounts;
  "sales/clerk": typeof sales_clerk;
  "sales/mutations": typeof sales_mutations;
  "sales/queries": typeof sales_queries;
  "sales/session": typeof sales_session;
  "shared/catalogue": typeof shared_catalogue;
  "shared/discovery": typeof shared_discovery;
  "shared/errors": typeof shared_errors;
  "shared/jobberNames": typeof shared_jobberNames;
  "shared/priceList": typeof shared_priceList;
  "shared/quoteLines": typeof shared_quoteLines;
  "shared/usStates": typeof shared_usStates;
  "shared/visits": typeof shared_visits;
  "shared/zonedTime": typeof shared_zonedTime;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
