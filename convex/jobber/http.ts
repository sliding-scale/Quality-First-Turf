import { internal } from "../_generated/api";
import { env, httpAction } from "../_generated/server";
import {
  authorizeUrl,
  createCodeChallenge,
  createCodeVerifier,
  createOauthState,
  exchangeAuthorizationCode,
  JobberError,
  readAccount,
  redirectUri,
} from "./client";

export const connect = httpAction(async (ctx, request) => {
  const connectKey = env.JOBBER_CONNECT_KEY;
  const suppliedKey = new URL(request.url).searchParams.get("key") ?? "";
  if (!connectKey || !(await sameSecret(suppliedKey, connectKey))) {
    return page(
      403,
      "Not allowed",
      "Open this page with the connect key: /jobber/connect?key=… (set JOBBER_CONNECT_KEY on the Convex deployment).",
    );
  }

  const clientId = env.JOBBER_CLIENT_ID;
  const clientSecret = env.JOBBER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return page(
      500,
      "Jobber is not configured",
      "Set JOBBER_CLIENT_ID and JOBBER_CLIENT_SECRET on the Convex deployment, then open this page again.",
    );
  }

  const state = createOauthState();
  const codeVerifier = createCodeVerifier();
  const codeChallenge = await createCodeChallenge(codeVerifier);
  await ctx.runMutation(internal.jobber.mutations.beginAuthorization, {
    oauthState: state,
    codeVerifier,
  });

  const location = authorizeUrl({
    clientId,
    redirectUri: redirectUri(env.CONVEX_SITE_URL),
    state,
    codeChallenge,
  });
  return new Response(null, {
    status: 302,
    headers: { Location: location },
  });
});

export const callback = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  if (url.searchParams.get("error")) {
    return page(
      400,
      "Jobber was not connected",
      "Access was not granted. Start again from the connect link.",
    );
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return page(
      400,
      "Jobber was not connected",
      "Jobber did not return an authorization code. Start again from the connect link.",
    );
  }

  const clientId = env.JOBBER_CLIENT_ID;
  const clientSecret = env.JOBBER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return page(
      500,
      "Jobber is not configured",
      "Set JOBBER_CLIENT_ID and JOBBER_CLIENT_SECRET on the Convex deployment, then start again.",
    );
  }

  const connection = await ctx.runQuery(internal.jobber.queries.get, {});
  if (
    connection === null ||
    connection.oauthState !== state ||
    connection.codeVerifier === null
  ) {
    return page(
      400,
      "Jobber was not connected",
      "This connection attempt did not match. Start again from the connect link.",
    );
  }

  try {
    const tokens = await exchangeAuthorizationCode({
      clientId,
      clientSecret,
      code,
      redirectUri: redirectUri(env.CONVEX_SITE_URL),
      codeVerifier: connection.codeVerifier,
    });
    const expiresAt = Date.now() + tokens.expiresIn * 1000;
    await ctx.runMutation(internal.jobber.mutations.saveTokens, {
      refreshToken: tokens.refreshToken,
      accessToken: tokens.accessToken,
      accessTokenExpiresAt: expiresAt,
      accountId: connection.accountId,
      accountName: connection.accountName,
    });

    try {
      const account = await readAccount(tokens.accessToken);
      await ctx.runMutation(internal.jobber.mutations.saveAccount, {
        accountId: account.id,
        accountName: account.name,
      });
      return page(
        200,
        "Jobber connected",
        "Jobber is connected. You can close this tab.",
      );
    } catch {
      return page(
        200,
        "Jobber connected",
        "Jobber is connected. You can close this tab.",
      );
    }
  } catch (error) {
    const message =
      error instanceof JobberError
        ? error.message
        : "Jobber authorization failed. Start again from the connect link.";
    return page(400, "Jobber was not connected", message);
  }
});

function page(status: number, title: string, message: string): Response {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></body></html>`;
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
    },
  });
}

async function sameSecret(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i += 1) diff |= x[i] ^ y[i];
  return diff === 0;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
