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
      { error: `Only PENDING reservations can be released (current: ${reservation.status})` },
      { status: 400 }
    );
  }

  // Release: give the units back to available inventory
  const updated = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      UPDATE "Inventory"
      SET "reservedQty" = GREATEST(0, "reservedQty" - ${reservation.quantity})
      WHERE "productId"   = ${reservation.productId}
        AND "warehouseId" = ${reservation.warehouseId}
    `;

    return tx.reservation.update({
      where: { id },
      data: { status: "RELEASED" },
      include: { product: true },
    });
  });

  return NextResponse.json(updated);
}
