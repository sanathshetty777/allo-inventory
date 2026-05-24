"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Warehouse = { id: string; name: string; location: string };
type InventoryRow = {
  warehouseId: string;
  totalQty: number;
  reservedQty: number;
  warehouse: Warehouse;
};
type Product = {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  inventory: InventoryRow[];
};

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [reserving, setReserving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const fetchProducts = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/products");
      const text = await res.text(); // read raw text first
      if (!text) {
        setError("API returned empty response. Check your DATABASE_URL in .env");
        return;
      }
      const data = JSON.parse(text);
      if (!res.ok) {
        setError(data?.error || `API error ${res.status}`);
        return;
      }
      setProducts(data);
    } catch (e) {
      setError(
        "Failed to load products. Make sure DATABASE_URL is set in your .env file and you have run: npx prisma migrate dev && npx prisma db seed"
      );
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleReserve = async (productId: string, warehouseId: string) => {
    const key = `${productId}-${warehouseId}`;
    setReserving(key);
    setError(null);

    const idempotencyKey = crypto.randomUUID();

    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({ productId, warehouseId, quantity: 1 }),
      });

      const data = await res.json();

      if (res.status === 409) {
        setError("Not enough stock — someone just grabbed the last one!");
        await fetchProducts(); // refresh stock counts
        return;
      }
      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        return;
      }

      router.push(`/checkout/${data.id}`);
    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      setReserving(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-gray-400 text-sm">Loading products…</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Products</h1>
        <p className="text-sm text-gray-500 mt-1">
          Select a product and warehouse to reserve stock for 10 minutes.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-start gap-2">
          <span className="mt-0.5">⚠</span>
          <span>{error}</span>
        </div>
      )}

      <div className="grid gap-6">
        {products.map((product) => (
          <div
            key={product.id}
            className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm"
          >
            <div className="mb-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    {product.name}
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5">SKU: {product.sku}</p>
                </div>
              </div>
              {product.description && (
                <p className="text-sm text-gray-600 mt-2">{product.description}</p>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {product.inventory.map((inv) => {
                const available = inv.totalQty - inv.reservedQty;
                const btnKey = `${product.id}-${inv.warehouseId}`;
                const isReserving = reserving === btnKey;
                const outOfStock = available === 0;

                return (
                  <div
                    key={inv.warehouseId}
                    className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-lg p-4"
                  >
                    <div>
                      <p className="font-medium text-sm text-gray-800">
                        {inv.warehouse.name}
                      </p>
                      <p className="text-xs text-gray-400">{inv.warehouse.location}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span
                          className={`inline-block w-1.5 h-1.5 rounded-full ${
                            available > 2
                              ? "bg-green-500"
                              : available > 0
                              ? "bg-amber-500"
                              : "bg-red-400"
                          }`}
                        />
                        <p className="text-xs">
                          <span
                            className={
                              available > 0
                                ? "text-green-700 font-medium"
                                : "text-red-500 font-medium"
                            }
                          >
                            {available} available
                          </span>
                          <span className="text-gray-400 ml-1">
                            / {inv.totalQty} total
                          </span>
                          {inv.reservedQty > 0 && (
                            <span className="text-amber-600 ml-1">
                              ({inv.reservedQty} reserved)
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() =>
                        handleReserve(product.id, inv.warehouseId)
                      }
                      disabled={outOfStock || isReserving}
                      className={`ml-4 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                        outOfStock
                          ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                          : isReserving
                          ? "bg-blue-400 text-white cursor-wait"
                          : "bg-blue-600 text-white hover:bg-blue-700 active:scale-95"
                      }`}
                    >
                      {isReserving
                        ? "Reserving…"
                        : outOfStock
                        ? "Out of stock"
                        : "Reserve"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
