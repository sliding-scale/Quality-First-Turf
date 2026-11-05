import { SettingsNav } from "@/components/settings-nav";

/** Every Settings page sits beside the Settings navigation. */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="settings">
      <SettingsNav />
      <div className="settings-main">{children}</div>
    </div>
  );
}
