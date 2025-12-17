/* ================== IMPORTS ================== */
import express from "express";
import bcrypt from "bcrypt";
import cors from "cors";
import nodemailer from "nodemailer";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { db } from "./db.js";

import {
  createUsersTable,
  createBoutiqueTable,
  createVenteTable,
  createProduitTable
} from "./tab.js";

dotenv.config();

/* ================== CHECK ENV ================== */
if (!process.env.JWT_SECRET) {
  throw new Error("❌ JWT_SECRET manquant dans .env");
}

/* ================== APP INIT ================== */
const app = express();

/* Render / proxy (OBLIGATOIRE pour cookies HTTPS) */
app.set("trust proxy", 1);

/* ================== MIDDLEWARES ================== */
app.use(express.json());
app.use(cookieParser());

const allowedOrigins = [
  "http://localhost:5173",
  "https://TON_FRONTEND.onrender.com" // à remplacer plus tard
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true
}));

/* Debug réseau (tu peux enlever plus tard) */
app.use((req, res, next) => {
  console.log("➡️", req.method, req.path, "| origin:", req.headers.origin);
  next();
});

/* ================== MAILER ================== */
export const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

/* ================== INIT DB ================== */
async function initDatabase() {
  console.log("⏳ Initialisation DB...");
  await createUsersTable();
  await createBoutiqueTable();
  await createVenteTable();
  await createProduitTable();
  console.log("✅ DB prête");
}

/* ================== UTILS ================== */
async function generateUniqueId() {
  let id, exists = true;
  while (exists) {
    id = Math.floor(100000 + Math.random() * 900000);
    const { rows } = await db.query("SELECT id FROM users WHERE id = $1", [id]);
    exists = rows.length > 0;
  }
  return id;
}

/* ================== AUTH MIDDLEWARE ================== */
function auth(req, res, next) {
  const token = req.cookies.auth_token;
  if (!token) return res.status(401).json({ message: "Non authentifié" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.uid;
    next();
  } catch {
    res.status(401).json({ message: "Token invalide" });
  }
}

/* ================== ROUTES ================== */

/* ----- SIGNUP ----- */
app.post("/api/auth/signup", async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ message: "Champs manquants" });

  try {
    const existing = await db.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );
    if (existing.rows.length > 0)
      return res.status(400).json({ message: "Email déjà utilisé" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const id = await generateUniqueId();

    const result = await db.query(
      `INSERT INTO users (id, name, email, password, statue)
       VALUES ($1, $2, $3, $4, 'no confirm')
       RETURNING id, name, email`,
      [id, name, email, hashedPassword]
    );

    res.json({
      message: "Inscription réussie",
      user: {
        uid: result.rows[0].id,
        name: result.rows[0].name,
        email: result.rows[0].email
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

/* ----- LOGIN ----- */
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: "Champs manquants" });

  try {
    const { rows } = await db.query(
      "SELECT id, name, email, password, statue, boutique FROM users WHERE email = $1",
      [email]
    );

    if (rows.length === 0)
      return res.status(401).json({ message: "Identifiants incorrects" });

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid)
      return res.status(401).json({ message: "Identifiants incorrects" });

    /* ---- NO CONFIRM ---- */
    if (user.statue === "no confirm") {
      const code = Math.floor(10000 + Math.random() * 90000).toString();
      await db.query(
        "UPDATE users SET activation_code = $1 WHERE id = $2",
        [code, user.id]
      );

      try {
        await transporter.sendMail({
          from: `"AlphaBoutique" <${process.env.SMTP_USER}>`,
          to: user.email,
          subject: "Code d’activation 🔐",
          html: `<h2>Code : <strong>${code}</strong></h2>`
        });
      } catch (e) {
        console.error("Mail error:", e.message);
      }

      return res.json({
        status: "NO_CONFIRM",
        uid: user.id,
        email: user.email
      });
    }

    /* ---- CONFIRM OK ---- */
    const token = jwt.sign(
      { uid: user.id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.cookie("auth_token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "None",
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({
      status: "OK",
      user: {
        uid: user.id,
        name: user.name,
        email: user.email,
        boutique: user.boutique
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

/* ----- ACTIVATE ----- */
app.patch("/api/auth/activate/:uid", async (req, res) => {
  const { uid } = req.params;
  const { code } = req.body;

  if (!code || code.length !== 5)
    return res.status(400).json({ message: "Code invalide" });

  try {
    const { rows } = await db.query(
      "SELECT statue, activation_code FROM users WHERE id = $1",
      [uid]
    );

    if (!rows[0])
      return res.status(404).json({ message: "Utilisateur introuvable" });

    if (rows[0].activation_code !== code)
      return res.status(400).json({ message: "Code incorrect" });

    await db.query(
      "UPDATE users SET statue = 'confirm', activation_code = NULL WHERE id = $1",
      [uid]
    );

    res.json({ message: "Compte activé" });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur" });
  }
});

/* ----- ME ----- */
app.get("/api/auth/me", auth, async (req, res) => {
  const { rows } = await db.query(
    "SELECT id, name, email, boutique FROM users WHERE id = $1",
    [req.userId]
  );
  res.json(rows[0]);
});

/* ----- LOGOUT ----- */
app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("auth_token", {
    httpOnly: true,
    secure: true,
    sameSite: "None"
  });
  res.json({ message: "Déconnecté" });
});

/* ================== SERVER ================== */
const PORT = process.env.PORT || 3000;

initDatabase()
  .then(() => {
    app.listen(PORT, () =>
      console.log(`🚀 Backend live on port ${PORT}`)
    );
  })
  .catch(err => {
    console.error("❌ DB INIT FAIL", err);
    process.exit(1);
  });
