import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AccessGate } from "@/components/access-gate";
import { ConvexClientProvider } from "@/components/convex-provider";
import { SalesAccessWaiting } from "@/components/sales-access";

/** Pages that need a signed-in, active CRM user but no app shell around them (the sales-form hand-off). */
export default async function HandoffLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  return (
    <ConvexClientProvider>
      <AccessGate waiting={<SalesAccessWaiting />}>{children}</AccessGate>
    </ConvexClientProvider>
  );
}
