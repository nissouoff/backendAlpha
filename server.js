import express from "express";
import bcrypt from "bcrypt";
import cors from "cors";
import nodemailer from "nodemailer";
import { db } from "./db.js";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
dotenv.config();

import {
  createUsersTable,
  createBoutiqueTable,
  createVenteTable,
  createProduitTable
} from "./tab.js";

async function initDatabase() {
  console.log("⏳ Initialisation de la base de données...");

  await createUsersTable();
  await createBoutiqueTable();
  await createVenteTable();
  await createProduitTable();

  console.log("🚀 Base de données prête");
}



const JWT_SECRET = process.env.JWT_SECRET;

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(cors({
    origin: "https://alphaboutiquefrontend.onrender.com", // ton frontend
    credentials: true
}));

/* ===== Nodemailer ===== */
export const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

/* ===== LOGIN ===== */
app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Champs manquants" });

    try {
        const { rows } = await db.query(
            "SELECT id, name, email, password, statue, boutique FROM users WHERE email = $1",
            [email]
        );
        if (rows.length === 0) return res.status(401).json({ message: "Email ou mot de passe incorrect" });

        const user = rows[0];
        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) return res.status(401).json({ message: "Email ou mot de passe incorrect" });

        // ---------------- NO_CONFIRM ----------------
        if (user.statue === "no confirm") {
            const activationCode = Math.floor(10000 + Math.random() * 90000).toString();

            // Mettre à jour DB
            await db.query("UPDATE users SET activation_code = $1 WHERE id = $2", [activationCode, user.id]);

            // Envoyer mail (try/catch pour ne pas bloquer)
            let mailSent = false;
            try {
                await transporter.sendMail({
                    from: `"AlphaBoutique" <${process.env.SMTP_USER}>`,
                    to: user.email,
                    subject: "Votre code d’activation 🔐",
                    html: `
                        <div style="font-family: sans-serif; padding: 20px;">
                            <h2>Bonjour ${user.name},</h2>
                            <p>Merci pour votre inscription sur <strong>AlphaBoutique</strong>.</p>
                            <p>Votre <strong>code d’activation</strong> est :</p>
                            <h1 style="color: #e74c3c;">${activationCode}</h1>
                            <p>Il est valide pour les 10 prochaines minutes.</p>
                            <p>Si vous n’avez pas demandé ce code, ignorez ce mail.</p>
                            <br><p>— L’équipe AlphaBoutique</p>
                        </div>
                    `
                });
                mailSent = true;
            } catch (err) {
                console.error("Erreur envoi mail:", err.message);
            }

            return res.status(200).json({
                status: "NO_CONFIRM",
                uid: user.id,
                email: user.email,
                message: mailSent 
                    ? "Code d’activation envoyé par email"
                    : "Impossible d’envoyer le mail, mais le code est généré"
            });
        }

        // ---------------- CONFIRM ----------------
        const token = jwt.sign({ uid: user.id }, JWT_SECRET, { expiresIn: "7d" });
        res.cookie("auth_token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "None",
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        return res.json({ status: "OK", user: { uid: user.id, name: user.name, email: user.email, boutique: user.boutique } });

    } catch (err) {
        console.error("Login error:", err);
        res.status(500).json({ message: "Erreur serveur", error: err.message });
    }
});

/* ===== Vérification code activation ===== */
app.patch("/api/auth/activate/:uid", async (req, res) => {
    const { uid } = req.params;           // uid = id à 6 chiffres
    let { code } = req.body;

    // Vérification du code
    if (!code || code.toString().trim().length !== 5)
        return res.status(400).json({ message: "Code invalide" });

    code = code.toString().trim();

    try {
        // Récupérer l'utilisateur par son id (uid)
        const { rows } = await db.query(
            "SELECT id, statue, activation_code FROM users WHERE id = $1",
            [uid]
        );

        const user = rows[0];
        if (!user) return res.status(404).json({ message: "Utilisateur non trouvé" });

        // Vérifier que le compte n'est pas déjà confirmé
        if (user.statue === "confirm") 
            return res.status(400).json({ message: "Compte déjà confirmé" });

        // Vérifier le code d'activation
        if (!user.activation_code || user.activation_code.trim() !== code)
            return res.status(400).json({ message: "Code d'activation incorrect" });

        // Mettre à jour le statut
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


async function generateUniqueId() {
    let id;
    let exists = true;

    while (exists) {
        id = Math.floor(100000 + Math.random() * 900000); // 6 chiffres
        const { rows } = await db.query("SELECT id FROM users WHERE id = $1", [id]);
        exists = rows.length > 0;
    }

    return id;
}

app.post('/api/auth/signup', async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
        return res.status(400).json({ message: 'Veuillez remplir tous les champs' });

    try {
        // Vérifier si email existe déjà
        const existing = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        if (existing.rows.length > 0)
            return res.status(400).json({ message: 'Email déjà utilisé' });

        // Hash du mot de passe
        const hashedPassword = await bcrypt.hash(password, 10);

        // Générer un ID unique 6 chiffres
        const id = await generateUniqueId();

        // Insérer l'utilisateur
        const result = await db.query(
            `INSERT INTO users (id, name, email, password) 
             VALUES ($1, $2, $3, $4) RETURNING id, name, email`,
            [id, name, email, hashedPassword]
        );

        const user = result.rows[0];
        res.json({ message: 'Inscription réussie', user: { uid: user.id, name: user.name, email: user.email } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Erreur serveur' });
    }
});


const PORT = process.env.PORT || 3000;

initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`✅ Serveur démarré sur http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error("❌ Échec initialisation DB :", err);
    process.exit(1); // stop si DB KO
  });

