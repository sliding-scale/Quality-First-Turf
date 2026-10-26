"use client";

import { useEffect } from "react";

export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="sales-list">
      <div className="sales-list__main">
        <h1>Something went wrong</h1>
        <p className="sales-list__lead">
          The page could not load. Check your connection and try again.
        </p>
        <p className="sales-list__note">
          <button type="button" className="sales-list__signout" onClick={() => retry()}>
            Try again
          </button>
        </p>
      </div>
    </main>
  );
}
