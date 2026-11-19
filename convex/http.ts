import { httpRouter } from "convex/server";
import { callback as calendarCallback } from "./crm/calendarHttp";
import { handle as clerkWebhook } from "./crm/clerkWebhook";
import { receive as textReceived } from "./crm/messagesHttp";
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

// CRM (D-069): Zoho sends a person back here after they allow their calendar to connect.
http.route({
  path: "/zoho/calendar/callback",
  method: "GET",
  handler: calendarCallback,
});

// CRM (plan 2026-11-19-messages): Twilio posts each received text here. Signed by Twilio; refused otherwise.
http.route({
  path: "/twilio/sms",
  method: "POST",
  handler: textReceived,
});

export default http;
