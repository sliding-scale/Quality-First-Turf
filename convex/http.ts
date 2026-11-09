import { httpRouter } from "convex/server";
import { handle as clerkWebhook } from "./crm/clerkWebhook";
import { callback, connect } from "./jobber/http";

const http = httpRouter();

http.route({
  path: "/jobber/connect",
  method: "GET",
  handler: connect,
});

http.route({
  path: "/jobber/callback",
  method: "GET",
  handler: callback,
});

// CRM (D-055): Clerk reports a deleted login here. Signed by Clerk; refused otherwise.
http.route({
  path: "/clerk/webhook",
  method: "POST",
  handler: clerkWebhook,
});

export default http;
