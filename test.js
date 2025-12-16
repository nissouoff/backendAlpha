import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // important pour Render
});

async function testConnection() {
  try {
    await db.query("SELECT NOW()"); // simple query pour tester
    console.log("✅ Connexion à PostgreSQL réussie !");
  } catch (err) {
    console.error("❌ Erreur de connexion :", err.message);
  } finally {
    await db.end();
  }
}

testConnection();
