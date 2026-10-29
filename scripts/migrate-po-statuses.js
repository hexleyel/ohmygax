const path = require("path");
const mariadb = require("mariadb");

require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set. Run `npm run setup` first.");
  }

  const url = new URL(databaseUrl);
  const connection = await mariadb.createConnection({
    host: url.hostname,
    port: Number(url.port) || 3306,
    user: decodeURIComponent(url.username || "root"),
    password: decodeURIComponent(url.password || ""),
    database: decodeURIComponent(url.pathname.replace(/^\//, "")),
  });

  try {
    await connection.beginTransaction();
    const result = await connection.query(
      "UPDATE purchase_orders SET status = 'pending' WHERE LOWER(status) = 'confirmed'",
    );
    await connection.commit();
    console.log(`Updated ${result.affectedRows} CONFIRMED purchase orders to PENDING.`);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
