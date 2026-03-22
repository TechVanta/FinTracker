import { Router } from "express";
import { signup, login } from "../services/authService.js";

const router = Router();

router.post("/signup", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ detail: "Email and password are required" });
    }
    if (password.length < 8) {
      return res.status(400).json({ detail: "Password must be at least 8 characters" });
    }
    const result = await signup(email, password);
    return res.status(201).json(result);
  } catch (err) {
    console.error("Signup error:", err);
    return res.status(err.status || 500).json({ detail: err.message });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ detail: "Email and password are required" });
    }
    const result = await login(email, password);
    return res.json(result);
  } catch (err) {
    console.error("Login error:", err);
    return res.status(err.status || 500).json({ detail: err.message });
  }
});

export default router;
