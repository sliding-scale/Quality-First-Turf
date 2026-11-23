"use client";

import Link from "next/link";

/* Anything that throws while a page renders lands here instead of a blank screen. */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="empty-state" role="alert" style={{ marginTop: 96 }}>
      <h1 style={{ fontSize: 26, margin: "0 0 10px" }}>Something went wrong</h1>
      <p>The page could not be shown. Try again, and if it keeps happening, tell the team what you were doing.</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" className="btn primary" onClick={reset}>Try again</button>
        <Link className="btn" href="/home">Back to home</Link>
      </div>
    </div>
  );
}
