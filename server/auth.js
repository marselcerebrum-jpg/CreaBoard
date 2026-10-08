// Password (scrypt) dan sesi cookie.
import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";

const SESSION_DAYS = 14;
export const SESSION_COOKIE = "cs_session";

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored).split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(expected, actual);
}

export function validatePassword(password) {
  if (typeof password !== "string" || password.length < 8) return "Password minimal 8 karakter";
  return null;
}

const sha = (s) => createHash("sha256").update(s).digest("hex");

export function createSession(db, userId) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  db.prepare("delete from sessions where expires_at < ?").run(new Date().toISOString());
  db.prepare("insert into sessions (token_hash, user_id, expires_at) values (?, ?, ?)").run(sha(token), userId, expires);
  return { token, maxAge: SESSION_DAYS * 86400 };
}

export function sessionUser(db, token) {
  if (!token) return null;
  const row = db
    .prepare(
      `select u.id, u.username, u.name, u.position, u.role, u.active from sessions s
       join users u on u.id = s.user_id where s.token_hash = ? and s.expires_at > ?`,
    )
    .get(sha(token), new Date().toISOString());
  return row && row.active ? { ...row } : null;
}

export function destroySession(db, token) {
  if (token) db.prepare("delete from sessions where token_hash = ?").run(sha(token));
}

export function destroyUserSessions(db, userId) {
  db.prepare("delete from sessions where user_id = ?").run(userId);
}

// Pembatas percobaan login sederhana per IP+username (in-memory).
const attempts = new Map();
export function loginThrottled(key) {
  const now = Date.now();
  const list = (attempts.get(key) ?? []).filter((t) => now - t < 15 * 60_000);
  attempts.set(key, list);
  return list.length >= 10;
}
export function recordLoginFailure(key) {
  attempts.set(key, [...(attempts.get(key) ?? []), Date.now()]);
}
export function clearLoginFailures(key) {
  attempts.delete(key);
}
