import { test } from "node:test";
import assert from "node:assert/strict";
import { databaseUrl } from "../server/index.js";

const PASSWORD = "\\x+?a,b{c}@#/%:";
// mysql2 dan pg sama-sama membaca URL begini: new URL lalu decodeURIComponent.
const read = (url) => {
  const u = new URL(url);
  return [u.protocol, u.hostname, u.port, decodeURIComponent(u.username), decodeURIComponent(u.password), decodeURIComponent(u.pathname.slice(1))];
};

test("DB_* dirakit jadi URL yang terbaca utuh, termasuk password berkarakter khusus", () => {
  const env = { DB_HOST: "10.0.0.5", DB_USER: "app", DB_PASSWORD: PASSWORD, DB_NAME: "creative_desk" };
  assert.deepEqual(read(databaseUrl(env)), ["mysql:", "10.0.0.5", "3306", "app", PASSWORD, "creative_desk"]);
  assert.deepEqual(read(databaseUrl({ ...env, DB_CLIENT: "postgres", DB_PORT: "5433" })), ["postgres:", "10.0.0.5", "5433", "app", PASSWORD, "creative_desk"]);
});

test("DATABASE_URL tetap diutamakan; tanpa keduanya = PGlite lokal", () => {
  assert.equal(databaseUrl({ DATABASE_URL: "mysql://a:b@h/d", DB_HOST: "x" }), "mysql://a:b@h/d");
  assert.equal(databaseUrl({}), undefined);
});
