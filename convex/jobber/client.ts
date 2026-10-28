import { jobberKey } from "../../lib/jobber-names";

const tokenUrl = "https://api.getjobber.com/api/oauth/token";
const graphqlUrl = "https://api.getjobber.com/api/graphql";
const authorizeUrlBase = "https://api.getjobber.com/api/oauth/authorize";

export const jobberGraphqlVersion = "2026-05-12";

export class JobberError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JobberError";
  }
}

type TokenResponse = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

type GraphqlError = { message?: string };

type ClientMatch = {
  id: string;
  email: string | null;
  phone: string | null;
  clientProperties: { nodes: { id: string }[] };
};

type CatalogueProduct = {
  id: string;
  name: string;
  defaultUnitCost: number;
  visible?: boolean | null;
};

export type DraftLine = {
  name: string;
  productOrServiceId?: string;
  quantity: number;
  unitPrice: number;
};

export type JobberQuote = {
  id: string;
  quoteStatus: string;
  lineItems: { nodes: { id: string; name: string }[] };
  lineItemsTruncated: boolean;
};

export function redirectUri(siteUrl: string): string {
  return `${siteUrl.replace(/\/$/, "")}/jobber/callback`;
}

export function createOauthState(): string {
  return randomUrlSafe(16);
}

export function createCodeVerifier(): string {
  return randomUrlSafe(32);
}

export async function createCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return base64UrlEncode(new Uint8Array(digest));
}

export function authorizeUrl(args: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: args.clientId,
    redirect_uri: args.redirectUri,
    state: args.state,
    code_challenge: args.codeChallenge,
    code_challenge_method: "S256",
  });
  return `${authorizeUrlBase}?${params.toString()}`;
}

export async function exchangeAuthorizationCode(args: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<TokenResponse> {
  return await requestTokens({
    client_id: args.clientId,
    client_secret: args.clientSecret,
    grant_type: "authorization_code",
    code: args.code,
    redirect_uri: args.redirectUri,
    code_verifier: args.codeVerifier,
  });
}

export async function refreshAccessToken(args: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<TokenResponse> {
  return await requestTokens({
    client_id: args.clientId,
    client_secret: args.clientSecret,
    grant_type: "refresh_token",
    refresh_token: args.refreshToken,
  });
}

export async function findClients(
  accessToken: string,
  searchTerm: string,
): Promise<ClientMatch[]> {
  const data = await jobberGraphql<{
    clients: { nodes: ClientMatch[] };
  }>(
    accessToken,
    `query FindClient($searchTerm: String!) {
      clients(searchTerm: $searchTerm, first: 5) {
        nodes {
          id
          email
          phone
          clientProperties(first: 5) {
            nodes { id }
          }
        }
      }
    }`,
    { searchTerm },
  );
  return data.clients.nodes;
}

export async function createClient(
  accessToken: string,
  input: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    street1: string;
    street2: string;
    city: string;
    state: string;
    zip: string;
  },
): Promise<ClientMatch> {
  const data = await jobberGraphql<{
    clientCreate: {
      client: ClientMatch | null;
      userErrors: { message: string }[];
    };
  }>(
    accessToken,
    `mutation CreateClient($input: ClientCreateInput!) {
      clientCreate(input: $input) {
        client {
          id
          email
          phone
          clientProperties(first: 5) { nodes { id } }
        }
        userErrors { message }
      }
    }`,
    {
      input: {
        firstName: input.firstName,
        lastName: input.lastName,
        emails:
          input.email === ""
            ? []
            : [{ address: input.email, primary: true, description: "MAIN" }],
        phones:
          input.phone === ""
            ? []
            : [{ number: input.phone, primary: true, description: "MAIN" }],
        properties: [
          {
            address: {
              street1: input.street1,
              street2: input.street2,
              city: input.city,
              province: input.state,
              postalCode: input.zip,
              country: "US",
            },
          },
        ],
      },
    },
  );
  const message = userErrorMessage(data.clientCreate.userErrors);
  if (message !== null) throw new JobberError(message);
  if (data.clientCreate.client === null) {
    throw new JobberError("Jobber did not return a client");
  }
  return data.clientCreate.client;
}

/**
 * Creates the Jobber Request that holds what the customer originally submitted.
 * It is never edited afterwards; the quote carries the salesperson's verified numbers.
 */
export async function createRequest(args: {
  accessToken: string;
  clientId: string;
  propertyId: string;
  title: string;
  details: { label: string; value: string }[];
}): Promise<string> {
  const data = await jobberGraphql<{
    requestCreate: {
      request: { id: string } | null;
      userErrors: { message: string }[];
    };
  }>(
    args.accessToken,
    `mutation CreateRequest($input: RequestCreateInput!) {
      requestCreate(input: $input) {
        request { id }
        userErrors { message }
      }
    }`,
    {
      input: {
        clientId: args.clientId,
        propertyId: args.propertyId,
        title: args.title,
        requestDetails: {
          form: {
            sections: [
              {
                label: "Submitted by the customer",
                items: args.details.map((detail) => ({
                  label: detail.label.slice(0, 200),
                  answerText: detail.value.slice(0, 1000),
                })),
              },
            ],
          },
        },
      },
    },
  );
  const message = userErrorMessage(data.requestCreate.userErrors);
  if (message !== null) throw new JobberError(message);
  if (data.requestCreate.request === null) {
    throw new JobberError("Jobber did not return a request");
  }
  return data.requestCreate.request.id;
}

export async function editQuoteTitle(args: {
  accessToken: string;
  quoteId: string;
  title: string;
}): Promise<void> {
  const data = await jobberGraphql<{
    quoteEdit: { userErrors: { message: string }[] };
  }>(
    args.accessToken,
    `mutation EditQuoteTitle($quoteId: EncodedId!, $title: String!) {
      quoteEdit(quoteId: $quoteId, attributes: { title: $title }) {
        quote { id quoteStatus }
        userErrors { message }
      }
    }`,
    { quoteId: args.quoteId, title: args.title },
  );
  const message = userErrorMessage(data.quoteEdit.userErrors);
  if (message !== null) throw new JobberError(message);
}

export type JobberCatalogue = Map<string, CatalogueProduct> & {
  /** Keys that more than one visible Jobber item answers to; they are left out rather than guessed at. */
  ambiguous: Set<string>;
};

/**
 * Reads the product catalogue once so a quote with many lines costs one query, not one per line.
 * Items are keyed by `jobberKey`, so the client's numbered, differently worded names still match.
 */
export async function loadCatalogue(accessToken: string): Promise<JobberCatalogue> {
  const catalogue = Object.assign(new Map<string, CatalogueProduct>(), {
    ambiguous: new Set<string>(),
  });
  let after: string | null = null;
  // The catalogue holds well over 1,000 items, so read every page; hidden (replaced) items are skipped.
  for (let page = 0; page < 40; page += 1) {
    const data: {
      products: {
        nodes: CatalogueProduct[];
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    } = await jobberGraphql(
      accessToken,
      `query Catalogue($after: String) {
        products(first: 100, after: $after) {
          nodes {
            id
            name
            defaultUnitCost
            visible
          }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { after },
    );
    for (const product of data.products.nodes) {
      if (product.visible === false) continue;
      const key = jobberKey(product.name);
      if (catalogue.ambiguous.has(key)) continue;
      if (catalogue.has(key)) {
        // Two items that read the same (for example a mislabelled copy) must not be picked between by luck.
        catalogue.delete(key);
        catalogue.ambiguous.add(key);
        continue;
      }
      catalogue.set(key, product);
    }
    if (!data.products.pageInfo.hasNextPage) break;
    after = data.products.pageInfo.endCursor;
  }
  return catalogue;
}

export async function readQuote(
  accessToken: string,
  quoteId: string,
): Promise<JobberQuote | null> {
  const data = await jobberGraphql<{
    quote: {
      id: string;
      quoteStatus: string;
      lineItems: {
        nodes: { id: string; name: string }[];
        pageInfo: { hasNextPage: boolean };
      };
    } | null;
  }>(
    accessToken,
    `query QuoteLines($id: EncodedId!) {
      quote(id: $id) {
        id
        quoteStatus
        lineItems(first: 100) {
          nodes { id name }
          pageInfo { hasNextPage }
        }
      }
    }`,
    { id: quoteId },
  );
  if (data.quote === null) return null;
  return {
    id: data.quote.id,
    quoteStatus: data.quote.quoteStatus,
    lineItems: { nodes: data.quote.lineItems.nodes },
    lineItemsTruncated: data.quote.lineItems.pageInfo.hasNextPage,
  };
}

export async function createDraftQuote(args: {
  accessToken: string;
  clientId: string;
  propertyId: string;
  requestId?: string;
  title: string;
  lineItems: DraftLine[];
}): Promise<{ id: string; quoteStatus: string }> {
  const data = await jobberGraphql<{
    quoteCreate: {
      quote: { id: string; quoteStatus: string } | null;
      userErrors: { message: string }[];
    };
  }>(
    args.accessToken,
    `mutation CreateDraft($attributes: QuoteCreateAttributes!) {
      quoteCreate(attributes: $attributes) {
        quote { id quoteStatus }
        userErrors { message }
      }
    }`,
    {
      attributes: {
        clientId: args.clientId,
        propertyId: args.propertyId,
        ...(args.requestId === undefined ? {} : { requestId: args.requestId }),
        title: args.title,
        lineItems: args.lineItems.map(lineAttributes),
      },
    },
  );
  const message = userErrorMessage(data.quoteCreate.userErrors);
  if (message !== null) {
    throw new JobberError(message);
  }
  if (data.quoteCreate.quote === null) {
    throw new JobberError("Jobber did not return a quote");
  }
  return data.quoteCreate.quote;
}

export async function addDraftLines(args: {
  accessToken: string;
  quoteId: string;
  lineItems: DraftLine[];
}): Promise<void> {
  const data = await jobberGraphql<{
    quoteCreateLineItems: { userErrors: { message: string }[] };
  }>(
    args.accessToken,
    `mutation AddDraftLines($quoteId: EncodedId!, $lineItems: [QuoteCreateLineItemAttributes!]!) {
      quoteCreateLineItems(quoteId: $quoteId, lineItems: $lineItems) {
        createdLineItems { id }
        userErrors { message }
      }
    }`,
    {
      quoteId: args.quoteId,
      lineItems: args.lineItems.map(lineAttributes),
    },
  );
  const message = userErrorMessage(data.quoteCreateLineItems.userErrors);
  if (message !== null) {
    throw new JobberError(message);
  }
}

export async function removeDraftLines(args: {
  accessToken: string;
  quoteId: string;
  lineItemIds: string[];
}): Promise<void> {
  if (args.lineItemIds.length === 0) return;
  const data = await jobberGraphql<{
    quoteDeleteLineItems: { userErrors: { message: string }[] };
  }>(
    args.accessToken,
    `mutation RemoveDraftLines($quoteId: EncodedId!, $lineItemIds: [EncodedId!]!) {
      quoteDeleteLineItems(quoteId: $quoteId, lineItemIds: $lineItemIds) {
        deletedLineItems { id }
        userErrors { message }
      }
    }`,
    { quoteId: args.quoteId, lineItemIds: args.lineItemIds },
  );
  const message = userErrorMessage(data.quoteDeleteLineItems.userErrors);
  if (message !== null) {
    throw new JobberError(message);
  }
}

function lineAttributes(line: DraftLine) {
  return {
    name: line.name,
    ...(line.productOrServiceId === undefined ? {} : { productOrServiceId: line.productOrServiceId }),
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    saveToProductsAndServices: false,
  };
}

export async function readAccount(
  accessToken: string,
): Promise<{ id: string; name: string }> {
  const data = await jobberGraphql<{ account: { id: string; name: string } }>(
    accessToken,
    `query Account { account { id name } }`,
    {},
  );
  return data.account;
}

async function requestTokens(
  fields: Record<string, string>,
): Promise<TokenResponse> {
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
    signal: AbortSignal.timeout(20_000),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok || !isTokenResponse(body)) {
    throw new JobberError(tokenErrorMessage(body));
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresIn: typeof body.expires_in === "number" ? body.expires_in : 3600,
  };
}

export async function jobberGraphql<T>(
  accessToken: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(graphqlUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-JOBBER-GRAPHQL-VERSION": jobberGraphqlVersion,
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(20_000),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok || typeof body !== "object" || body === null) {
    throw new JobberError(`Jobber returned HTTP ${response.status}`);
  }
  const record = body as { data?: T | null; errors?: GraphqlError[] };
  if (record.data == null) {
    const message = (record.errors ?? [])
      .map((error) => error.message)
      .filter((message): message is string => typeof message === "string")
      .join("; ");
    throw new JobberError(message || "Jobber returned no data");
  }
  return record.data;
}

function userErrorMessage(errors: { message: string }[]): string | null {
  if (errors.length === 0) {
    return null;
  }
  return errors.map((error) => error.message).join("; ").slice(0, 500);
}

function isTokenResponse(
  value: unknown,
): value is { access_token: string; refresh_token: string; expires_in?: number } {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.access_token === "string" &&
    typeof record.refresh_token === "string"
  );
}

function tokenErrorMessage(body: unknown): string {
  if (typeof body === "object" && body !== null) {
    const description = (body as { error_description?: unknown }).error_description;
    if (typeof description === "string" && description.length > 0) {
      return `Jobber authorization failed. ${description}`.slice(0, 500);
    }
  }
  return "Jobber authorization failed. Connect the app again.";
}

function randomUrlSafe(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
