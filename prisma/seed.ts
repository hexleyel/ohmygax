import "dotenv/config";
import bcrypt from "bcrypt";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is not set. Run `npm run setup` to create .env and initialize the database.",
  );
}

const adapter = new PrismaMariaDb(databaseUrl);
const prisma = new PrismaClient({ adapter });

async function main() {
  const adminPassword = await bcrypt.hash("Admin@123", 10);
  const cashierPassword = await bcrypt.hash("Cash@123", 10);

  await prisma.user.upsert({
    where: { username: "admin" },
    update: { password: adminPassword },
    create: {
      username: "admin",
      password: adminPassword,
      full_name: "Administrator",
      role: "admin",
      status: "active",
    },
  });

  await prisma.user.upsert({
    where: { username: "mariasantos" },
    update: { password: cashierPassword },
    create: {
      username: "mariasantos",
      password: cashierPassword,
      full_name: "Maria Santos",
      role: "cashier",
      status: "active",
    },
  });

  const settings: Record<string, string> = {
    vat_rate: "12",
    cylinder_exchange_fee: "150",
    bulk_discount_threshold: "5",
    bulk_discount_rate: "5",
    senior_discount_rate: "20",
  };

  for (const [key, value] of Object.entries(settings)) {
    await prisma.settings.upsert({
      where: { key },
      update: {},
      create: { key, value },
    });
  }

  // Categories and units are maintained in File Maintenance; these are the
  // starting set. is_cylinder drives the exchange fee and full/empty tracking.
  const categories = [
    { code: "cylinder", name: "Cylinder", is_cylinder: true },
    { code: "accessory", name: "Accessory", is_cylinder: false },
    { code: "appliance", name: "Appliance", is_cylinder: false },
  ];
  for (const category of categories) {
    await prisma.category.upsert({
      where: { code: category.code },
      update: {},
      create: category,
    });
  }

  const uoms = [
    { code: "pcs", name: "Piece" },
    { code: "cylinder", name: "Cylinder" },
    { code: "kg", name: "Kilogram" },
    { code: "liter", name: "Liter" },
    { code: "box", name: "Box" },
    { code: "set", name: "Set" },
  ];
  for (const uom of uoms) {
    await prisma.uom.upsert({ where: { code: uom.code }, update: {}, create: uom });
  }

  const supplier = await prisma.supplier.upsert({
    where: { supplier_id: 1 },
    update: {},
    create: {
      name: "Island Gas Supply",
      contact_person: "Rene Cruz",
      phone: "09170000001",
      email: "rene@islandgas.com",
      address: "Bachaw Sur, Kalibo, Aklan",
      status: "active",
    },
  });

  // Prices sourced from the store's actual pricing board (see proposal appendix).
  const products = [
    {
      sku: "LPG-2.7",
      name: "2.7kg LPG Cylinder",
      category: "cylinder" as const,
      uom: "pcs",
      base_price: 330,
      margin_pct: 14.5,
      stock_qty: 50,
      full_qty: 50,
      empty_qty: 0,
      min_stock: 10,
      max_stock: 100,
      location: "RACK-A1",
    },
    {
      sku: "LPG-11",
      name: "11kg LPG Cylinder",
      category: "cylinder" as const,
      uom: "pcs",
      base_price: 1050,
      margin_pct: 14.5,
      stock_qty: 40,
      full_qty: 40,
      empty_qty: 0,
      min_stock: 8,
      max_stock: 80,
      location: "RACK-A2",
    },
    {
      sku: "LPG-22",
      name: "22kg LPG Cylinder",
      category: "cylinder" as const,
      uom: "pcs",
      base_price: 2100,
      margin_pct: 14.5,
      stock_qty: 25,
      full_qty: 25,
      empty_qty: 0,
      min_stock: 5,
      max_stock: 50,
      location: "RACK-B1",
    },
    {
      sku: "LPG-50",
      name: "50kg LPG Cylinder",
      category: "cylinder" as const,
      uom: "pcs",
      base_price: 4635,
      margin_pct: 14.5,
      stock_qty: 12,
      full_qty: 12,
      empty_qty: 0,
      min_stock: 3,
      max_stock: 25,
      location: "RACK-B2",
    },
    {
      sku: "ACC-REG-01",
      name: "LPG Regulator",
      category: "accessory" as const,
      uom: "pcs",
      base_price: 150,
      margin_pct: 20,
      stock_qty: 30,
      full_qty: 0,
      empty_qty: 0,
      min_stock: 10,
      max_stock: 60,
      location: "SHELF-C1",
    },
    {
      sku: "ACC-HOSE-01",
      name: "Rubber Hose 1.5m",
      category: "accessory" as const,
      uom: "pcs",
      base_price: 90,
      margin_pct: 25,
      stock_qty: 5,
      full_qty: 0,
      empty_qty: 0,
      min_stock: 15,
      max_stock: 60,
      location: "SHELF-C2",
    },
  ];

  for (const product of products) {
    const selling_price = Number(
      (product.base_price * (1 + product.margin_pct / 100)).toFixed(2),
    );

    const created = await prisma.product.upsert({
      where: { sku: product.sku },
      update: {},
      create: { ...product, selling_price, status: "active" },
    });

    await prisma.productSupplier.upsert({
      where: {
        product_id_supplier_id: {
          product_id: created.product_id,
          supplier_id: supplier.supplier_id,
        },
      },
      update: {},
      create: {
        product_id: created.product_id,
        supplier_id: supplier.supplier_id,
      },
    });
  }

  console.log("Seed complete.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
