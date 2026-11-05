/* Tells Convex how to check the sign-in tokens Clerk issues (D-044, D-046). Only the CRM uses them: the forms' sales
   login has its own session tokens and sends no Clerk token, so this does not change it.

   CLERK_JWT_ISSUER_DOMAIN is the Clerk instance's Frontend API URL, for example https://something.clerk.accounts.dev,
   set on each deployment with `npx convex env set`. If it is not set, no provider is configured: nobody can sign in, every
   CRM function stays closed, and a deploy still works. So deploying before Clerk is set up on a deployment is safe. */
const domain = process.env.CLERK_JWT_ISSUER_DOMAIN;

export default {
  providers: domain ? [{ domain, applicationID: "convex" }] : [],
};
