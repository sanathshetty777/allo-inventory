import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ReserveSchema } from "@/lib/schemas";

const RESERVATION_MINUTES = 10;

export async function POST(req: Request) {
  // ── Idempotency ──────────────────────────────────────────────────────────
  // If the client retries with the same Idempotency-Key, return the original
  // response without creating a duplicate reservation.
  const idempotencyKey = req.headers.get("Idempotency-Key");

  if (idempotencyKey) {
    const existing = await prisma.reservation.findUnique({
      where: { idempotencyKey },
      include: { product: true },
    });
    if (existing) {
      return NextResponse.json(existing, { status: 200 });
    }
  }

  // ── Validate request body ─────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = ReserveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const { productId, warehouseId, quantity } = parsed.data;
  const expiresAt = new Date(Date.now() + RESERVATION_MINUTES * 60 * 1000);

  // ── Atomic reservation with SELECT FOR UPDATE ─────────────────────────────
  // This is the core of concurrency correctness.
  //
  // Two simultaneous requests for the last unit will serialize at the DB level:
  //   Request A: acquires row lock → reads 1 available → decrements → commits
  //   Request B: waits for lock  → reads 0 available → throws INSUFFICIENT_STOCK
  //
  // Without FOR UPDATE, both could read "1 available" simultaneously and both
  // would succeed, causing an oversell.
  try {
    const reservation = await prisma.$transaction(async (tx) => {
      const inventories = await tx.$queryRaw<
        { id: string; totalQty: number; reservedQty: number }[]
      >`
        SELECT id, "totalQty", "reservedQty"
        FROM "Inventory"
        WHERE "productId" = ${productId}
          AND "warehouseId" = ${warehouseId}
        FOR UPDATE
      `;

      if (!inventories.length) {
        throw new Error("NOT_FOUND");
      }

      const inv = inventories[0];
      const available = inv.totalQty - inv.reservedQty;

      if (available < quantity) {
        throw new Error("INSUFFICIENT_STOCK");
      }

      // Increment reservedQty to hold the units
      await tx.$executeRaw`
        UPDATE "Inventory"
        SET "reservedQty" = "reservedQty" + ${quantity}
        WHERE id = ${inv.id}
      `;

      return tx.reservation.create({
        data: {
          productId,
          warehouseId,
          quantity,
          expiresAt,
          status: "PENDING",
          idempotencyKey: idempotencyKey ?? undefined,
        },
        include: { product: true },
      });
    });

    return NextResponse.json(reservation, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "";

    if (message === "INSUFFICIENT_STOCK") {
      return NextResponse.json(
        { error: "Not enough stock available" },
        { status: 409 }
      );
    }
    if (message === "NOT_FOUND") {
      return NextResponse.json(
        { error: "No inventory found for this product/warehouse combination" },
        { status: 404 }
      );
    }

    console.error("[POST /api/reservations]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
