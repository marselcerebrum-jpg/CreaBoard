// Database untuk tes: PGlite (bawaan), atau MySQL 8 bila TEST_MYSQL_URL diisi
// (mis. mysql://root:pw@127.0.0.1:3306) — setiap file tes memakai database sendiri yang dibuat ulang.
import { PGlite } from "@electric-sql/pglite";
import { createMysqlPool, fromMysql, fromPglite, migrate } from "../server/db.js";

let close = async () => {};

export async function testDb(name) {
  const url = process.env.TEST_MYSQL_URL;
  if (!url) return migrate(fromPglite(await PGlite.create()));
  const mysql = await import("mysql2/promise");
  const dbName = `cd_test_${name}`;
  const admin = await mysql.createConnection(url);
  await admin.query(`drop database if exists \`${dbName}\``);
  await admin.query(`create database \`${dbName}\` character set utf8mb4 collate utf8mb4_0900_ai_ci`);
  await admin.end();
  const pool = await createMysqlPool(`${url.replace(/\/$/, "")}/${dbName}`);
  close = () => pool.end();
  return migrate(fromMysql(pool));
}

export const closeDb = () => close();
