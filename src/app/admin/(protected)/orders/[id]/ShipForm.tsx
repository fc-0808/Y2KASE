"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Truck, Check } from "lucide-react";
import { CARRIERS } from "@/lib/carriers";
import { markShipped } from "../actions";

/**
 * Admin fulfillment form: enter carrier + tracking, mark the order shipped, and
 * trigger the customer's shipment-notification email in one action.
 */
export function ShipForm({
  orderId,
  initialCarrier,
  initialTracking,
  initialTrackingUrl,
  shipped,
}: {
  orderId: number;
  initialCarrier: string | null;
  initialTracking: string | null;
  initialTrackingUrl: string | null;
  shipped: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [carrier, setCarrier] = useState(initialCarrier ?? CARRIERS[0]);
  const [trackingNumber, setTrackingNumber] = useState(initialTracking ?? "");
  const [trackingUrl, setTrackingUrl] = useState(initialTrackingUrl ?? "");
  const [message, setMessage] = useState<string | null>(null);

  function submit() {
    setMessage(null);
    startTransition(async () => {
      const res = await markShipped(orderId, {
        carrier,
        trackingNumber,
        trackingUrl,
      });
      setMessage(res.message);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <label className="block text-xs font-bold uppercase tracking-wide text-[var(--foreground)]/50">
        Carrier
        <select
          value={carrier}
          onChange={(e) => setCarrier(e.target.value)}
          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-2.5 py-2 text-sm font-semibold outline-none focus:border-[var(--primary)]"
        >
          {CARRIERS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-xs font-bold uppercase tracking-wide text-[var(--foreground)]/50">
        Tracking number
        <input
          value={trackingNumber}
          onChange={(e) => setTrackingNumber(e.target.value)}
          placeholder="e.g. 9400 1000 0000 0000 0000 00"
          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-2.5 py-2 text-sm font-semibold outline-none focus:border-[var(--primary)]"
        />
      </label>

      <label className="block text-xs font-bold uppercase tracking-wide text-[var(--foreground)]/50">
        Tracking URL (optional)
        <input
          value={trackingUrl}
          onChange={(e) => setTrackingUrl(e.target.value)}
          placeholder="Overrides the carrier link"
          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-2.5 py-2 text-sm font-semibold outline-none focus:border-[var(--primary)]"
        />
      </label>

      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="btn-candy flex w-full items-center justify-center gap-2 py-2.5 text-sm disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : shipped ? (
          <Check className="h-4 w-4" />
        ) : (
          <Truck className="h-4 w-4" />
        )}
        {shipped ? "Update & re-send" : "Mark shipped & notify"}
      </button>

      {message && (
        <p className="text-center text-xs font-semibold text-[var(--primary)]">
          {message}
        </p>
      )}
    </div>
  );
}
