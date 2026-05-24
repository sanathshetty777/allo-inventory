"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

type Reservation = {
  id: string;
  status: "PENDING" | "CONFIRMED" | "RELEASED";
  quantity: number;
  expiresAt: string;
  warehouseId: string;
  product: { name: string; sku: string };
};

export default function CheckoutPage({ params }: { params: { id: string } }) {
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [acting, setActing] = useState(false);
  const router = useRouter();

  const fetchReservation = useCallback(async () => {
    const res = await fetch(`/api/reservations/${params.id}`);
    if (!res.ok) {
      setError("Reservation not found.");
      setLoading(false);
      return;
    }
    const data = await res.json();
    setReservation(data);
    setLoading(false);
  }, [params.id]);

  useEffect(() => {
    fetchReservation();
  }, [fetchReservation]);

  // Live countdown
  useEffect(() => {
    if (!reservation || reservation.status !== "PENDING") return;

    const tick = () => {
      const ms = new Date(reservation.expiresAt).getTime() - Date.now();
      setTimeLeft(Math.max(0, ms));
    };
    tick();
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [reservation]);

  const handleConfirm = async () => {
    setActing(true);
    setError(null);

    const res = await fetch(`/api/reservations/${params.id}/confirm`, {
      method: "POST",
    });
    const data = await res.json();

    if (res.status === 410) {
      setError(
        "Your reservation expired before payment could complete. Please start over."
      );
      setActing(false);
      fetchReservation(); // refresh to show RELEASED status
      return;
    }
    if (!res.ok) {
      setError(data.error || "Failed to confirm. Please try again.");
      setActing(false);
      return;
    }

    setReservation(data); // update UI without page refresh
    setActing(false);
  };

  const handleCancel = async () => {
    setActing(true);
    setError(null);

    const res = await fetch(`/api/reservations/${params.id}/release`, {
      method: "POST",
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Failed to cancel. Please try again.");
      setActing(false);
      return;
    }

    setReservation(data); // update UI without page refresh
    setActing(false);
  };

  const mins = Math.floor(timeLeft / 60000);
  const secs = Math.floor((timeLeft % 60000) / 1000);
  const urgent = timeLeft > 0 && timeLeft < 60000;
  const expired = reservation?.status === "PENDING" && timeLeft === 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-gray-400 text-sm">Loading reservation…</p>
      </div>
    );
  }

  if (error && !reservation) {
    return (
      <div className="max-w-lg mx-auto">
        <p className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-lg p-4">
          {error}
        </p>
        <button
          onClick={() => router.push("/")}
          className="mt-4 text-blue-600 text-sm hover:underline"
        >
          ← Back to products
        </button>
      </div>
    );
  }

  if (!reservation) return null;

  return (
    <div className="max-w-lg mx-auto">
      <button
        onClick={() => router.push("/")}
        className="text-sm text-blue-600 mb-6 hover:underline inline-flex items-center gap-1"
      >
        ← Back to products
      </button>

      <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm">
        <h1 className="text-xl font-bold text-gray-900 mb-1">Checkout</h1>
        <p className="text-sm text-gray-500 mb-6">Reservation #{params.id.slice(-8)}</p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex gap-2">
            <span>⚠</span>
            <span>{error}</span>
          </div>
        )}

        {/* Reservation details */}
        <div className="space-y-3 mb-6">
          <Row label="Product" value={reservation.product.name} />
          <Row label="SKU" value={reservation.product.sku} />
          <Row label="Quantity" value={String(reservation.quantity)} />
          <Row
            label="Status"
            value={<StatusBadge status={reservation.status} />}
          />
        </div>

        {/* Countdown timer */}
        {reservation.status === "PENDING" && (
          <div
            className={`rounded-xl p-5 text-center mb-6 transition-colors ${
              expired
                ? "bg-red-50 border-2 border-red-300"
                : urgent
                ? "bg-red-50 border border-red-200"
                : "bg-amber-50 border border-amber-200"
            }`}
          >
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
              {expired ? "Reservation expired" : "Time remaining"}
            </p>
            {!expired ? (
              <p
                className={`text-5xl font-mono font-bold tabular-nums tracking-tight ${
                  urgent ? "text-red-600" : "text-amber-700"
                }`}
              >
                {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
              </p>
            ) : (
              <p className="text-red-600 font-semibold">
                Your hold has expired — please go back and reserve again.
              </p>
            )}
            {!expired && (
              <p className="text-xs text-gray-400 mt-2">
                Complete your purchase before time runs out
              </p>
            )}
          </div>
        )}

        {/* Confirmed state */}
        {reservation.status === "CONFIRMED" && (
          <div className="rounded-xl p-6 text-center bg-green-50 border border-green-200 mb-6">
            <div className="text-3xl mb-2">✓</div>
            <p className="text-green-700 font-semibold text-lg">Purchase confirmed!</p>
            <p className="text-green-600 text-sm mt-1">
              Your order has been placed successfully.
            </p>
            <button
              onClick={() => router.push("/")}
              className="mt-4 text-green-700 text-sm hover:underline font-medium"
            >
              Browse more products →
            </button>
          </div>
        )}

        {/* Released state */}
        {reservation.status === "RELEASED" && (
          <div className="rounded-xl p-6 text-center bg-gray-50 border border-gray-200 mb-6">
            <p className="text-gray-600 font-medium">Reservation cancelled.</p>
            <p className="text-gray-400 text-sm mt-1">
              The stock has been released back to inventory.
            </p>
            <button
              onClick={() => router.push("/")}
              className="mt-4 text-blue-600 text-sm hover:underline"
            >
              Browse products →
            </button>
          </div>
        )}

        {/* Action buttons */}
        {reservation.status === "PENDING" && !expired && (
          <div className="flex gap-3">
            <button
              onClick={handleConfirm}
              disabled={acting}
              className="flex-1 py-3 bg-blue-600 text-white font-semibold rounded-lg
                hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
                transition-all active:scale-[0.98]"
            >
              {acting ? "Processing…" : "Confirm purchase"}
            </button>
            <button
              onClick={handleCancel}
              disabled={acting}
              className="flex-1 py-3 bg-white border border-gray-300 text-gray-700 font-semibold
                rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed
                transition-all active:scale-[0.98]"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center py-2.5 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900">{value}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    PENDING: "bg-amber-100 text-amber-800",
    CONFIRMED: "bg-green-100 text-green-800",
    RELEASED: "bg-gray-100 text-gray-600",
  };
  return (
    <span
      className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
        styles[status] ?? "bg-gray-100 text-gray-600"
      }`}
    >
      {status.toLowerCase()}
    </span>
  );
}
