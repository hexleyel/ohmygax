/**
 * First-time project setup: creates the MySQL database if it doesn't exist,
 * syncs the Prisma schema into it, and seeds demo data.
 *
 * Run with: npm run setup
 * (requires a MySQL/MariaDB server already running, e.g. via XAMPP)
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execSync } = require("child_process");
const mariadb = require("mariadb");

const ROOT = path.resolve(__dirname, "..");
const ENV_PATH = path.join(ROOT, ".env");
const ENV_EXAMPLE_PATH = path.join(ROOT, ".env.example");
const DEFAULT_DATABASE_URL = "mysql://root:@localhost:3306/ohmygas";

function ensureEnvFile() {
  if (fs.existsSync(ENV_PATH)) return;

  console.log("No .env found — creating one from .env.example...");
  let contents = fs.existsSync(ENV_EXAMPLE_PATH)
    ? fs.readFileSync(ENV_EXAMPLE_PATH, "utf8")
    : `DATABASE_URL="${DEFAULT_DATABASE_URL}"\nJWT_SECRET="replace-with-a-long-random-string"\n`;

  const jwtSecret = crypto.randomBytes(32).toString("hex");
  contents = contents.replace(
    /JWT_SECRET="[^"]*"/,
    `JWT_SECRET="${jwtSecret}"`,
  );

  fs.writeFileSync(ENV_PATH, contents);
  console.log(`Created .env with a freshly generated JWT_SECRET.`);
}

function loadDatabaseUrl() {
  require("dotenv").config({ path: ENV_PATH });
  return process.env.DATABASE_URL || DEFAULT_DATABASE_URL;
}

async function ensureDatabaseExists(databaseUrl) {
  const url = new URL(databaseUrl);
  const dbName = url.pathname.replace(/^\//, "");

  if (!dbName) {
    throw new Error(`DATABASE_URL is missing a database name: ${databaseUrl}`);
  }

  console.log(`Connecting to MySQL at ${url.hostname}:${url.port || 3306}...`);
  const connection = await mariadb.createConnection({
    host: url.hostname,
    port: Number(url.port) || 3306,
    user: decodeURIComponent(url.username || "root"),
    password: decodeURIComponent(url.password || ""),
  });

  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`,
    );
    console.log(`Database "${dbName}" is ready.`);
  } finally {
    await connection.end();
  }
}

function run(command) {
  console.log(`\n> ${command}`);
  execSync(command, { cwd: ROOT, stdio: "inherit" });
}

async function main() {
  ensureEnvFile();
  const databaseUrl = loadDatabaseUrl();

  try {
    await ensureDatabaseExists(databaseUrl);
  } catch (error) {
    console.error("\nCould not connect to MySQL.");
    console.error(
      "Make sure your MySQL/MariaDB server is running (e.g. start XAMPP's MySQL service) " +
        "and that DATABASE_URL in .env points to it.",
    );
    throw error;
  }

  run("npx prisma generate");
  run("npx prisma db push --accept-data-loss");
  run("npx prisma db seed");

  console.log("\nSetup complete. Demo accounts:");
  console.log("  Admin:   admin / Admin@123");
  console.log("  Cashier: mariasantos / Cash@123");
  console.log("\nRun `npm run dev` to start the app.");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
