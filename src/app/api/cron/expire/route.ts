import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Called by Vercel Cron every minute (see vercel.json).
// Protected by CRON_SECRET so only Vercel can trigger it.
export async function GET(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const released = await prisma.$transaction(async (tx) => {
    // Find all expired pending reservations
    const expired = await tx.reservation.findMany({
      where: {
        status: "PENDING",
        expiresAt: { lt: new Date() },
      },
    });

    if (!expired.length) return 0;

    // Release the held inventory for each
    for (const r of expired) {
      await tx.$executeRaw`
        UPDATE "Inventory"
        SET "reservedQty" = GREATEST(0, "reservedQty" - ${r.quantity})
        WHERE "productId"   = ${r.productId}
          AND "warehouseId" = ${r.warehouseId}
      `;
    }

    // Mark all as RELEASED
    await tx.reservation.updateMany({
      where: {
        status: "PENDING",
        expiresAt: { lt: new Date() },
      },
      data: { status: "RELEASED" },
    });

    return expired.length;
  });

  console.log(`[cron/expire] Released ${released} expired reservation(s)`);
  return NextResponse.json({ released, timestamp: new Date().toISOString() });
}
