import type { Metadata } from "next";
import { Suspense } from "react";
import { QuotePage } from "@/components/quote-page";
import { QuoteSkeleton } from "@/components/skeletons";

export const metadata: Metadata = { title: "Quote" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // The page reads the address (?link=1 opens the client link), which needs a Suspense boundary.
  return (
    <Suspense fallback={<QuoteSkeleton />}>
      <QuotePage id={id} />
    </Suspense>
  );
}
