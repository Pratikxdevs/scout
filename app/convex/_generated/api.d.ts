/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as actions_discovery from "../actions/discovery.js";
import type * as actions_fetchPages from "../actions/fetchPages.js";
import type * as actions_generateOutreachDraft from "../actions/generateOutreachDraft.js";
import type * as actions_qualifyLeads from "../actions/qualifyLeads.js";
import type * as activityLogs from "../activityLogs.js";
import type * as leads from "../leads.js";
import type * as lib_actor from "../lib/actor.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_limits from "../lib/limits.js";
import type * as lib_prompt from "../lib/prompt.js";
import type * as lib_scoring from "../lib/scoring.js";
import type * as lib_urls from "../lib/urls.js";
import type * as outreachDrafts from "../outreachDrafts.js";
import type * as profiles from "../profiles.js";
import type * as providers_llm from "../providers/llm.js";
import type * as providers_tinyfish from "../providers/tinyfish.js";
import type * as searchRuns from "../searchRuns.js";
import type * as searchTasks from "../searchTasks.js";
import type * as usage from "../usage.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "actions/discovery": typeof actions_discovery;
  "actions/fetchPages": typeof actions_fetchPages;
  "actions/generateOutreachDraft": typeof actions_generateOutreachDraft;
  "actions/qualifyLeads": typeof actions_qualifyLeads;
  activityLogs: typeof activityLogs;
  leads: typeof leads;
  "lib/actor": typeof lib_actor;
  "lib/errors": typeof lib_errors;
  "lib/limits": typeof lib_limits;
  "lib/prompt": typeof lib_prompt;
  "lib/scoring": typeof lib_scoring;
  "lib/urls": typeof lib_urls;
  outreachDrafts: typeof outreachDrafts;
  profiles: typeof profiles;
  "providers/llm": typeof providers_llm;
  "providers/tinyfish": typeof providers_tinyfish;
  searchRuns: typeof searchRuns;
  searchTasks: typeof searchTasks;
  usage: typeof usage;
  users: typeof users;
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

export declare const components: {};
