import { integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const audit = {
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
};

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email"),
  displayName: text("display_name"),
  ...audit,
});

export const userSettings = sqliteTable("user_settings", {
  userId: text("user_id").primaryKey().references(() => users.id),
  settingsJson: text("settings_json").notNull(),
  ...audit,
});

export const watchGroups = sqliteTable("watch_groups", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  ...audit,
});

export const watchItems = sqliteTable(
  "watch_items",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    groupId: text("group_id"),
    objectType: text("object_type").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    tag: text("tag").notNull(),
    costPrice: real("cost_price"),
    ...audit,
  },
  (table) => [
    uniqueIndex("watch_items_user_object_code").on(
      table.userId,
      table.objectType,
      table.code,
    ),
  ],
);

export const sectorMappings = sqliteTable("sector_mappings", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  inputName: text("input_name").notNull(),
  provider: text("provider").notNull(),
  classification: text("classification").notNull(),
  sectorCode: text("sector_code").notNull(),
  sectorName: text("sector_name").notNull(),
  memberCount: integer("member_count").notNull(),
  confirmedAt: text("confirmed_at"),
  ...audit,
});

export const marketInstruments = sqliteTable("market_instruments", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  exchange: text("exchange").notNull(),
  board: text("board"),
  provider: text("provider").notNull(),
  rawVersion: text("raw_version"),
  ...audit,
});

export const tradingCalendar = sqliteTable("trading_calendar", {
  market: text("market").notNull(),
  tradeDate: text("trade_date").notNull(),
  isOpen: integer("is_open", { mode: "boolean" }).notNull(),
  source: text("source").notNull(),
  checkedAt: text("checked_at").notNull(),
}, (table) => [uniqueIndex("trading_calendar_market_date").on(table.market, table.tradeDate)]);

export const quoteSnapshots = sqliteTable("quote_snapshots", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  scope: text("scope").notNull(),
  dataTime: text("data_time").notNull(),
  payloadJson: text("payload_json").notNull(),
  isFresh: integer("is_fresh", { mode: "boolean" }).notNull(),
  ...audit,
});

export const alertRules = sqliteTable("alert_rules", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  ruleType: text("rule_type").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull(),
  paramsJson: text("params_json").notNull(),
  ...audit,
});

export const alertEvents = sqliteTable("alert_events", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  dedupeKey: text("dedupe_key").notNull().unique(),
  level: text("level").notNull(),
  objectType: text("object_type").notNull(),
  objectCode: text("object_code").notNull(),
  title: text("title").notNull(),
  payloadJson: text("payload_json").notNull(),
  dataTime: text("data_time").notNull(),
  ...audit,
});

export const notificationDeliveries = sqliteTable("notification_deliveries", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  channel: text("channel").notNull(),
  status: text("status").notNull(),
  dedupeKey: text("dedupe_key").notNull().unique(),
  errorCode: text("error_code"),
  sentAt: text("sent_at"),
  payloadJson: text("payload_json").notNull(),
  ...audit,
});

export const scheduledJobRuns = sqliteTable("scheduled_job_runs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  jobType: text("job_type").notNull(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  triggerJson: text("trigger_json").notNull(),
  status: text("status").notNull(),
  attempt: integer("attempt").notNull(),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
  durationMs: integer("duration_ms"),
  errorCode: text("error_code"),
});

export const jobLeases = sqliteTable("job_leases", {
  leaseKey: text("lease_key").primaryKey(),
  owner: text("owner").notNull(),
  leaseUntil: text("lease_until").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const dailyReviews = sqliteTable("daily_reviews", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  tradeDate: text("trade_date").notNull(),
  status: text("status").notNull(),
  dataReady: integer("data_ready", { mode: "boolean" }).notNull(),
  retryCount: integer("retry_count").notNull(),
  reportJson: text("report_json").notNull(),
  pushedAt: text("pushed_at"),
  ...audit,
}, (table) => [uniqueIndex("daily_reviews_user_trade_date").on(table.userId, table.tradeDate)]);

export const historicalReviewCache = sqliteTable(
  "historical_review_cache",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    tradeDate: text("trade_date").notNull(),
    scopeKey: text("scope_key").notNull(),
    provider: text("provider").notNull(),
    status: text("status").notNull(),
    payloadJson: text("payload_json").notNull(),
    fetchedAt: text("fetched_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    ...audit,
  },
  (table) => [
    uniqueIndex("historical_review_cache_user_date_scope").on(
      table.userId,
      table.tradeDate,
      table.scopeKey,
    ),
  ],
);

export const providerHealth = sqliteTable("provider_health", {
  providerType: text("provider_type").notNull(),
  providerName: text("provider_name").notNull(),
  status: text("status").notNull(),
  message: text("message").notNull(),
  checkedAt: text("checked_at").notNull(),
}, (table) => [uniqueIndex("provider_health_type_name").on(table.providerType, table.providerName)]);

export const costQuotes = sqliteTable("cost_quotes", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  item: text("item").notNull(),
  currency: text("currency").notNull(),
  monthlyPrice: real("monthly_price"),
  annualPrice: real("annual_price"),
  sourceUrl: text("source_url").notNull(),
  checkedAt: text("checked_at").notNull(),
});

export const costEstimates = sqliteTable("cost_estimates", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  scenario: text("scenario").notNull(),
  assumptionsJson: text("assumptions_json").notNull(),
  monthlyTotal: real("monthly_total").notNull(),
  annualTotal: real("annual_total").notNull(),
  currency: text("currency").notNull(),
  ...audit,
});
