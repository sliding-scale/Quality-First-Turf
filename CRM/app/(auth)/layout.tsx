import Image from "next/image";

/** The sign-in form, centred, with the logo and the CRM name above it. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-page">
      <main className="auth-main">
        <div className="auth-col">
          <Image className="auth-logo" src="/brand/logo-full.png" alt="Quality First Turf" width={190} height={147} priority />
          {children}
        </div>
      </main>
    </div>
  );
}
