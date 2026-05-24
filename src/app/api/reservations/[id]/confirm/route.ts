import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  const reservation = await prisma.reservation.findUnique({ where: { id } });

  if (!reservation) {
    return NextResponse.json(
      { error: "Reservation not found" },
      { status: 404 }
    );
  }

  if (reservation.status !== "PENDING") {
    return NextResponse.json(
      { error: `Cannot confirm a reservation with status: ${reservation.status}` },
      { status: 400 }
    );
  }

  // Check expiry — if expired, release the hold and return 410 Gone
  if (reservation.expiresAt < new Date()) {
    await prisma.$transaction([
      prisma.$executeRaw`
        UPDATE "Inventory"
        SET "reservedQty" = GREATEST(0, "reservedQty" - ${reservation.quantity})
        WHERE "productId"   = ${reservation.productId}
          AND "warehouseId" = ${reservation.warehouseId}
      `,
      prisma.reservation.update({
        where: { id },
        data: { status: "RELEASED" },
      }),
    ]);

    return NextResponse.json(
      { error: "Reservation has expired — the hold has been released" },
      { status: 410 }
    );
  }

  // Confirm: permanently decrement both totalQty and reservedQty.
  // totalQty goes down (units are sold), reservedQty goes down (hold is lifted).
  const updated = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      UPDATE "Inventory"
      SET
        "totalQty"    = "totalQty"    - ${reservation.quantity},
        "reservedQty" = "reservedQty" - ${reservation.quantity}
      WHERE "productId"   = ${reservation.productId}
        AND "warehouseId" = ${reservation.warehouseId}
    `;

    return tx.reservation.update({
      where: { id },
      data: { status: "CONFIRMED" },
      include: { product: true },
    });
  });

  return NextResponse.json(updated);
}
