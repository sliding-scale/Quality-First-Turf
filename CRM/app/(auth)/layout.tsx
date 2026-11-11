import Image from "next/image";

/** The page the sign-in form sits on: the form in a narrow column on the left, with the logo above it, and a landscape photo filling the
 *  right side on wide screens. Below 900px the photo goes away and the form stays centred on white. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-page">
      <main className="auth-main">
        <div className="auth-col">
          <Image className="auth-logo" src="/brand/logo-full.png" alt="Quality First Turf" width={190} height={147} priority />
          {children}
        </div>
      </main>
      <aside className="auth-hero" aria-hidden="true">
        <Image src="/images/login-landscape.webp" alt="" fill sizes="(max-width: 900px) 0px, 50vw" priority />
        <div className="auth-hero-shade" />
        <div className="auth-hero-text">
          <p>Quality First Turf</p>
          <span>Clients, requests and quotes in one place.</span>
        </div>
      </aside>
    </div>
  );
}
