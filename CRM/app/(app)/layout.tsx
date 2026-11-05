import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AccessGate } from "@/components/access-gate";
import { ConvexClientProvider } from "@/components/convex-provider";
import { Shell } from "@/components/shell";

/**
 * Everything behind sign-in: a server-side session check (so a protected page is never served to someone without a Clerk session,
 * whatever path they ask for), then connected to Convex, checked by the access gate, and drawn inside the app shell. The gate and
 * the backend then decide what this particular person may see.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  return (
    <ConvexClientProvider>
      <AccessGate>
        <Shell>{children}</Shell>
      </AccessGate>
    </ConvexClientProvider>
  );
}
