import { httpRouter } from "convex/server";
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

export default http;
