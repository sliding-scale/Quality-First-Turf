import { v } from "convex/values";
import { catalogue } from "../../lib/catalogue";
import { priceUnit, retailPrice } from "../../lib/price-list";
import { internalAction } from "../_generated/server";
import { accessTokenFor } from "../projects/actions";
import { jobberGraphql } from "./client";

/**
 * Read-only: what the Jobber API says about a GraphQL type, so product maintenance can be
 * written against the real schema instead of guesses.
 */
export const describeType = internalAction({
  args: { name: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    const accessToken = await accessTokenFor(ctx);
    const data = await jobberGraphql<{
      __type: {
        name: string;
        kind: string;
        fields: { name: string; args: { name: string; type: unknown }[]; type: unknown }[] | null;
        inputFields: { name: string; type: unknown }[] | null;
        enumValues: { name: string }[] | null;
      } | null;
    }>(
      accessToken,
      `query Describe($name: String!) {
        __type(name: $name) {
          name
          kind
          fields { name args { name type { ...T } } type { ...T } }
          inputFields { name type { ...T } }
          enumValues { name }
        }
      }
      fragment T on __Type { kind name ofType { kind name ofType { kind name ofType { kind name } } } }`,
      { name: args.name },
    );
    return data.__type;
  },
});

type Existing = {
  id: string;
  name: string;
  defaultUnitCost: number;
  visible: boolean | null;
  category: string;
};

async function listEverything(accessToken: string): Promise<Existing[]> {
  const all: Existing[] = [];
  let after: string | null = null;
  for (let page = 0; page < 40; page += 1) {
    const data: {
      products: {
        nodes: Existing[];
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    } = await jobberGraphql(
      accessToken,
      `query Everything($after: String) {
        products(first: 100, after: $after) {
          nodes { id name defaultUnitCost visible category }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { after },
    );
    all.push(...data.products.nodes);
    if (!data.products.pageInfo.hasNextPage) break;
    after = data.products.pageInfo.endCursor;
  }
  return all;
}

/** The retail items the 2026 price list covers, named exactly as the app looks them up. */
function wantedItems() {
  const wanted: { name: string; price: number; description: string }[] = [];
  for (const item of catalogue) {
    if (item.customerType !== "Homeowner") continue;
    const price = retailPrice(item);
    if (price === null) continue;
    const description = [
      item.service,
      item.installType,
      item.product,
      item.areaBand,
      item.addOn,
      item.soil,
      `per ${priceUnit(item)}`,
    ]
      .filter((part): part is string => part !== null)
      .join(" · ");
    wanted.push({ name: item.name, price, description });
  }
  return wanted;
}

/**
 * The placeholder retail items the price list replaces: grass, putting green, demolition,
 * underground and lighting, under the old DUMMY names. Contractor (CP) items, and the services
 * the list does not cover, are left alone.
 */
function isReplacedPlaceholder(name: string): boolean {
  return /^DUMMY RP - (AG |Putting Green|Demo |Underground |Lighting )/.test(name);
}

/** Read-only: what a sync would create, reprice and hide. Nothing is changed. */
export const plan = internalAction({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const accessToken = await accessTokenFor(ctx);
    const existing = await listEverything(accessToken);
    const byName = new Map(existing.map((entry) => [entry.name, entry]));
    const wanted = wantedItems();
    const toCreate = wanted.filter((entry) => !byName.has(entry.name));
    const toReprice = wanted.filter((entry) => {
      const found = byName.get(entry.name);
      return found !== undefined && Math.abs(found.defaultUnitCost - entry.price) > 0.001;
    });
    const toHide = existing.filter((entry) => isReplacedPlaceholder(entry.name) && entry.visible !== false);
    return {
      counts: {
        inJobber: existing.length,
        wanted: wanted.length,
        toCreate: toCreate.length,
        toReprice: toReprice.length,
        toHide: toHide.length,
        leftAlone: existing.length - toHide.length,
      },
      toHide: toHide.map((entry) => ({ id: entry.id, name: entry.name, price: entry.defaultUnitCost })),
      toCreate: toCreate.map((entry) => ({ name: entry.name, price: entry.price })),
      toReprice: toReprice.map((entry) => ({ name: entry.name, price: entry.price })),
    };
  },
});

async function pause(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** Runs a Jobber mutation, waiting and retrying when Jobber says it is throttling. */
async function withRetry<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (attempt < 6 && /throttl|rate limit|too many/i.test(message)) {
        await pause(2000 * (attempt + 1));
        continue;
      }
      throw error;
    }
  }
}

type MutationResult = { userErrors: { message: string }[] };

async function createItem(accessToken: string, entry: { name: string; price: number; description: string }) {
  const data = await withRetry(() =>
    jobberGraphql<{ productsAndServicesCreate: MutationResult }>(
      accessToken,
      `mutation CreateItem($input: ProductsAndServicesInput!) {
        productsAndServicesCreate(input: $input) {
          productOrService { id }
          userErrors { message }
        }
      }`,
      {
        input: {
          name: entry.name,
          description: entry.description,
          category: "SERVICE",
          defaultUnitCost: entry.price,
        },
      },
    ),
  );
  const problem = data.productsAndServicesCreate.userErrors.map((error) => error.message).join("; ");
  if (problem !== "") throw new Error(problem);
}

async function editItem(
  accessToken: string,
  id: string,
  input: { defaultUnitCost?: number; visible?: boolean },
) {
  const data = await withRetry(() =>
    jobberGraphql<{ productsAndServicesEdit: MutationResult }>(
      accessToken,
      `mutation EditItem($id: EncodedId!, $input: ProductsAndServicesEditInput!) {
        productsAndServicesEdit(productOrServiceId: $id, input: $input) {
          productOrService { id }
          userErrors { message }
        }
      }`,
      { id, input },
    ),
  );
  const problem = data.productsAndServicesEdit.userErrors.map((error) => error.message).join("; ");
  if (problem !== "") throw new Error(problem);
}

/**
 * Applies one batch of the sync. `create` adds missing items and corrects prices; `hide` hides the
 * replaced placeholders (Jobber has no delete, so they are made invisible, not removed).
 * Safe to run again: it only touches what is still outstanding, and stops after three errors.
 */
export const apply = internalAction({
  args: { phase: v.union(v.literal("create"), v.literal("hide")), limit: v.number() },
  returns: v.any(),
  handler: async (ctx, args) => {
    const accessToken = await accessTokenFor(ctx);
    const existing = await listEverything(accessToken);
    const byName = new Map(existing.map((entry) => [entry.name, entry]));
    const errors: string[] = [];
    let done = 0;

    if (args.phase === "create") {
      const outstanding = wantedItems().filter((entry) => {
        const found = byName.get(entry.name);
        return found === undefined || Math.abs(found.defaultUnitCost - entry.price) > 0.001 || found.visible === false;
      });
      for (const entry of outstanding.slice(0, args.limit)) {
        const found = byName.get(entry.name);
        try {
          if (found === undefined) await createItem(accessToken, entry);
          else await editItem(accessToken, found.id, { defaultUnitCost: entry.price, visible: true });
          done += 1;
        } catch (error) {
          errors.push(`${entry.name}: ${error instanceof Error ? error.message : "failed"}`);
          if (errors.length >= 3) break;
        }
        await pause(150);
      }
      return { phase: args.phase, done, remaining: Math.max(0, outstanding.length - done), errors };
    }

    const stale = existing.filter((entry) => isReplacedPlaceholder(entry.name) && entry.visible !== false);
    for (const entry of stale.slice(0, args.limit)) {
      try {
        await editItem(accessToken, entry.id, { visible: false });
        done += 1;
      } catch (error) {
        errors.push(`${entry.name}: ${error instanceof Error ? error.message : "failed"}`);
        if (errors.length >= 3) break;
      }
      await pause(150);
    }
    return { phase: args.phase, done, remaining: Math.max(0, stale.length - done), errors };
  },
});

/** Read-only: a Request and a Quote as Jobber holds them, to check what a project pushed. */
export const inspect = internalAction({
  args: { requestId: v.optional(v.string()), quoteId: v.optional(v.string()), clientId: v.optional(v.string()) },
  returns: v.any(),
  handler: async (ctx, args) => {
    const accessToken = await accessTokenFor(ctx);
    const result: Record<string, unknown> = {};
    if (args.requestId !== undefined) {
      const data = await jobberGraphql<{ request: unknown }>(
        accessToken,
        `query R($id: EncodedId!) {
          request(id: $id) {
            id title requestStatus createdAt jobberWebUri
            client { name }
            assessment { id title startAt endAt duration instructions clientConfirmed linkedCommunications(first: 5) { totalCount } }
            requestDetails { form { sections(first: 5) { nodes { label items(first: 80) { nodes { label } } } } } }
            quotes(first: 5) { nodes { id quoteNumber quoteStatus } }
          }
        }`,
        { id: args.requestId },
      );
      result.request = data.request;
    }
    if (args.clientId !== undefined) {
      const data = await jobberGraphql<{ client: unknown }>(
        accessToken,
        `query C($id: EncodedId!) {
          client(id: $id) {
            name
            quotes(first: 10) { nodes { id quoteNumber quoteStatus title } }
            requests(first: 10) { nodes { id title requestStatus } }
          }
        }`,
        { id: args.clientId },
      );
      result.client = data.client;
    }
    if (args.quoteId !== undefined) {
      const data = await jobberGraphql<{ quote: unknown }>(
        accessToken,
        `query Q($id: EncodedId!) {
          quote(id: $id) {
            id title quoteNumber quoteStatus jobberWebUri
            request { id requestStatus }
            amounts { subtotal total }
            lineItems(first: 100) { nodes { name quantity unitPrice totalPrice } }
          }
        }`,
        { id: args.quoteId },
      );
      result.quote = data.quote;
    }
    return result;
  },
});
