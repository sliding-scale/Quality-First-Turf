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
import type * as crm_businesses from "../crm/businesses.js";
import type * as crm_calendarConnect from "../crm/calendarConnect.js";
import type * as crm_calendarHttp from "../crm/calendarHttp.js";
import type * as crm_calendarSync from "../crm/calendarSync.js";
import type * as crm_clerkWebhook from "../crm/clerkWebhook.js";
import type * as crm_clientImport from "../crm/clientImport.js";
import type * as crm_clientMail from "../crm/clientMail.js";
import type * as crm_clientQuote from "../crm/clientQuote.js";
import type * as crm_clients from "../crm/clients.js";
import type * as crm_customAutomations from "../crm/customAutomations.js";
import type * as crm_devBoardDemo from "../crm/devBoardDemo.js";
import type * as crm_disclaimers from "../crm/disclaimers.js";
import type * as crm_intake from "../crm/intake.js";
import type * as crm_invitations from "../crm/invitations.js";
import type * as crm_lib_access from "../crm/lib/access.js";
import type * as crm_lib_assignees from "../crm/lib/assignees.js";
import type * as crm_lib_automationRules from "../crm/lib/automationRules.js";
import type * as crm_lib_businessNames from "../crm/lib/businessNames.js";
import type * as crm_lib_calendarCrypto from "../crm/lib/calendarCrypto.js";
import type * as crm_lib_calendarSync from "../crm/lib/calendarSync.js";
import type * as crm_lib_clerk from "../crm/lib/clerk.js";
import type * as crm_lib_clientInput from "../crm/lib/clientInput.js";
import type * as crm_lib_codes from "../crm/lib/codes.js";
import type * as crm_lib_customAutomation from "../crm/lib/customAutomation.js";
import type * as crm_lib_disclaimers from "../crm/lib/disclaimers.js";
import type * as crm_lib_fields from "../crm/lib/fields.js";
import type * as crm_lib_mentionNotify from "../crm/lib/mentionNotify.js";
import type * as crm_lib_mentions from "../crm/lib/mentions.js";
import type * as crm_lib_mirror from "../crm/lib/mirror.js";
import type * as crm_lib_noteFiles from "../crm/lib/noteFiles.js";
import type * as crm_lib_noteText from "../crm/lib/noteText.js";
import type * as crm_lib_pipelineStages from "../crm/lib/pipelineStages.js";
import type * as crm_lib_quoteData from "../crm/lib/quoteData.js";
import type * as crm_lib_quoteMath from "../crm/lib/quoteMath.js";
import type * as crm_lib_quoteOptions from "../crm/lib/quoteOptions.js";
import type * as crm_lib_schedule from "../crm/lib/schedule.js";
import type * as crm_lib_stages from "../crm/lib/stages.js";
import type * as crm_lib_svix from "../crm/lib/svix.js";
import type * as crm_lib_systemMove from "../crm/lib/systemMove.js";
import type * as crm_lib_zohoCalendarApi from "../crm/lib/zohoCalendarApi.js";
import type * as crm_lib_zohoMail from "../crm/lib/zohoMail.js";
import type * as crm_mentions from "../crm/mentions.js";
import type * as crm_noteFiles from "../crm/noteFiles.js";
import type * as crm_opportunityTasks from "../crm/opportunityTasks.js";
import type * as crm_pipeline from "../crm/pipeline.js";
import type * as crm_projects from "../crm/projects.js";
import type * as crm_quoteDraft from "../crm/quoteDraft.js";
import type * as crm_quoteFlow from "../crm/quoteFlow.js";
import type * as crm_quoteImport from "../crm/quoteImport.js";
import type * as crm_quotePrices from "../crm/quotePrices.js";
import type * as crm_quotes from "../crm/quotes.js";
import type * as crm_requests from "../crm/requests.js";
import type * as crm_sampleData from "../crm/sampleData.js";
import type * as crm_schedule from "../crm/schedule.js";
import type * as crm_seed from "../crm/seed.js";
import type * as crm_users from "../crm/users.js";
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
  "crm/businesses": typeof crm_businesses;
  "crm/calendarConnect": typeof crm_calendarConnect;
  "crm/calendarHttp": typeof crm_calendarHttp;
  "crm/calendarSync": typeof crm_calendarSync;
  "crm/clerkWebhook": typeof crm_clerkWebhook;
  "crm/clientImport": typeof crm_clientImport;
  "crm/clientMail": typeof crm_clientMail;
  "crm/clientQuote": typeof crm_clientQuote;
  "crm/clients": typeof crm_clients;
  "crm/customAutomations": typeof crm_customAutomations;
  "crm/devBoardDemo": typeof crm_devBoardDemo;
  "crm/disclaimers": typeof crm_disclaimers;
  "crm/intake": typeof crm_intake;
  "crm/invitations": typeof crm_invitations;
  "crm/lib/access": typeof crm_lib_access;
  "crm/lib/assignees": typeof crm_lib_assignees;
  "crm/lib/automationRules": typeof crm_lib_automationRules;
  "crm/lib/businessNames": typeof crm_lib_businessNames;
  "crm/lib/calendarCrypto": typeof crm_lib_calendarCrypto;
  "crm/lib/calendarSync": typeof crm_lib_calendarSync;
  "crm/lib/clerk": typeof crm_lib_clerk;
  "crm/lib/clientInput": typeof crm_lib_clientInput;
  "crm/lib/codes": typeof crm_lib_codes;
  "crm/lib/customAutomation": typeof crm_lib_customAutomation;
  "crm/lib/disclaimers": typeof crm_lib_disclaimers;
  "crm/lib/fields": typeof crm_lib_fields;
  "crm/lib/mentionNotify": typeof crm_lib_mentionNotify;
  "crm/lib/mentions": typeof crm_lib_mentions;
  "crm/lib/mirror": typeof crm_lib_mirror;
  "crm/lib/noteFiles": typeof crm_lib_noteFiles;
  "crm/lib/noteText": typeof crm_lib_noteText;
  "crm/lib/pipelineStages": typeof crm_lib_pipelineStages;
  "crm/lib/quoteData": typeof crm_lib_quoteData;
  "crm/lib/quoteMath": typeof crm_lib_quoteMath;
  "crm/lib/quoteOptions": typeof crm_lib_quoteOptions;
  "crm/lib/schedule": typeof crm_lib_schedule;
  "crm/lib/stages": typeof crm_lib_stages;
  "crm/lib/svix": typeof crm_lib_svix;
  "crm/lib/systemMove": typeof crm_lib_systemMove;
  "crm/lib/zohoCalendarApi": typeof crm_lib_zohoCalendarApi;
  "crm/lib/zohoMail": typeof crm_lib_zohoMail;
  "crm/mentions": typeof crm_mentions;
  "crm/noteFiles": typeof crm_noteFiles;
  "crm/opportunityTasks": typeof crm_opportunityTasks;
  "crm/pipeline": typeof crm_pipeline;
  "crm/projects": typeof crm_projects;
  "crm/quoteDraft": typeof crm_quoteDraft;
  "crm/quoteFlow": typeof crm_quoteFlow;
  "crm/quoteImport": typeof crm_quoteImport;
  "crm/quotePrices": typeof crm_quotePrices;
  "crm/quotes": typeof crm_quotes;
  "crm/requests": typeof crm_requests;
  "crm/sampleData": typeof crm_sampleData;
  "crm/schedule": typeof crm_schedule;
  "crm/seed": typeof crm_seed;
  "crm/users": typeof crm_users;
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
