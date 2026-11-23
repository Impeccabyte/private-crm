import Link from "next/link";
import { Store } from "lucide-react";

export default function NotFound() {
  return (
    <div className="content">
      <section className="card">
        <div className="empty">
          <span className="ei"><Store size={20} aria-hidden="true" /></span>
          <h3>Merchant not found</h3>
          <p>It may have been removed, or it isn’t in your book of merchants.</p>
          <Link className="btn pri" href="/merchants">Back to merchants</Link>
        </div>
      </section>
    </div>
  );
}
