import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    await prisma.$executeRaw`
      UPDATE "Inventory" i
      SET "reservedQty" = GREATEST(0, i."reservedQty" - sub.qty)
      FROM (
        SELECT r."productId", r."warehouseId", SUM(r.quantity) AS qty
        FROM "Reservation" r
        WHERE r.status = 'PENDING' AND r."expiresAt" < NOW()
        GROUP BY r."productId", r."warehouseId"
      ) sub
      WHERE i."productId" = sub."productId"
        AND i."warehouseId" = sub."warehouseId"
    `;

    await prisma.$executeRaw`
      UPDATE "Reservation"
      SET status = 'RELEASED'
      WHERE status = 'PENDING' AND "expiresAt" < NOW()
    `;

    const products = await prisma.product.findMany({
      include: {
        inventory: {
          include: { warehouse: true },
          orderBy: { warehouse: { name: "asc" } },
        },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(products);
  } catch (err) {
    console.error("[GET /api/products] Database error:", err);
    return NextResponse.json(
      {
        error: "Database connection failed. Check your DATABASE_URL in .env",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
