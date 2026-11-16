/* The one "Welcome back" loading look (shared by the sign-in page while its form draws and by the screen shown after logging in
   while the CRM loads), so the two never look different. No hooks, so a server page can use it too. */

export function WelcomeHead({ line }: { line: string }) {
  return (
    <div className="auth-head">
      <h1 className="auth-product">LaunchPad</h1>
      <p className="auth-welcome">Welcome back</p>
      <p>{line}</p>
    </div>
  );
}

export function WelcomeBar() {
  return (
    <div className="welcome-bar auth-bar" aria-hidden="true"><span /></div>
  );
}
