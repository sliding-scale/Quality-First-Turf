import type { Metadata } from "next";
import { Suspense } from "react";
import { MessagesPage } from "@/components/messages-page";
import { MessagesSkeleton } from "@/components/skeletons";

export const metadata: Metadata = { title: "Messages" };

export default function Page() {
  // useSearchParams (the conversation in the address) needs a Suspense boundary during the build.
  return <Suspense fallback={<MessagesSkeleton />}><MessagesPage /></Suspense>;
}
