import type { Metadata } from "next";
import { Suspense } from "react";
import { CalendarSettingsPage } from "@/components/calendar-settings-page";
import { CalendarSettingsSkeleton } from "@/components/skeletons";

export const metadata: Metadata = { title: "My calendar" };

export default function Page() {
  return (
    <Suspense fallback={<CalendarSettingsSkeleton />}>
      <CalendarSettingsPage />
    </Suspense>
  );
}
