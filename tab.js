import { db } from "./db.js";

// USERS
export async function createUsersTable() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        id_custom INTEGER UNIQUE,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        statue TEXT DEFAULT 'no confirm',
        activation_code TEXT,
        boutique INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("✅ Table USERS créée ou déjà existante");
  } catch (err) {
    console.error("❌ Erreur création table USERS :", err.message);
  }
}

// BOUTIQUE
export async function createBoutiqueTable() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS boutique (
        id SERIAL PRIMARY KEY,
        nameBoutique TEXT NOT NULL,
        solde INTEGER DEFAULT 0,
        soldeP INTEGER DEFAULT 0,
        etat TEXT DEFAULT 'offline',
        wilaya TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("✅ Table BOUTIQUE créée ou déjà existante");
  } catch (err) {
    console.error("❌ Erreur création table BOUTIQUE :", err.message);
  }
}

// VENTE
export async function createVenteTable() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS vente (
        id SERIAL PRIMARY KEY,
        nameBoutique TEXT NOT NULL,
        ProduitCode TEXT NOT NULL,
        PrixLivraison INTEGER DEFAULT 0,
        PrixTotal INTEGER DEFAULT 0,
        etat TEXT DEFAULT 'Non Confirmer',
        wilaya TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("✅ Table VENTE créée ou déjà existante");
  } catch (err) {
    console.error("❌ Erreur création table VENTE :", err.message);
  }
}

// PRODUIT
export async function createProduitTable() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS produit (
        id SERIAL PRIMARY KEY,
        nameBoutique TEXT NOT NULL,
        nameProduit TEXT NOT NULL,
        prixProduit INTEGER NOT NULL,
        descrProduit TEXT NOT NULL,
        etat TEXT DEFAULT 'Disponible',
        stock INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("✅ Table PRODUIT créée ou déjà existante");
  } catch (err) {
    console.error("❌ Erreur création table PRODUIT :", err.message);
  }
}
