/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

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
import type * as rateLimits from "../rateLimits.js";
import type * as sales_accounts from "../sales/accounts.js";
import type * as sales_login from "../sales/login.js";
import type * as sales_mutations from "../sales/mutations.js";
import type * as sales_queries from "../sales/queries.js";
import type * as sales_session from "../sales/session.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
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
  rateLimits: typeof rateLimits;
  "sales/accounts": typeof sales_accounts;
  "sales/login": typeof sales_login;
  "sales/mutations": typeof sales_mutations;
  "sales/queries": typeof sales_queries;
  "sales/session": typeof sales_session;
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
