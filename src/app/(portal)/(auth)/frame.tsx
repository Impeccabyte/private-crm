import { Check } from "lucide-react";
import { DISCLOSURE, Wordmark } from "../ui";

/** Sign-in pages: the form on paper, and the brand panel that says what's inside. */
export function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mp-auth">
      <main className="mp-auth-form" id="main">
        <div>
          <div className="mp-auth-brand"><Wordmark href="/login" ground="light" /></div>
          {children}
        </div>
      </main>
      <aside className="mp-auth-side" aria-label="About your Impeccabyte account">
        <Wordmark href="/login" />
        <h2>Your account, in <em>plain</em> English.</h2>
        <ul>
          <li><Check className="ic" aria-hidden="true" />See every deposit and what it cost, day by day.</li>
          <li><Check className="ic" aria-hidden="true" />Know right away when a customer disputes a charge.</li>
          <li><Check className="ic" aria-hidden="true" />Ask your account manager for help, equipment or changes, and follow the reply.</li>
        </ul>
        <small>{DISCLOSURE}</small>
      </aside>
    </div>
  );
}
