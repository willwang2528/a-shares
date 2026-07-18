import { DEFAULT_SETTINGS, type AlertEvent, type DailyReview, type UserSettings } from "./domain";

export type StoredWatchItem = {
  id: string;
  user_id: string;
  group_id: string | null;
  object_type: "sector" | "stock";
  code: string;
  name: string;
  tag: "watch" | "holding";
  cost_price: number | null;
  created_at: string;
  updated_at: string;
};

export async function ensureSchema(db: D1Database) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT, display_name TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT PRIMARY KEY, settings_json TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS watch_groups (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS watch_items (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, group_id TEXT,
      object_type TEXT NOT NULL, code TEXT NOT NULL, name TEXT NOT NULL,
      tag TEXT NOT NULL, cost_price REAL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS watch_items_user_object_code
      ON watch_items (user_id, object_type, code)`,
    `CREATE TABLE IF NOT EXISTS sector_mappings (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, input_name TEXT NOT NULL,
      provider TEXT NOT NULL, classification TEXT NOT NULL, sector_code TEXT NOT NULL,
      sector_name TEXT NOT NULL, member_count INTEGER NOT NULL, confirmed_at TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS market_instruments (
      code TEXT PRIMARY KEY, name TEXT NOT NULL, exchange TEXT NOT NULL, board TEXT,
      provider TEXT NOT NULL, raw_version TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS trading_calendar (
      market TEXT NOT NULL, trade_date TEXT NOT NULL, is_open INTEGER NOT NULL,
      source TEXT NOT NULL, checked_at TEXT NOT NULL, UNIQUE(market, trade_date)
    )`,
    `CREATE TABLE IF NOT EXISTS quote_snapshots (
      id TEXT PRIMARY KEY, provider TEXT NOT NULL, scope TEXT NOT NULL,
      data_time TEXT NOT NULL, payload_json TEXT NOT NULL, is_fresh INTEGER NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS alert_rules (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, rule_type TEXT NOT NULL,
      enabled INTEGER NOT NULL, params_json TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS alert_events (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, dedupe_key TEXT NOT NULL UNIQUE,
      level TEXT NOT NULL, object_type TEXT NOT NULL, object_code TEXT NOT NULL,
      title TEXT NOT NULL, payload_json TEXT NOT NULL, data_time TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS notification_deliveries (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, channel TEXT NOT NULL,
      status TEXT NOT NULL, dedupe_key TEXT NOT NULL UNIQUE, error_code TEXT,
      sent_at TEXT, payload_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS scheduled_job_runs (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, job_type TEXT NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE, trigger_json TEXT NOT NULL,
      status TEXT NOT NULL, attempt INTEGER NOT NULL, started_at TEXT NOT NULL,
      finished_at TEXT, duration_ms INTEGER, error_code TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS job_leases (
      lease_key TEXT PRIMARY KEY, owner TEXT NOT NULL, lease_until TEXT NOT NULL, updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS daily_reviews (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, trade_date TEXT NOT NULL,
      status TEXT NOT NULL, data_ready INTEGER NOT NULL, retry_count INTEGER NOT NULL,
      report_json TEXT NOT NULL, pushed_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      UNIQUE(user_id, trade_date)
    )`,
    `CREATE TABLE IF NOT EXISTS provider_health (
      provider_type TEXT NOT NULL, provider_name TEXT NOT NULL, status TEXT NOT NULL,
      message TEXT NOT NULL, checked_at TEXT NOT NULL, UNIQUE(provider_type, provider_name)
    )`,
    `CREATE TABLE IF NOT EXISTS cost_quotes (
      id TEXT PRIMARY KEY, provider TEXT NOT NULL, item TEXT NOT NULL, currency TEXT NOT NULL,
      monthly_price REAL, annual_price REAL, source_url TEXT NOT NULL, checked_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS cost_estimates (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, scenario TEXT NOT NULL,
      assumptions_json TEXT NOT NULL, monthly_total REAL NOT NULL, annual_total REAL NOT NULL,
      currency TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`,
  ];
  await db.batch(statements.map((statement) => db.prepare(statement)));
}

export async function ensureUser(db: D1Database, userId: string, email?: string, name?: string) {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO users (id, email, display_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name, updated_at = excluded.updated_at`,
    )
    .bind(userId, email ?? null, name ?? "本机体验用户", now, now)
    .run();
  await db
    .prepare(
      `INSERT OR IGNORE INTO user_settings (user_id, settings_json, created_at, updated_at)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(userId, JSON.stringify(DEFAULT_SETTINGS), now, now)
    .run();
}

export async function loadDashboardState(db: D1Database, userId: string) {
  const [settingsRow, alerts, reviews, jobs, deliveries, watches] = await Promise.all([
    db.prepare("SELECT settings_json FROM user_settings WHERE user_id = ?").bind(userId).first<{ settings_json: string }>(),
    db.prepare("SELECT payload_json FROM alert_events WHERE user_id = ? ORDER BY created_at DESC LIMIT 30").bind(userId).all<{ payload_json: string }>(),
    db.prepare("SELECT report_json FROM daily_reviews WHERE user_id = ? ORDER BY trade_date DESC LIMIT 10").bind(userId).all<{ report_json: string }>(),
    db.prepare("SELECT * FROM scheduled_job_runs WHERE user_id = ? ORDER BY started_at DESC LIMIT 12").bind(userId).all(),
    db.prepare("SELECT * FROM notification_deliveries WHERE user_id = ? ORDER BY created_at DESC LIMIT 12").bind(userId).all(),
    db.prepare("SELECT * FROM watch_items WHERE user_id = ? ORDER BY created_at ASC").bind(userId).all(),
  ]);
  return {
    settings: settingsRow ? (JSON.parse(settingsRow.settings_json) as UserSettings) : DEFAULT_SETTINGS,
    alerts: alerts.results.map((row) => JSON.parse(row.payload_json) as AlertEvent),
    reviews: reviews.results.map((row) => JSON.parse(row.report_json) as DailyReview),
    jobs: jobs.results,
    deliveries: deliveries.results,
    watches: watches.results,
  };
}

export async function saveSettings(db: D1Database, userId: string, settings: UserSettings) {
  const now = new Date().toISOString();
  await db
    .prepare("UPDATE user_settings SET settings_json = ?, updated_at = ? WHERE user_id = ?")
    .bind(JSON.stringify(settings), now, userId)
    .run();
}

export async function seedWatchItems(db: D1Database, userId: string) {
  const count = await db.prepare("SELECT COUNT(*) AS count FROM watch_items WHERE user_id = ?").bind(userId).first<{ count: number }>();
  if ((count?.count ?? 0) > 0) return;
  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO watch_items
          (id, user_id, group_id, object_type, code, name, tag, cost_price, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(`watch-${userId}-sector-metal`, userId, null, "sector", "SW-801050", "有色金属", "watch", null, now, now),
    db
      .prepare(
        `INSERT OR IGNORE INTO watch_items
          (id, user_id, group_id, object_type, code, name, tag, cost_price, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(`watch-${userId}-601600`, userId, null, "stock", "601600.SH", "中国铝业", "holding", 7.86, now, now),
    db
      .prepare(
        `INSERT OR IGNORE INTO watch_items
          (id, user_id, group_id, object_type, code, name, tag, cost_price, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(`watch-${userId}-000858`, userId, null, "stock", "000858.SZ", "五粮液", "watch", null, now, now),
  ]);
}

export async function listWatchItems(db: D1Database, userId: string) {
  const rows = await db
    .prepare(
      `SELECT * FROM watch_items
       WHERE user_id = ?
       ORDER BY CASE tag WHEN 'holding' THEN 0 ELSE 1 END, created_at ASC`,
    )
    .bind(userId)
    .all<StoredWatchItem>();
  return rows.results;
}

export async function addWatchItem(
  db: D1Database,
  userId: string,
  input: {
    objectType: "sector" | "stock";
    code: string;
    name: string;
    tag: "watch" | "holding";
  },
) {
  const existing = await db
    .prepare(
      `SELECT * FROM watch_items
       WHERE user_id = ? AND object_type = ? AND code = ?`,
    )
    .bind(userId, input.objectType, input.code)
    .first<StoredWatchItem>();
  if (existing) return { created: false, item: existing };

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO watch_items
        (id, user_id, group_id, object_type, code, name, tag, cost_price, created_at, updated_at)
       VALUES (?, ?, NULL, ?, ?, ?, ?, NULL, ?, ?)`,
    )
    .bind(
      id,
      userId,
      input.objectType,
      input.code,
      input.name,
      input.tag,
      now,
      now,
    )
    .run();
  const item = await db
    .prepare("SELECT * FROM watch_items WHERE id = ? AND user_id = ?")
    .bind(id, userId)
    .first<StoredWatchItem>();
  return { created: true, item };
}

export async function updateWatchTag(
  db: D1Database,
  userId: string,
  id: string,
  tag: "watch" | "holding",
) {
  const result = await db
    .prepare(
      `UPDATE watch_items SET tag = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    )
    .bind(tag, new Date().toISOString(), id, userId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function deleteWatchItem(
  db: D1Database,
  userId: string,
  id: string,
) {
  const result = await db
    .prepare("DELETE FROM watch_items WHERE id = ? AND user_id = ?")
    .bind(id, userId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function acquireLease(db: D1Database, leaseKey: string, owner: string, seconds = 45) {
  const now = new Date();
  const until = new Date(now.getTime() + seconds * 1000).toISOString();
  const result = await db
    .prepare(
      `INSERT INTO job_leases (lease_key, owner, lease_until, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(lease_key) DO UPDATE SET
         owner = excluded.owner, lease_until = excluded.lease_until, updated_at = excluded.updated_at
       WHERE job_leases.lease_until < excluded.updated_at`,
    )
    .bind(leaseKey, owner, until, now.toISOString())
    .run();
  return (result.meta.changes ?? 0) > 0;
}
