import { verifyToken } from "../services/authService.js";

export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ detail: "Missing authorization token" });
  }

  try {
    const token = header.slice(7);
    const payload = verifyToken(token);
    req.userId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ detail: "Invalid or expired token" });
  }
}
