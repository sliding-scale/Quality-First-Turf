import Link from "next/link";

/** The page the sign-in form sits on: plain white, a logo, and the form in a narrow centred column (like Jobber's login). */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-page">
      <main className="auth-col">
        <Link href="/sign-in" className="auth-logo" aria-label="Quality First Turf CRM">
          <span className="brand-mark">Q</span>
          <span className="auth-wordmark">Quality First Turf</span>
        </Link>
        {children}
      </main>
    </div>
  );
}
