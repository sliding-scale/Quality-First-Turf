import { HOUR, MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";

/** Customer-facing and sign-in endpoints are public, so each gets a ceiling. */
export const rateLimiter = new RateLimiter(components.rateLimiter, {
  createProject: { kind: "token bucket", rate: 30, period: HOUR, capacity: 10 },
  publishVisit: { kind: "token bucket", rate: 30, period: HOUR, capacity: 10 },
  loginPerEmail: { kind: "fixed window", rate: 8, period: 15 * MINUTE },
  loginGlobal: { kind: "fixed window", rate: 60, period: HOUR },
});
