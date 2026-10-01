"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { setMagneticRingHolders } from "../actions";

/**
 * Operator switch for the magnetic ring holder shop.
 *
 * The photos are on this page. Vision is not asked. Turning it on also files
 * the case as MagSafe. Turning it off leaves MagSafe alone.
 */
export function MagneticRingCard({
  productId,
  initialOn,
}: {
  productId: number;
  initialOn: boolean;
}) {
  const [on, setOn] = useState(initialOn);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(true);

  function toggle(next: boolean) {
    setMessage(null);
    startTransition(async () => {
      const res = await setMagneticRingHolders([productId], next);
      setOk(res.ok);
      setMessage(res.message);
      if (res.ok) setOn(next);
    });
  }

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
      <h2 className="text-sm font-bold">Magnetic ring holder</h2>
      <p className="mt-1 text-xs text-[var(--foreground)]/60">
        Tick this only when you can see a raised ring holder on the back.
        MagSafe alone is not enough. Turning it on also marks the case MagSafe.
      </p>
      <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm font-semibold">
        <input
          type="checkbox"
          className="h-4 w-4"
          checked={on}
          disabled={pending}
          onChange={(event) => toggle(event.target.checked)}
        />
        This case has a ring holder
        {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      </label>
      {message && (
        <p
          className={`mt-2 text-xs font-semibold ${ok ? "text-green-600" : "text-red-500"}`}
        >
          {message}
        </p>
      )}
    </section>
  );
}
