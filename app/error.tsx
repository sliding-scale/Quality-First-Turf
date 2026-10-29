"use client";

import { useEffect } from "react";

export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="sales-list status-page">
      <div className="status-page__body">
        <h1>Something went wrong</h1>
        <p className="status-page__lead">The page could not load. Check your connection and try again.</p>
        <button type="button" className="status-page__action" onClick={() => retry()}>
          Try again
        </button>
      </div>
    </main>
  );
}
