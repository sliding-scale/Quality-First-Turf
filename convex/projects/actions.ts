import { v } from "convex/values";
import { planQuoteLines } from "../../lib/quote-lines";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { action, env, internalAction } from "../_generated/server";
import {
  addDraftLines,
  createClient,
  createDraftQuote,
  createRequest,
  editQuoteTitle,
  loadCatalogue,
  findClients,
  JobberError,
  readQuote,
  refreshAccessToken,
  removeDraftLines,
  type DraftLine,
} from "../jobber/client";
import { jobberKey } from "../../lib/jobber-names";
import { rateLimiter } from "../rateLimits";
import { projectStatus } from "../schema";

const accessTokenSkewMs = 60_000;

const draftQuoteResult = v.object({
  projectId: v.id("projects"),
  status: projectStatus,
  jobberClientId: v.union(v.string(), v.null()),
  jobberRequestId: v.union(v.string(), v.null()),
  jobberQuoteId: v.union(v.string(), v.null()),
  missingMapping: v.union(v.string(), v.null()),
  integrationError: v.union(v.string(), v.null()),
});

type DraftQuoteResult = {
  projectId: Doc<"projects">["_id"];
  status: Doc<"projects">["status"];
  jobberClientId: string | null;
  jobberRequestId: string | null;
  jobberQuoteId: string | null;
  missingMapping: string | null;
  integrationError: string | null;
};

async function loadAndDraft(
  ctx: ActionCtx,
  projectId: Doc<"projects">["_id"],
): Promise<DraftQuoteResult> {
  const loaded: {
    project: Doc<"projects">;
    workAreas: Doc<"workAreas">[];
  } | null = await ctx.runQuery(internal.projects.queries.get, { projectId });
  if (loaded === null) {
    throw new Error("Project not found");
  }
  if (!(await ctx.runMutation(internal.projects.mutations.claimDraft, { projectId }))) {
    return busyResult(loaded.project);
  }
  try {
    return await draftForProject(ctx, loaded.project, loaded.workAreas);
  } catch (error) {
    return await remember(ctx, loaded.project, {
      status: "needs attention",
      jobberClientId: loaded.project.jobberClientId,
      jobberRequestId: loaded.project.jobberRequestId ?? null,
      jobberQuoteId: loaded.project.jobberQuoteId,
      missingMapping: null,
      integrationError: describe(error),
    });
  }
}

function busyResult(project: Doc<"projects">): DraftQuoteResult {
  return {
    projectId: project._id,
    status: project.status,
    jobberClientId: project.jobberClientId,
    jobberRequestId: project.jobberRequestId ?? null,
    jobberQuoteId: project.jobberQuoteId,
    missingMapping: project.missingMapping,
    integrationError: "A quote is already being drafted for this project. Try again in a minute.",
  };
}

/** The customer-facing action never echoes Jobber ids or upstream error text. */
function publicResult(result: DraftQuoteResult): DraftQuoteResult {
  return {
    ...result,
    jobberClientId: null,
    jobberRequestId: null,
    missingMapping: result.missingMapping === null ? null : "Some items need a manual check.",
    integrationError:
      result.integrationError === null
        ? null
        : "The request could not be sent to the office automatically. The office will follow up.",
  };
}

/** Lists the product names and default prices in Jobber, read-only, to line the app's item names up with the real ones. */
export const listCatalogue = internalAction({
  args: {},
  returns: v.array(v.object({ name: v.string(), unitCost: v.number() })),
  handler: async (ctx) => {
    const accessToken = await accessTokenFor(ctx);
    const catalogue = await loadCatalogue(accessToken);
    return [...catalogue.values()].map((product) => ({
      name: product.name,
      unitCost: product.defaultUnitCost,
    }));
  },
});

export const publishVisit = action({
  args: { projectId: v.id("projects") },
  returns: draftQuoteResult,
  handler: async (ctx, args): Promise<DraftQuoteResult> => {
    const loaded: {
      project: Doc<"projects">;
      workAreas: Doc<"workAreas">[];
    } | null = await ctx.runQuery(internal.projects.queries.get, {
      projectId: args.projectId,
    });
    if (loaded === null) throw new Error("Project not found");
    await rateLimiter.limit(ctx, "publishVisit", { throws: true });
    if (!(await ctx.runMutation(internal.projects.mutations.claimDraft, { projectId: args.projectId }))) {
      return publicResult(busyResult(loaded.project));
    }
    try {
      return publicResult(await publishForProject(ctx, loaded.project));
    } catch (error) {
      return publicResult(
        await remember(ctx, loaded.project, {
          status: loaded.project.jobberQuoteId === null ? "needs attention" : loaded.project.status,
          jobberClientId: loaded.project.jobberClientId,
          jobberRequestId: loaded.project.jobberRequestId ?? null,
          jobberQuoteId: loaded.project.jobberQuoteId,
          missingMapping: loaded.project.missingMapping,
          integrationError: describe(error),
        }),
      );
    }
  },
});

export const draftVisit = action({
  args: {
    sessionToken: v.string(),
    projectId: v.id("projects"),
  },
  returns: draftQuoteResult,
  handler: async (ctx, args): Promise<DraftQuoteResult> => {
    const signedIn = await ctx.runQuery(internal.sales.queries.active, {
      sessionToken: args.sessionToken,
    });
    if (!signedIn) throw new Error("Sign in again to open projects.");
    return await loadAndDraft(ctx, args.projectId);
  },
});

async function draftForProject(
  ctx: ActionCtx,
  project: Doc<"projects">,
  workAreas: Doc<"workAreas">[],
): Promise<DraftQuoteResult> {
  const planned = planQuoteLines({
    services: project.services,
    products: project.products,
    answers: project.answers,
    measurements: project.measurements,
    workAreas,
  });
  if (planned.missing !== null) {
    return await remember(ctx, project, {
      status: "needs attention",
      jobberClientId: project.jobberClientId,
      jobberQuoteId: project.jobberQuoteId,
      missingMapping: planned.missing,
      integrationError: null,
    });
  }

  const accessToken = await accessTokenFor(ctx);
  const client = await ensureClient(accessToken, project);
  const propertyId = client.clientProperties.nodes[0]?.id ?? null;
  if (propertyId === null) {
    return await remember(ctx, project, {
      status: "needs attention",
      jobberClientId: client.id,
      jobberQuoteId: project.jobberQuoteId,
      missingMapping: null,
      integrationError: "The Jobber client has no property.",
    });
  }

  const catalogue = await loadCatalogue(accessToken);
  const lines: DraftLine[] = [];
  const missingNames: string[] = [];
  const ambiguousNames: string[] = [];
  for (const plannedLine of planned.lines) {
    const key = jobberKey(plannedLine.name);
    if (catalogue.ambiguous.has(key)) {
      ambiguousNames.push(plannedLine.name);
      continue;
    }
    const product = catalogue.get(key) ?? null;
    if (product === null || !Number.isFinite(product.defaultUnitCost)) {
      missingNames.push(plannedLine.name);
      continue;
    }
    lines.push({
      name: product.name,
      productOrServiceId: product.id,
      quantity: plannedLine.quantity,
      unitPrice: product.defaultUnitCost,
    });
  }
  if (missingNames.length > 0 || ambiguousNames.length > 0) {
    return await remember(ctx, project, {
      status: "needs attention",
      jobberClientId: client.id,
      jobberQuoteId: project.jobberQuoteId,
      missingMapping: [
        ...missingNames.map((name) => `${name} has no Jobber item`),
        ...ambiguousNames.map((name) => `${name} matches more than one Jobber item`),
      ]
        .join(" ")
        .slice(0, 500),
      integrationError: null,
    });
  }

  const kept = {
    jobberClientId: client.id,
    jobberQuoteId: project.jobberQuoteId,
    missingMapping: null,
  };

  if (project.jobberQuoteId === null) {
    const created = await createDraftQuote({
      accessToken,
      clientId: client.id,
      propertyId,
      requestId: project.jobberRequestId ?? undefined,
      title: quoteTitle(project),
      lineItems: lines,
    });
    if (created.quoteStatus !== "draft") {
      return await remember(ctx, project, {
        status: "needs attention",
        ...kept,
        jobberQuoteId: created.id,
        integrationError: "Jobber did not leave the quote as a draft.",
      });
    }
    return await remember(ctx, project, {
      status: "quote drafted",
      ...kept,
      jobberQuoteId: created.id,
      integrationError: null,
    });
  }

  const existing = await readQuote(accessToken, project.jobberQuoteId);
  if (existing === null) {
    return await remember(ctx, project, {
      status: "needs attention",
      ...kept,
      integrationError: "Stored Jobber quote was not found. A second quote was not created.",
    });
  }
  if (existing.quoteStatus !== "draft") {
    return await remember(ctx, project, {
      status: "needs attention",
      ...kept,
      integrationError: "The stored Jobber quote is no longer a draft. It was not changed.",
    });
  }
  if (existing.lineItemsTruncated) {
    return await remember(ctx, project, {
      status: "needs attention",
      ...kept,
      integrationError: "The stored quote has too many lines to replace. A second quote was not created.",
    });
  }

  const previousIds = existing.lineItems.nodes.map((item) => item.id);
  await addDraftLines({
    accessToken,
    quoteId: project.jobberQuoteId,
    lineItems: lines,
  });
  await removeDraftLines({
    accessToken,
    quoteId: project.jobberQuoteId,
    lineItemIds: previousIds,
  });
  await editQuoteTitle({
    accessToken,
    quoteId: project.jobberQuoteId,
    title: quoteTitle(project),
  });
  const updated = await readQuote(accessToken, project.jobberQuoteId);
  if (updated === null || updated.quoteStatus !== "draft") {
    return await remember(ctx, project, {
      status: "needs attention",
      ...kept,
      integrationError: "Jobber did not leave the quote as a draft.",
    });
  }
  return await remember(ctx, project, {
    status: "quote drafted",
    ...kept,
    integrationError: null,
  });
}

export async function accessTokenFor(ctx: ActionCtx): Promise<string> {
  const clientId = env.JOBBER_CLIENT_ID;
  const clientSecret = env.JOBBER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new JobberError(
      "Jobber app credentials are not set on the Convex deployment.",
    );
  }
  const connection = await ctx.runQuery(internal.jobber.queries.get, {});
  if (connection === null || connection.refreshToken === null) {
    throw new JobberError(
      "Jobber is not connected. Open the connect link and allow access.",
    );
  }
  const now = Date.now();
  if (
    connection.accessToken !== null &&
    connection.accessTokenExpiresAt !== null &&
    connection.accessTokenExpiresAt > now + accessTokenSkewMs
  ) {
    return connection.accessToken;
  }
  const tokens = await refreshAccessToken({
    clientId,
    clientSecret,
    refreshToken: connection.refreshToken,
  });
  await ctx.runMutation(internal.jobber.mutations.saveTokens, {
    refreshToken: tokens.refreshToken,
    accessToken: tokens.accessToken,
    accessTokenExpiresAt: now + tokens.expiresIn * 1000,
    accountId: connection.accountId,
    accountName: connection.accountName,
  });
  return tokens.accessToken;
}

async function publishForProject(
  ctx: ActionCtx,
  project: Doc<"projects">,
): Promise<DraftQuoteResult> {
  if (project.jobberRequestId) {
    return {
      projectId: project._id,
      status: project.status,
      jobberClientId: project.jobberClientId,
      jobberRequestId: project.jobberRequestId,
      jobberQuoteId: project.jobberQuoteId,
      missingMapping: project.missingMapping,
      integrationError: null,
    };
  }
  const accessToken = await accessTokenFor(ctx);
  const client = await ensureClient(accessToken, project);
  const propertyId = client.clientProperties.nodes[0]?.id ?? null;
  if (propertyId === null) {
    return await remember(ctx, project, {
      status: "needs attention",
      jobberClientId: client.id,
      jobberQuoteId: project.jobberQuoteId,
      missingMapping: null,
      integrationError: "The Jobber client has no property.",
    });
  }

  // The customer's submission becomes a Request only. The quote is drafted later, from the on-site visit.
  let requestId = project.jobberRequestId ?? null;
  if (requestId === null) {
    try {
      requestId = await createRequest({
        accessToken,
        clientId: client.id,
        propertyId,
        title: quoteTitle(project),
        details: submissionDetails(project),
      });
    } catch (error) {
      return await remember(ctx, project, {
        status: "needs attention",
        jobberClientId: client.id,
        jobberQuoteId: null,
        missingMapping: null,
        integrationError: describe(error),
      });
    }
  }
  return await remember(ctx, project, {
    status: project.status,
    jobberClientId: client.id,
    jobberRequestId: requestId,
    jobberQuoteId: project.jobberQuoteId,
    missingMapping: null,
    integrationError: null,
  });
}

async function ensureClient(accessToken: string, project: Doc<"projects">) {
  const matched = await matchClient(accessToken, project.email, project.phone);
  if (matched) return matched;
  return await createClient(accessToken, {
    firstName: project.firstName,
    lastName: project.lastName,
    email: project.email,
    phone: project.phone,
    street1: project.street1,
    street2: project.street2,
    city: project.city,
    state: project.state,
    zip: project.zip,
  });
}

/** The customer's submission as label/value rows for the Jobber Request. */
function submissionDetails(project: Doc<"projects">): { label: string; value: string }[] {
  const source = project.submitted ?? project;
  const rows: { label: string; value: string }[] = [
    { label: "Name", value: `${source.firstName} ${source.lastName}`.trim() },
    { label: "Phone", value: source.phone },
    { label: "Email", value: source.email },
    {
      label: "Property address",
      value: [source.street1, source.street2, source.city, source.state, source.zip]
        .filter((part) => part.trim() !== "")
        .join(", "),
    },
    { label: "Services", value: source.services.join(", ") },
  ];
  for (const answer of source.answers.slice(0, 60)) {
    rows.push({ label: answer.question, value: answer.value });
  }
  for (const measurement of source.measurements.slice(0, 40)) {
    const size =
      measurement.unmeasured
        ? "Not measured"
        : measurement.squareFeet !== null
          ? `${measurement.squareFeet} sq ft`
          : measurement.linearFeet !== null
            ? `${measurement.linearFeet} linear ft`
            : "No size";
    rows.push({ label: `Customer estimate · ${measurement.label}`, value: size });
  }
  if (source.notes.trim() !== "") rows.push({ label: "Notes", value: source.notes });
  return rows.filter((row) => row.value.trim() !== "");
}

function quoteTitle(project: Doc<"projects">): string {
  return `${project.firstName} ${project.lastName} · ${project.shortCode ?? project._id}`.trim();
}

async function matchClient(
  accessToken: string,
  email: string,
  phone: string,
) {
  const trimmedEmail = email.trim();
  const phoneDigits = phone.replace(/\D/g, "").slice(-10);
  if (trimmedEmail !== "") {
    const byEmail = await findClients(accessToken, trimmedEmail);
    const emailMatch = byEmail.find(
      (client) =>
        client.email !== null &&
        client.email.toLowerCase() === trimmedEmail.toLowerCase(),
    );
    if (emailMatch) {
      return emailMatch;
    }
  }
  if (phoneDigits.length < 10) {
    return null;
  }
  const byPhone = await findClients(accessToken, phoneDigits);
  return (
    byPhone.find(
      (client) => client.phone !== null && client.phone.replace(/\D/g, "").slice(-10) === phoneDigits,
    ) ?? null
  );
}

async function remember(
  ctx: ActionCtx,
  project: Doc<"projects">,
  outcome: Omit<DraftQuoteResult, "projectId" | "jobberRequestId"> & {
    jobberRequestId?: string | null;
  },
): Promise<DraftQuoteResult> {
  const stored = {
    ...outcome,
    jobberRequestId: outcome.jobberRequestId ?? project.jobberRequestId ?? null,
  };
  await ctx.runMutation(internal.projects.mutations.recordJobberResult, {
    projectId: project._id,
    ...stored,
  });
  return { projectId: project._id, ...stored };
}

function describe(error: unknown): string {
  const message = error instanceof Error ? error.message : "Jobber request failed";
  console.error("Jobber draft failed:", message);
  return message.slice(0, 500);
}
