"use client";

import { useState, useTransition } from "react";
import { updateMerchantOwner } from "../actions";

type Option = { id: string; name: string; active: boolean };

/**
 * The merchant's owner (account manager), changed in place. "Unassigned" clears it. A disabled owner still shows as
 * the current value, but can't be picked again.
 */
export function OwnerSelect({ merchantId, current, options }: { merchantId: string; current: Option | null; options: Option[] }) {
  const [pending, start] = useTransition();
  const [value, setValue] = useState(current?.id ?? "none");
  const [error, setError] = useState<string | null>(null);
  const stale = current && !options.some((o) => o.id === current.id) ? current : null;

  return (
    <span className="row" style={{ gap: 6 }}>
      <label className="row" style={{ gap: 6 }}>
        <span className="sr">Owner</span>
        <select className="inp" style={{ height: 26, fontSize: 12 }} value={value} disabled={pending} aria-label="Owner"
          aria-invalid={error ? true : undefined} aria-describedby={error ? "owner-err" : undefined}
          onChange={(e) => {
            const next = e.target.value;
            const prev = value;
            setValue(next);
            setError(null);
            start(async () => {
              try {
                await updateMerchantOwner(merchantId, next);
              } catch (err) {
                setValue(prev);
                setError((err as Error).message || "Couldn't change the owner.");
              }
            });
          }}>
          <option value="none">Unassigned</option>
          {stale && <option value={stale.id} disabled>{stale.name} (disabled)</option>}
          {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </label>
      {error && <span id="owner-err" role="alert" className="errt">{error}</span>}
    </span>
  );
}
