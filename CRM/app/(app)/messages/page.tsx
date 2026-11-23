import { redirect } from "next/navigation";

/* Messages is greyed out until SMS and WhatsApp are connected (user, 2026-11-23); the page's code stays in components/messages-page.tsx. */
export default function Page() {
  redirect("/home");
}
