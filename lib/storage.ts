import { DEFAULT_SETTINGS, type AlertEvent, type DailyReview, type UserSettings } from "./domain";
import type { HistoricalReviewResult } from "./historical-review";
import type { MarketDailyReview } from "./daily-market-review";

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

type StoredHistoricalReviewCache = {
  payload_json: string;
  expires_at: string;
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
    `CREATE TABLE IF NOT EXISTS historical_review_cache (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, trade_date TEXT NOT NULL,
      scope_key TEXT NOT NULL, provider TEXT NOT NULL, status TEXT NOT NULL,
      payload_json TEXT NOT NULL, fetched_at TEXT NOT NULL, expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      UNIQUE(user_id, trade_date, scope_key)
    )`,
    `CREATE TABLE IF NOT EXISTS market_daily_reviews (
      trade_date TEXT PRIMARY KEY, data_version TEXT NOT NULL, provider TEXT NOT NULL,
      payload_json TEXT NOT NULL, fetched_at TEXT NOT NULL, created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
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
    `DELETE FROM alert_events
      WHERE lower(payload_json) LIKE '%mock%'
        OR lower(payload_json) LIKE '%fixture%'`,
    `DELETE FROM daily_reviews
      WHERE lower(report_json) LIKE '%mock%' OR lower(report_json) LIKE '%fixture%'`,
    `DELETE FROM quote_snapshots
      WHERE lower(provider) LIKE '%mock%' OR lower(payload_json) LIKE '%mock%'
        OR lower(payload_json) LIKE '%fixture%'`,
    `DELETE FROM scheduled_job_runs
      WHERE lower(trigger_json) LIKE '%fixture%'`,
    `DELETE FROM notification_deliveries
      WHERE channel = 'simulation' OR status = 'simulated'`,
    `UPDATE user_settings
      SET settings_json = replace(
        settings_json,
        '"notification_channel":"simulation"',
        '"notification_channel":"browser"'
      )
      WHERE settings_json LIKE '%"notification_channel":"simulation"%'`,
    `DELETE FROM watch_items
      WHERE id LIKE 'watch-%-sector-metal'
         OR id LIKE 'watch-%-601600'
         OR id LIKE 'watch-%-000858'`,
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
  const storedSettings = settingsRow
    ? (JSON.parse(settingsRow.settings_json) as Partial<UserSettings> & {
        notification_channel?: string;
      })
    : {};
  const notificationChannel = ["browser", "serverchan", "email"].includes(
    storedSettings.notification_channel ?? "",
  )
    ? (storedSettings.notification_channel as UserSettings["notification_channel"])
    : "browser";
  return {
    settings: {
      ...DEFAULT_SETTINGS,
      ...storedSettings,
      notification_channel: notificationChannel,
    },
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

export async function getHistoricalReviewCache(
  db: D1Database,
  userId: string,
  tradeDate: string,
  scopeKey: string,
  now = new Date(),
) {
  const row = await db
    .prepare(
      `SELECT payload_json, expires_at
       FROM historical_review_cache
       WHERE user_id = ? AND trade_date = ? AND scope_key = ? AND expires_at > ?`,
    )
    .bind(userId, tradeDate, scopeKey, now.toISOString())
    .first<StoredHistoricalReviewCache>();
  if (!row) return null;
  try {
    return {
      historical: JSON.parse(row.payload_json) as HistoricalReviewResult,
      expiresAt: row.expires_at,
    };
  } catch {
    return null;
  }
}

export async function saveHistoricalReviewCache(
  db: D1Database,
  userId: string,
  scopeKey: string,
  historical: HistoricalReviewResult,
  expiresAt: string,
) {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO historical_review_cache
        (id, user_id, trade_date, scope_key, provider, status, payload_json,
         fetched_at, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, trade_date, scope_key) DO UPDATE SET
         provider = excluded.provider,
         status = excluded.status,
         payload_json = excluded.payload_json,
         fetched_at = excluded.fetched_at,
         expires_at = excluded.expires_at,
         updated_at = excluded.updated_at`,
    )
    .bind(
      crypto.randomUUID(),
      userId,
      historical.tradeDate,
      scopeKey,
      historical.provider,
      historical.status,
      JSON.stringify(historical),
      historical.fetchedAt,
      expiresAt,
      now,
      now,
    )
    .run();
}

export async function getLatestMarketDailyReview(
  db: D1Database,
  beforeTradeDate?: string,
) {
  const row = beforeTradeDate
    ? await db
        .prepare(
          `SELECT payload_json FROM market_daily_reviews
           WHERE trade_date < ? ORDER BY trade_date DESC LIMIT 1`,
        )
        .bind(beforeTradeDate)
        .first<{ payload_json: string }>()
    : await db
        .prepare(
          "SELECT payload_json FROM market_daily_reviews ORDER BY trade_date DESC LIMIT 1",
        )
        .first<{ payload_json: string }>();
  if (!row) return null;
  try {
    return JSON.parse(row.payload_json) as MarketDailyReview;
  } catch {
    return null;
  }
}

export async function saveMarketDailyReview(
  db: D1Database,
  review: MarketDailyReview,
) {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO market_daily_reviews
        (trade_date, data_version, provider, payload_json, fetched_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(trade_date) DO UPDATE SET
         data_version = excluded.data_version,
         provider = excluded.provider,
         payload_json = excluded.payload_json,
         fetched_at = excluded.fetched_at,
         updated_at = excluded.updated_at`,
    )
    .bind(
      review.tradeDate,
      review.dataVersion,
      review.provider,
      JSON.stringify(review),
      review.asOf,
      now,
      now,
    )
    .run();
}

export async function saveAlertEvents(
  db: D1Database,
  userId: string,
  events: AlertEvent[],
) {
  if (!events.length) return;
  const now = new Date().toISOString();
  await db.batch(
    events.map((event) =>
      db
        .prepare(
          `INSERT OR IGNORE INTO alert_events
           (id, user_id, dedupe_key, level, object_type, object_code, title,
            payload_json, data_time, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          userId,
          event.id,
          event.level,
          event.objectType,
          event.objectCode,
          event.title,
          JSON.stringify(event),
          event.dataTime,
          now,
          now,
        ),
    ),
  );
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
