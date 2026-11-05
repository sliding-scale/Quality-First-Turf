"use client";

/* Shown when a page's data cannot be loaded, for instance when the backend rejects the call. */

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const noAccess = /no access|not signed in|only an admin|view this but not change/i.test(error.message);
  return (
    <div className="empty-state" role="alert">
      <h2>{noAccess ? "You do not have access to this" : "This page could not load"}</h2>
      {noAccess ? (
        <p>The backend refused this request for your account. Ask an Admin if you think you should be able to see or change it.</p>
      ) : (
        <p>{error.message.split("\n")[0].slice(0, 300) || "Something went wrong."}</p>
      )}
      <button type="button" className="btn primary" onClick={reset}>Try again</button>
    </div>
  );
}
