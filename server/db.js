// Database SQLite (node:sqlite bawaan Node 22) — satu file, tanpa layanan luar.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const SCHEMA = `
create table if not exists users (
  id            integer primary key autoincrement,
  username      text not null unique collate nocase,
  name          text not null,
  position      text not null check (position in ('Leader','Staff')),
  role          text not null check (role in ('Marketing','Creative','Talent')),
  password_hash text not null,
  active        integer not null default 1,
  created_at    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create table if not exists sessions (
  token_hash text primary key,
  user_id    integer not null references users(id) on delete cascade,
  expires_at text not null
);

-- Pilihan dropdown yang bisa diatur Leader. "semantic" menentukan hitungan dashboard,
-- "label" bebas. Pilihan yang dihapus diarsipkan agar konten lama tetap terbaca.
create table if not exists options (
  id       text primary key,
  key      text not null check (key in ('app','talentName','script','talent','creative','qc')),
  label    text not null,
  semantic text not null default '',
  sort     integer not null default 0,
  archived integer not null default 0
);

create table if not exists contents (
  id                integer primary key autoincrement,
  title             text not null,
  app               text not null references options(id),
  type              text not null check (type in ('Video','Carousel','Singlepost')),
  created_date      text not null,           -- tanggal pengerjaan (YYYY-MM-DD)
  upload_date       text not null,           -- rencana tanggal upload
  script_status     text not null references options(id),
  talent_status     text references options(id),
  talent_name       text references options(id),
  creative_status   text not null references options(id),
  qc_status         text not null references options(id),
  link              text not null default '',
  notes             text not null default '',
  sheet             text not null default '{}',
  marketing_user_id integer references users(id),
  creative_user_id  integer references users(id),
  script_ready_at   text,
  talent_done_at    text,
  creative_done_at  text,
  link_at           text,
  qc_at             text,
  published_url     text,
  published_date    text,
  published_by      integer references users(id),
  archived          integer not null default 0,
  revision          integer not null default 1,
  created_at        text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists contents_upload_idx on contents(upload_date);
create index if not exists contents_created_idx on contents(created_date);

-- Riwayat perubahan (append-only dari sisi aplikasi).
create table if not exists events (
  id         integer primary key autoincrement,
  content_id integer not null references contents(id) on delete cascade,
  user_id    integer references users(id),
  field      text not null,
  from_value text,
  to_value   text,
  at         text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists events_content_idx on events(content_id, at);

create table if not exists calendar_plans (
  app    text not null,
  type   text not null,
  date   text not null,
  amount integer,
  color  text,
  primary key (app, type, date)
);

-- Pembagian apps per orang (diatur Leader bidangnya).
create table if not exists user_apps (
  user_id integer not null references users(id) on delete cascade,
  app     text not null references options(id),
  primary key (user_id, app)
);

create table if not exists kpis (
  id          integer primary key autoincrement,
  user_id     integer not null references users(id) on delete cascade,
  app         text not null,
  type        text not null check (type in ('Video','Carousel','Singlepost')),
  work_date   text not null,
  upload_date text not null,
  amount      integer not null check (amount > 0),
  unique (user_id, app, type, work_date)
);
`;

// Kategori proses tetap; label dapat diganti Leader di Setting.
const DEFAULT_OPTIONS = {
  app: ["JadiASN", "JadiSEKDIN", "JadiBUMN", "JadiPCPM", "JadiPrajurit", "JadiPolisi", "JadiBeasiswa", "Cerebrum", "JagoTPA", "TOEFL Academy"]
    .map((l) => [l, ""]),
  talentName: [["Talent 1", ""], ["Talent 2", ""]],
  script: [["Draft", "Draft"], ["Skrip ready", "Ready"]],
  talent: [["Belum take", "Belum"], ["Done", "Done"], ["Tidak perlu", "Tidak perlu"]],
  creative: [["Belum diedit", "Belum"], ["Done", "Done"]],
  qc: [["Belum QC", ""], ["Done", "Done"], ["Revisi", "Revisi"]],
};

export function openDb(file) {
  if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("pragma journal_mode = wal; pragma foreign_keys = on; pragma busy_timeout = 5000;");
  db.exec(SCHEMA);
  // Pembagian apps hanya berlaku untuk staff Marketing.
  db.exec("delete from user_apps where user_id in (select id from users where role <> 'Marketing' or position <> 'Staff')");
  const count = db.prepare("select count(*) n from options").get().n;
  if (count === 0) {
    const ins = db.prepare("insert into options (id, key, label, semantic, sort) values (?, ?, ?, ?, ?)");
    for (const [key, list] of Object.entries(DEFAULT_OPTIONS)) {
      list.forEach(([label, semantic], i) => ins.run(`${key}:${i + 1}`, key, label, semantic, i));
    }
  }
  return db;
}

/** Menjalankan fn dalam satu transaksi. */
export function tx(db, fn) {
  db.exec("begin immediate");
  try {
    const out = fn();
    db.exec("commit");
    return out;
  } catch (e) {
    db.exec("rollback");
    throw e;
  }
}
