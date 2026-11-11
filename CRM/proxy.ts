import { clerkMiddleware } from "@clerk/nextjs/server";

// Only the sign-in page is open. Everything else needs a Clerk session, which sends people who are not signed in to the sign-in page.
// This is a plain path check on purpose: Clerk is retiring createRouteMatcher (path matching can drift from how Next.js routes). The
// real checks are resource-based: the (app) layout checks the session on the server, and every backend function checks the person,
// their role and their business (convex/crm/lib/access.ts).
export default clerkMiddleware(async (auth, request) => {
  const path = request.nextUrl.pathname;
  // The sign-in page is open, and so is the sales-form sign-out page (it only ends the session and returns to an allowed address).
  // The client's quote page (/q/<link>) is open too. The invitation page is open too: a new team member has no session yet. Clerk only lets them through with the ticket from their email.
  const isOpen =
    path === "/sign-in" || path.startsWith("/sign-in/") || path === "/accept-invite" || path.startsWith("/accept-invite/") || path === "/sales-access/signout" ||
    // The client's quote page: the secret link is the key (D-063). Every function behind it checks the token.
    path.startsWith("/q/");
  if (!isOpen) await auth.protect();
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless they are in the search params.
    "/((?!_next|[^?]*\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
