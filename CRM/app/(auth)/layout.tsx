/** The page the sign-in form sits on: plain white, with the form in a narrow column centred on the screen (like Jobber's login). */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-page">
      <main className="auth-col">{children}</main>
    </div>
  );
}
