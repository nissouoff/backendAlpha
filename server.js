import express from "express";
import bcrypt from "bcrypt";
import cors from "cors";
import nodemailer from "nodemailer";
import { db } from "./db.js"; // db.js doit exposer "db" ouvert avec sqlite
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
dotenv.config();
const JWT_SECRET = process.env.JWT_SECRET;
import { createUsersTable, createBoutiqueTable, createVenteTable, createProduitTable } from "./tab.js";


async function initDatabase() {
  try {
    await createUsersTable();
    await createBoutiqueTable();
    await createVenteTable();
    await createProduitTable();
    console.log("✅ Toutes les tables sont créées ou déjà existantes");
  } catch (err) {
    console.error("❌ Erreur lors de la création des tables :", err.message);
    process.exit(1); // arrête le serveur si la DB n’est pas accessible
  }
}


const app = express();
app.use(express.json());
app.use(cookieParser());

app.use(cors({
    origin: "http://localhost:5173", // ton frontend Vite
    credentials: true // 🔑 pour permettre cookies + fetch
}));

app.use(express.json());

const routesMap = {
  "9fA3Xk": "penal",
  "A7Z9Q": "login",
};

app.get("/p/:id", (req, res) => {
  const page = routesMap[req.params.id];
  if (!page) return res.status(404).send("Not found");
  res.sendFile(`/pages/${page}.html`);
});


/* =========================
   Nodemailer Setup
========================= */
export const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.SMTP_USER, // ex: nissoulintouchable@gmail.com
    pass: process.env.SMTP_PASS  // mot de passe d’application
  }
});
async function generateUniqueUserId() {
  let unique = false;
  let userId;

  while (!unique) {
    userId = Math.floor(100000 + Math.random() * 900000).toString();

    const exists = await db.get(
      "SELECT id FROM users WHERE id_custom = ?",
      [userId]
    );

    if (!exists) unique = true;
  }

  return userId;
}


/* =========================
   SIGNUP
========================= */
app.post("/api/auth/signup", async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: "Champs manquants" });
  }

  try {
    // 1️⃣ Vérifier si l'email existe
    const { rows: existingRows } = await db.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );

    if (existingRows.length > 0) {
      return res.status(409).json({ message: "Ce compte existe déjà" });
    }

    // 2️⃣ Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 3️⃣ Générer ID unique (6 chiffres)
    let customId;
    while (true) {
      customId = Math.floor(100000 + Math.random() * 900000).toString();

      const { rows } = await db.query(
        "SELECT id FROM users WHERE id = $1",
        [customId]
      );

      if (rows.length === 0) break;
    }

    // 4️⃣ Générer code d’activation
    const activationCode = Math.floor(10000 + Math.random() * 90000).toString();

    // 5️⃣ Insert user
    await db.query(
      `INSERT INTO users (id, id_custom, name, email, password, statue, activation_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        customId,
        customId,
        name,
        email,
        hashedPassword,
        "no confirm",
        activationCode
      ]
    );

    // 6️⃣ Réponse
    res.json({
      user: {
        uid: customId,
        id_custom: customId,
        name,
        email,
        statue: "no confirm",
        boutique: 0
      }
    });

  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});


app.post("/api/auth/logout", (req, res) => {
  // Supprime le cookie côté client
  res.clearCookie("auth_token", {
    httpOnly: true,
    secure: false, // true en prod
    sameSite: "lax"
  });

  res.json({ message: "Déconnexion réussie" });
});



/* =========================
   LOGIN
========================= */
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Champs manquants" });
  }

  try {
    // 1️⃣ Récupérer l'utilisateur
    const { rows } = await db.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    const user = rows[0];
    if (!user) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }

    // 2️⃣ Vérifier le mot de passe
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ message: "Mot de passe incorrect" });
    }

    // 3️⃣ COMPTE NON CONFIRMÉ
   // CAS : COMPTE NON CONFIRMÉ
if (user.statue === "no confirm") {
  const activationCode = Math.floor(10000 + Math.random() * 90000).toString();

  await db.query(
    "UPDATE users SET activation_code = $1 WHERE id = $2",
    [activationCode, user.id]
  );

  await transporter.sendMail({
    from: '"AlphaBoutique" <ton.email@gmail.com>',
    to: user.email,
    subject: "Activation de votre compte",
    html: `
      <h2>Bonjour ${user.name},</h2>
      <p>Votre compte est prêt 🚀</p>
      <p><b>ID utilisateur :</b> ${user.id}</p>
      <p><b>Code d'activation :</b> ${activationCode}</p>
    `,
  });

  return res.json({
    needActivation: true,
    user: {
      uid: user.id,
      name: user.name,
      email: user.email,
      statue: user.statue,
      boutique: user.boutique
    }
  });
}


    // 4️⃣ COMPTE CONFIRMÉ → JWT
    const token = jwt.sign(
      { uid: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    // 5️⃣ Cookie HttpOnly
    res.cookie("auth_token", token, {
      httpOnly: true,
      secure: false,   // true en prod (HTTPS)
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    return res.json({
      user: {
        uid: user.id,
        name: user.name,
        email: user.email,
        statue: user.statue,
        boutique: user.boutique
      }
    });

  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});



app.get("/api/auth/me", async (req, res) => {
  const token = req.cookies.auth_token;
  if (!token) {
    return res.status(401).json({ message: "Non connecté" });
  }

  try {
    // 1️⃣ Vérifier le JWT
    const decoded = jwt.verify(token, JWT_SECRET);

    // 2️⃣ Récupérer l'utilisateur
    const { rows } = await db.query(
      "SELECT id, name, email, statue, boutique FROM users WHERE id = $1",
      [decoded.uid]
    );

    const user = rows[0];
    if (!user) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }

    // 3️⃣ Réponse clean (no data leak)
    res.json({
      user: {
        uid: user.id,
        name: user.name,
        email: user.email,
        statue: user.statue,
        boutique: user.boutique
      }
    });

  } catch (err) {
    return res.status(401).json({ message: "Token invalide" });
  }
});





// Vérification code d'activation
app.patch("/api/auth/activate/:uid", async (req, res) => {
  const { uid } = req.params;
  let { code } = req.body;

  if (!code || code.toString().trim().length !== 5) {
    return res.status(400).json({ message: "Code invalide" });
  }

  code = code.toString().trim();

  try {
    // 1️⃣ Récupérer l'utilisateur
    const { rows } = await db.query(
      "SELECT activation_code FROM users WHERE id = $1",
      [uid]
    );

    const user = rows[0];
    if (!user) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }

    // 2️⃣ Comparer les codes
    if (!user.activation_code || user.activation_code.trim() !== code) {
      return res.status(400).json({ message: "Code d'activation incorrect" });
    }

    // 3️⃣ Confirmer le compte
    await db.query(
      "UPDATE users SET statue = $1, activation_code = NULL WHERE id = $2",
      ["confirm", uid]
    );

    res.json({ message: "Compte confirmé avec succès" });

  } catch (err) {
    console.error("Activation error:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});



/* =========================
   Serveur
========================= */
initDatabase().then(() => {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`);
  });
});

