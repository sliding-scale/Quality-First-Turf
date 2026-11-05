"use client";

/* Shown when a page's data cannot be loaded, for instance when the backend rejects the call. */

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const notSignedIn = /not signed in/i.test(error.message);
  return (
    <div className="empty-state" role="alert">
      <h2>{notSignedIn ? "Sign-in is needed to see this page" : "This page could not load"}</h2>
      {notSignedIn ? (
        <p>
          The CRM backend only answers signed-in staff, and sign-in is the next step to build, so every call is rejected until then. Nothing is wrong
          with your setup.
        </p>
      ) : (
        <p>{error.message.split("\n")[0].slice(0, 300) || "Something went wrong."}</p>
      )}
      <button type="button" className="btn primary" onClick={reset}>Try again</button>
    </div>
  );
}
