import express from "express";
import bcrypt from "bcrypt";
import cors from "cors";
import nodemailer from "nodemailer";
import { db } from "./db.js";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(cors({
    origin: "http://localhost:5173", // ton frontend
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
    const { uid } = req.params;
    let { code } = req.body;

    if (!code || code.toString().trim().length !== 5)
        return res.status(400).json({ message: "Code invalide" });

    code = code.toString().trim();

    try {
        const { rows } = await db.query(
            "SELECT activation_code FROM users WHERE id = $1",
            [uid]
        );
        const user = rows[0];
        if (!user) return res.status(404).json({ message: "Utilisateur non trouvé" });

        if (!user.activation_code || user.activation_code.trim() !== code)
            return res.status(400).json({ message: "Code d'activation incorrect" });

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Serveur démarré sur port ${PORT}`));
