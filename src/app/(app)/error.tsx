"use client";

import { AlertTriangle } from "lucide-react";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="content">
      <section className="card">
        <div className="empty" role="alert">
          <span className="ei" style={{ background: "var(--r-bg)", color: "var(--r-ink)", borderColor: "transparent" }}><AlertTriangle size={20} aria-hidden="true" /></span>
          <h3>Something went wrong loading this page</h3>
          <p>{/permission/i.test(error.message) ? error.message : "The request failed. Nothing was changed. Try again, and if it keeps happening, check Settings → Integrations."}</p>
          <div className="row"><button className="btn pri" onClick={reset}>Try again</button><a className="btn" href="/">Back to Home</a></div>
          {error.digest && <span className="subtle sm mono">Error ref: {error.digest}</span>}
        </div>
      </section>
    </div>
  );
}
