import { db } from './db.js';

export async function createUsersTable() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        id_custom TEXT UNIQUE,
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

export async function createBoutiqueTable() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS boutique (
        id SERIAL PRIMARY KEY,
        name_boutique TEXT NOT NULL,
        solde INTEGER DEFAULT 0,
        solde_p INTEGER DEFAULT 0,
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

export async function createVenteTable() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS vente (
        id SERIAL PRIMARY KEY,
        name_boutique TEXT NOT NULL,
        produit_code TEXT NOT NULL,
        prix_livraison INTEGER DEFAULT 0,
        prix_total INTEGER DEFAULT 0,
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

export async function createProduitTable() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS produit (
        id SERIAL PRIMARY KEY,
        name_boutique TEXT NOT NULL,
        name_produit TEXT NOT NULL,
        prix_produit INTEGER NOT NULL,
        descr_produit TEXT NOT NULL,
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

// Ne lance pas l'exécution directe si utilisé depuis le backend
