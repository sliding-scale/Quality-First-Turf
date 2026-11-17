"use client";

/* Shown under the "Getting everything ready" bar when the wait is getting long. The app cannot show anything until its live connection to the
   server is up, and on a slow or interrupted network that can take a minute; without this note the screen just loops with no word. It says
   whether the server can be reached at all, and offers Try again (a reload). It appears after `afterMs` and updates every second. */

import { useConvex } from "convex/react";
import { useEffect, useState } from "react";

type Link = { connected: boolean; retries: number };

export function SlowWaitNote({ afterMs = 15_000 }: { afterMs?: number }) {
  const convex = useConvex();
  const [late, setLate] = useState(false);
  const [link, setLink] = useState<Link>({ connected: false, retries: 0 });

  useEffect(() => {
    const show = setTimeout(() => setLate(true), afterMs);
    return () => clearTimeout(show);
  }, [afterMs]);

  useEffect(() => {
    if (!late) return;
    const read = () => {
      const s = convex.connectionState();
      setLink({ connected: s.isWebSocketConnected, retries: s.connectionRetries });
    };
    read();
    const every = setInterval(read, 1000);
    return () => clearInterval(every);
  }, [late, convex]);

  return (
    <div className="auth-slow" role="status" aria-live="polite">
      {late && (
        <>
          <p><b>This is taking longer than usual.</b></p>
          <p>
            {link.connected
              ? "We are connected, and the server is slow to answer. Please wait a little longer."
              : link.retries > 0
                ? "We cannot reach the server yet. Please check your internet connection. We keep trying in the background."
                : "We are still connecting to the server."}
          </p>
          <button type="button" className="btn" onClick={() => window.location.reload()}>Try again</button>
        </>
      )}
    </div>
  );
}
