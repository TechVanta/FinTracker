import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import config from "../config.js";
import { createUser, getUserByEmail } from "../infrastructure/dynamodb.js";

export async function signup(email, password) {
  const existing = await getUserByEmail(email);
  if (existing) {
    const err = new Error("User with this email already exists");
    err.status = 409;
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = {
    user_id: uuidv4(),
    email,
    password_hash: passwordHash,
    created_at: new Date().toISOString(),
  };

  await createUser(user);

  const token = generateToken(user);
  return { token, user_id: user.user_id, email: user.email };
}

export async function login(email, password) {
  const user = await getUserByEmail(email);
  if (!user) {
    const err = new Error("Invalid email or password");
    err.status = 401;
    throw err;
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    const err = new Error("Invalid email or password");
    err.status = 401;
    throw err;
  }

  const token = generateToken(user);
  return { token, user_id: user.user_id, email: user.email };
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwt.secret);
  } catch {
    const err = new Error("Invalid or expired token");
    err.status = 401;
    throw err;
  }
}

function generateToken(user) {
  return jwt.sign(
    { sub: user.user_id, email: user.email },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
}
