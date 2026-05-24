import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const wh1 = await prisma.warehouse.upsert({
    where: { id: "wh-mumbai" },
    update: {},
    create: { id: "wh-mumbai", name: "Mumbai DC", location: "Mumbai, India" },
  });
  const wh2 = await prisma.warehouse.upsert({
    where: { id: "wh-delhi" },
    update: {},
    create: { id: "wh-delhi", name: "Delhi DC", location: "Delhi, India" },
  });

  const products = [
    {
      id: "prod-1",
      name: "Wireless Headphones",
      sku: "WH-1000",
      description: "Over-ear noise-cancelling",
    },
    {
      id: "prod-2",
      name: "Mechanical Keyboard",
      sku: "MK-2000",
      description: "TKL, brown switches",
    },
    {
      id: "prod-3",
      name: "USB-C Hub 7-in-1",
      sku: "HUB-300",
      description: "4K HDMI, 3×USB-A, SD card reader",
    },
  ];

  for (const p of products) {
    await prisma.product.upsert({
      where: { id: p.id },
      update: {},
      create: p,
    });
    await prisma.inventory.upsert({
      where: {
        productId_warehouseId: { productId: p.id, warehouseId: wh1.id },
      },
      update: {},
      create: {
        productId: p.id,
        warehouseId: wh1.id,
        totalQty: 5,
        reservedQty: 0,
      },
    });
    await prisma.inventory.upsert({
      where: {
        productId_warehouseId: { productId: p.id, warehouseId: wh2.id },
      },
      update: {},
      create: {
        productId: p.id,
        warehouseId: wh2.id,
        totalQty: 3,
        reservedQty: 0,
      },
    });
  }

  console.log("✓ Database seeded successfully");
  console.log(
    `  Created 2 warehouses: ${wh1.name}, ${wh2.name}`
  );
  console.log(`  Created ${products.length} products with inventory`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
