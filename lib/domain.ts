export const SHANGHAI_TIME_ZONE = "Asia/Shanghai";

export type PushMode = "event_only" | "interval_digest" | "both";
export type RiskLevel = "notice" | "warning" | "danger";
export type SessionCode =
  | "non_trading_day"
  | "before_open"
  | "morning"
  | "lunch_break"
  | "afternoon"
  | "closed";

export interface UserSettings {
  periodic_monitoring_enabled: boolean;
  monitor_interval_minutes: 5 | 30 | 60 | 120 | 180;
  periodic_push_mode: PushMode;
  key_moment_monitoring_enabled: boolean;
  key_moments: string[];
  daily_review_enabled: boolean;
  quick_review_time: string;
  full_review_time: string;
  stock_drop_threshold: number;
  fast_drop_threshold: number;
  market_down_ratio_threshold: number;
  notification_channel: "simulation" | "browser" | "serverchan" | "email";
}

export interface IndexQuote {
  code: string;
  name: string;
  value: number;
  changePct: number;
}

export interface SectorQuote {
  code: string;
  name: string;
  source: string;
  memberCount: number;
  changePct: number;
  up: number;
  down: number;
  flat: number;
}

export interface StockQuote {
  code: string;
  name: string;
  sector: string;
  current: number;
  prevClose: number;
  open: number;
  changePct: number;
  change5mPct: number;
  volumeRatio: number;
  limitUp: number;
  limitDown: number;
  limitState?: "near_down" | "sealed_down" | "opened_down" | "normal";
  suspended?: boolean;
  riskWarning?: boolean;
}

export interface MarketSnapshot {
  fixtureId: string;
  dataMode?: "mock" | "experimental_real";
  coverage?: "full" | "indices_only";
  asOf: string;
  provider: string;
  sourceUrl?: string;
  delayedMinutes: number;
  dataComplete: boolean;
  indices: IndexQuote[];
  breadth: {
    up: number;
    down: number;
    flat: number;
    limitUp: number;
    limitDown: number;
  };
  sectors: SectorQuote[];
  stocks: StockQuote[];
}

export interface AlertEvent {
  id: string;
  objectType: "market" | "sector" | "stock" | "system";
  objectCode: string;
  objectName: string;
  eventType: string;
  title: string;
  currentValue: string;
  threshold: string;
  reason: string;
  level: RiskLevel;
  dataTime: string;
  provider: string;
}

export interface DailyReview {
  tradeDate: string;
  generatedAt: string;
  conclusion: string;
  facts: string[];
  possibleExplanations: string[];
  unknowns: string[];
  nextWatch: string[];
  integrity: string;
  modelStatus: "not_used" | "success" | "degraded";
}

export interface SessionState {
  code: SessionCode;
  isTradingDay: boolean;
  isOpen: boolean;
  label: string;
  reason: string;
  date: string;
  time: string;
}

export interface DueBundle {
  due: boolean;
  triggers: Array<"periodic" | "key_moment" | "quick_review" | "daily_review">;
  merged: boolean;
  skipReason?: string;
}

export interface MarketAdapter {
  getTradingCalendar(start: string, end: string): Promise<string[]>;
  getMarketSessionState(now: Date): Promise<SessionState>;
  getInstrumentList(): Promise<Array<{ code: string; name: string }>>;
  resolveSector(input: string): Promise<SectorQuote[]>;
  getSectorMembers(code: string): Promise<string[]>;
  getRealtimeQuotes(codes?: string[]): Promise<StockQuote[]>;
  getMajorIndices(): Promise<IndexQuote[]>;
  getDailyLimitPrices(codes: string[]): Promise<Record<string, { up: number; down: number }>>;
  getEndOfDayData(date: string): Promise<MarketSnapshot>;
  getAnnouncementsOrVerifiedNews(): Promise<Array<{ title: string; url: string; publishedAt: string }>>;
  getProviderHealth(): Promise<{ ok: boolean; message: string; checkedAt: string }>;
}

export interface LLMProvider {
  name: string;
  generateReview(snapshot: MarketSnapshot, deterministic: DailyReview): Promise<DailyReview>;
  health(): Promise<{ ok: boolean; message: string }>;
}

export const DEFAULT_SETTINGS: UserSettings = {
  periodic_monitoring_enabled: true,
  monitor_interval_minutes: 5,
  periodic_push_mode: "event_only",
  key_moment_monitoring_enabled: true,
  key_moments: ["09:35", "11:20", "13:05", "14:30", "14:50"],
  daily_review_enabled: true,
  quick_review_time: "15:10",
  full_review_time: "16:30",
  stock_drop_threshold: -5,
  fast_drop_threshold: -2,
  market_down_ratio_threshold: 65,
  notification_channel: "simulation",
};

const HOLIDAYS_2026 = new Set([
  "2026-01-01",
  "2026-01-02",
  "2026-02-16",
  "2026-02-17",
  "2026-02-18",
  "2026-02-19",
  "2026-02-20",
  "2026-02-23",
  "2026-04-06",
  "2026-05-01",
  "2026-05-04",
  "2026-05-05",
  "2026-06-19",
  "2026-09-25",
  "2026-10-01",
  "2026-10-02",
  "2026-10-05",
  "2026-10-06",
  "2026-10-07",
]);

export function shanghaiParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHANGHAI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${read("year")}-${read("month")}-${read("day")}`,
    time: `${read("hour")}:${read("minute")}`,
    hour: Number(read("hour")),
    minute: Number(read("minute")),
    weekday: read("weekday"),
  };
}

export function getMarketSessionState(date: Date): SessionState {
  const part = shanghaiParts(date);
  const isWeekend = part.weekday === "Sat" || part.weekday === "Sun";
  const isHoliday = HOLIDAYS_2026.has(part.date);
  if (isWeekend || isHoliday) {
    return {
      code: "non_trading_day",
      isTradingDay: false,
      isOpen: false,
      label: "今日休市",
      reason: isWeekend ? "周末休市，不请求行情" : "交易所公告节假日休市，不请求行情",
      date: part.date,
      time: part.time,
    };
  }

  const minute = part.hour * 60 + part.minute;
  if (minute < 570) {
    return {
      code: "before_open",
      isTradingDay: true,
      isOpen: false,
      label: "尚未开盘",
      reason: "09:30 开盘前，不执行盘中扫描",
      date: part.date,
      time: part.time,
    };
  }
  if (minute < 690) {
    return {
      code: "morning",
      isTradingDay: true,
      isOpen: true,
      label: "上午交易中",
      reason: "当前处于 09:30–11:30 有效交易时段",
      date: part.date,
      time: part.time,
    };
  }
  if (minute < 780) {
    return {
      code: "lunch_break",
      isTradingDay: true,
      isOpen: false,
      label: "午间休市",
      reason: "11:30–13:00 午间休市，不请求行情",
      date: part.date,
      time: part.time,
    };
  }
  if (minute < 900) {
    return {
      code: "afternoon",
      isTradingDay: true,
      isOpen: true,
      label: "下午交易中",
      reason: "当前处于 13:00–15:00 有效交易时段",
      date: part.date,
      time: part.time,
    };
  }
  return {
    code: "closed",
    isTradingDay: true,
    isOpen: false,
    label: "今日已收盘",
    reason: "15:00 后不再执行盘中扫描",
    date: part.date,
    time: part.time,
  };
}

export function getDueBundle(
  now: Date,
  settings: UserSettings,
  lastPeriodicAt?: string,
): DueBundle {
  const session = getMarketSessionState(now);
  const part = shanghaiParts(now);
  const triggers: DueBundle["triggers"] = [];

  if (session.isOpen && settings.periodic_monitoring_enabled) {
    const last = lastPeriodicAt ? new Date(lastPeriodicAt) : null;
    const elapsed = last ? now.getTime() - last.getTime() : Number.POSITIVE_INFINITY;
    if (elapsed >= settings.monitor_interval_minutes * 60_000) triggers.push("periodic");
  }
  if (
    session.isOpen &&
    settings.key_moment_monitoring_enabled &&
    settings.key_moments.includes(part.time)
  ) {
    triggers.push("key_moment");
  }
  if (session.isTradingDay && settings.daily_review_enabled && part.time === settings.quick_review_time) {
    triggers.push("quick_review");
  }
  if (session.isTradingDay && settings.daily_review_enabled && part.time === settings.full_review_time) {
    triggers.push("daily_review");
  }

  if (triggers.length === 0) {
    return {
      due: false,
      triggers,
      merged: false,
      skipReason: session.isOpen ? "尚未到达下一次任务时间" : session.reason,
    };
  }
  return { due: true, triggers, merged: triggers.length > 1 };
}

function stableId(parts: string[]) {
  let hash = 2166136261;
  for (const char of parts.join("|")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `evt_${(hash >>> 0).toString(16)}`;
}

function alert(
  snapshot: MarketSnapshot,
  input: Omit<AlertEvent, "id" | "dataTime" | "provider">,
): AlertEvent {
  return {
    ...input,
    id: stableId([snapshot.asOf, input.objectCode, input.eventType]),
    dataTime: snapshot.asOf,
    provider: snapshot.provider,
  };
}

export function evaluateRules(
  snapshot: MarketSnapshot,
  settings: UserSettings = DEFAULT_SETTINGS,
): AlertEvent[] {
  if (!snapshot.dataComplete) {
    return [
      alert(snapshot, {
        objectType: "system",
        objectCode: "market-provider",
        objectName: "行情源",
        eventType: "stale_or_incomplete",
        title: "行情数据不完整",
        currentValue: `延迟 ${snapshot.delayedMinutes} 分钟`,
        threshold: "允许延迟 ≤ 3 分钟",
        reason: "数据超过新鲜度上限，已停止生成正常行情结论",
        level: "danger",
      }),
    ];
  }

  if (snapshot.coverage === "indices_only") return [];

  const events: AlertEvent[] = [];
  const listed = snapshot.breadth.up + snapshot.breadth.down + snapshot.breadth.flat;
  const downRatio = listed === 0 ? 0 : (snapshot.breadth.down / listed) * 100;
  if (downRatio >= settings.market_down_ratio_threshold) {
    events.push(
      alert(snapshot, {
        objectType: "market",
        objectCode: "ALL-A",
        objectName: "A 股全市场",
        eventType: "market_breadth_down",
        title: "全市场下跌比例明显上升",
        currentValue: `${downRatio.toFixed(1)}%（${snapshot.breadth.down} 家）`,
        threshold: `≥ ${settings.market_down_ratio_threshold}%`,
        reason: "下跌股票占比达到小白默认风险阈值，请检查市场整体风险",
        level: downRatio >= 75 ? "danger" : "warning",
      }),
    );
  }
  if (snapshot.breadth.limitDown >= 50) {
    events.push(
      alert(snapshot, {
        objectType: "market",
        objectCode: "ALL-A",
        objectName: "A 股全市场",
        eventType: "limit_down_surge",
        title: "跌停数量显著上升",
        currentValue: `${snapshot.breadth.limitDown} 家`,
        threshold: "≥ 50 家",
        reason: "跌停家数快速增加，代表极端下跌个股变多",
        level: snapshot.breadth.limitDown >= 80 ? "danger" : "warning",
      }),
    );
  }

  for (const sector of snapshot.sectors) {
    const total = sector.up + sector.down + sector.flat;
    const ratio = total === 0 ? 0 : (sector.down / total) * 100;
    if (sector.changePct <= -2 || ratio >= 70) {
      events.push(
        alert(snapshot, {
          objectType: "sector",
          objectCode: sector.code,
          objectName: sector.name,
          eventType: "sector_weakness",
          title: `${sector.name}板块风险上升`,
          currentValue: `${sector.changePct.toFixed(2)}%，${ratio.toFixed(0)}% 成分股下跌`,
          threshold: "板块 ≤ -2% 或下跌占比 ≥ 70%",
          reason: "板块整体走弱且多数成分股同步下跌",
          level: sector.changePct <= -3 ? "danger" : "warning",
        }),
      );
    }
  }

  for (const quote of snapshot.stocks) {
    const sector = snapshot.sectors.find((item) => item.name === quote.sector);
    if (quote.suspended) {
      events.push(
        alert(snapshot, {
          objectType: "stock",
          objectCode: quote.code,
          objectName: quote.name,
          eventType: "suspended",
          title: `${quote.name}处于停牌状态`,
          currentValue: "停牌",
          threshold: "状态变化",
          reason: "当前没有连续竞价价格，不参与涨跌规则计算",
          level: "notice",
        }),
      );
      continue;
    }
    if (quote.changePct <= settings.stock_drop_threshold) {
      events.push(
        alert(snapshot, {
          objectType: "stock",
          objectCode: quote.code,
          objectName: quote.name,
          eventType: "stock_drop",
          title: `${quote.name}跌幅达到提醒线`,
          currentValue: `${quote.changePct.toFixed(2)}%`,
          threshold: `≤ ${settings.stock_drop_threshold}%`,
          reason: "当前跌幅达到用户配置阈值，不代表买卖建议",
          level: quote.changePct <= -8 ? "danger" : "warning",
        }),
      );
    }
    if (quote.limitState && quote.limitState !== "normal") {
      const stateText = {
        near_down: "接近跌停",
        sealed_down: "封住跌停",
        opened_down: "打开跌停",
      }[quote.limitState];
      events.push(
        alert(snapshot, {
          objectType: "stock",
          objectCode: quote.code,
          objectName: quote.name,
          eventType: quote.limitState,
          title: `${quote.name}${stateText}`,
          currentValue: `${quote.current.toFixed(2)} 元`,
          threshold: `数据源当日跌停价 ${quote.limitDown.toFixed(2)} 元`,
          reason: "涨跌停价直接使用行情源字段，不按固定 ±10% 推算",
          level: quote.limitState === "sealed_down" ? "danger" : "warning",
        }),
      );
    }
    const gapPct = ((quote.open - quote.prevClose) / quote.prevClose) * 100;
    if (gapPct <= -3) {
      events.push(
        alert(snapshot, {
          objectType: "stock",
          objectCode: quote.code,
          objectName: quote.name,
          eventType: "gap_down",
          title: `${quote.name}明显低开`,
          currentValue: `${gapPct.toFixed(2)}%`,
          threshold: "开盘缺口 ≤ -3%",
          reason: "开盘价相对昨收出现明显向下缺口",
          level: "warning",
        }),
      );
    }
    if (quote.change5mPct <= settings.fast_drop_threshold) {
      events.push(
        alert(snapshot, {
          objectType: "stock",
          objectCode: quote.code,
          objectName: quote.name,
          eventType: "fast_drop",
          title: `${quote.name}短周期急跌`,
          currentValue: `5 分钟 ${quote.change5mPct.toFixed(2)}%`,
          threshold: `≤ ${settings.fast_drop_threshold}%`,
          reason: "由连续两次快照计算，未调用大模型",
          level: quote.change5mPct <= -3 ? "danger" : "warning",
        }),
      );
    }
    if (quote.volumeRatio >= 2.5 && Math.abs(quote.changePct) >= 2) {
      events.push(
        alert(snapshot, {
          objectType: "stock",
          objectCode: quote.code,
          objectName: quote.name,
          eventType: "abnormal_volume",
          title: `${quote.name}出现异常放量`,
          currentValue: `量比 ${quote.volumeRatio.toFixed(1)}`,
          threshold: "量比 ≥ 2.5 且涨跌幅绝对值 ≥ 2%",
          reason: "成交活跃度显著高于近期同时间水平",
          level: "warning",
        }),
      );
    }
    if (sector && quote.changePct - sector.changePct <= -2) {
      events.push(
        alert(snapshot, {
          objectType: "stock",
          objectCode: quote.code,
          objectName: quote.name,
          eventType: "relative_weakness",
          title: `${quote.name}明显弱于所属板块`,
          currentValue: `弱于板块 ${(sector.changePct - quote.changePct).toFixed(2)} 个百分点`,
          threshold: "相对弱势 ≥ 2 个百分点",
          reason: `个股 ${quote.changePct.toFixed(2)}%，${sector.name} ${sector.changePct.toFixed(2)}%`,
          level: "warning",
        }),
      );
    }
  }
  return events;
}

export function highestRisk(events: AlertEvent[]): RiskLevel {
  if (events.some((event) => event.level === "danger")) return "danger";
  if (events.some((event) => event.level === "warning")) return "warning";
  return "notice";
}

export function shouldPush(mode: PushMode, events: AlertEvent[]) {
  if (mode === "interval_digest" || mode === "both") return true;
  return events.length > 0;
}

export function generateDeterministicReview(snapshot: MarketSnapshot): DailyReview {
  if (snapshot.coverage === "indices_only") {
    const averageChange =
      snapshot.indices.reduce((total, index) => total + index.changePct, 0) /
      snapshot.indices.length;
    return {
      tradeDate: snapshot.asOf.slice(0, 10),
      generatedAt: snapshot.asOf,
      conclusion: `四个主要指数平均${averageChange >= 0 ? "上涨" : "下跌"} ${Math.abs(averageChange).toFixed(2)}%；当前真实数据仅覆盖指数，不能据此判断全市场风险。`,
      facts: snapshot.indices.map(
        (index) =>
          `${index.name} ${index.value.toFixed(2)}，${index.changePct >= 0 ? "+" : ""}${index.changePct.toFixed(2)}%。`,
      ),
      possibleExplanations: [
        "价格数据只能确认指数涨跌，不能单独证明政策、资金或新闻是变化原因。",
      ],
      unknowns: [
        "尚未接入有正式授权的全市场、板块、个股、涨跌停和已验证新闻数据。",
      ],
      nextWatch: [
        "下一交易日四个主要指数是否继续同向变化。",
        "接入正式全市场数据后再观察上涨、下跌和涨跌停数量。",
      ],
      integrity: `四个主要指数数据完整；来源 ${snapshot.provider}；数据时间 ${snapshot.asOf}；不包含市场宽度、板块和个股。`,
      modelStatus: "not_used",
    };
  }
  const events = evaluateRules(snapshot);
  const risk = highestRisk(events);
  const leadIndex = snapshot.indices[0];
  const sectorFacts = snapshot.sectors.map(
    (sector) =>
      `${sector.name} ${sector.changePct >= 0 ? "+" : ""}${sector.changePct.toFixed(2)}%，成分股 ${sector.up} 涨 / ${sector.down} 跌`,
  );
  return {
    tradeDate: snapshot.asOf.slice(0, 10),
    generatedAt: snapshot.asOf,
    conclusion:
      risk === "danger"
        ? "市场风险明显上升，跌停与弱势对象增多；请核对持有与关注对象，但本报告不提供买卖指令。"
        : risk === "warning"
          ? "盘面偏弱，部分板块和个股触发客观阈值；建议继续观察数据变化。"
          : "盘面未出现达到默认高风险阈值的异常。",
    facts: [
      `${leadIndex.name} ${leadIndex.changePct >= 0 ? "+" : ""}${leadIndex.changePct.toFixed(2)}%。`,
      `全市场 ${snapshot.breadth.up} 家上涨、${snapshot.breadth.down} 家下跌、${snapshot.breadth.flat} 家平盘，涨停 ${snapshot.breadth.limitUp} 家、跌停 ${snapshot.breadth.limitDown} 家。`,
      ...sectorFacts,
      `自选对象共触发 ${events.filter((event) => event.objectType === "stock").length} 条风险事件。`,
    ],
    possibleExplanations: [
      "仅可说明价格、成交和市场宽度同步走弱；若要解释政策、资金或新闻，需要接入带时间和来源的可靠资讯。",
    ],
    unknowns: ["当前 Mock 数据未接入已验证新闻，无法确认价格变化的外部原因。"],
    nextWatch: [
      "下跌家数占比是否连续两个扫描周期高于 65%。",
      "跌停家数是否继续增加，已打开跌停的个股是否再次封住。",
      "关注板块相对沪深 300 的弱势差是否继续扩大。",
    ],
    integrity: snapshot.dataComplete
      ? `数据完整；来源 ${snapshot.provider}；数据时间 ${snapshot.asOf}。`
      : `数据不完整或过期；来源 ${snapshot.provider}；不生成正常结论。`,
    modelStatus: "not_used",
  };
}

const NORMAL_SNAPSHOT: MarketSnapshot = {
  fixtureId: "normal",
  dataMode: "mock",
  coverage: "full",
  asOf: "2026-07-17T14:30:00+08:00",
  provider: "Mock Fixture（未接入真实行情）",
  delayedMinutes: 0,
  dataComplete: true,
  indices: [
    { code: "000001.SH", name: "上证指数", value: 3548.21, changePct: 0.36 },
    { code: "399001.SZ", name: "深证成指", value: 10982.44, changePct: 0.51 },
    { code: "399006.SZ", name: "创业板指", value: 2296.18, changePct: 0.22 },
    { code: "000300.SH", name: "沪深 300", value: 3976.85, changePct: 0.41 },
  ],
  breadth: { up: 3042, down: 1978, flat: 201, limitUp: 52, limitDown: 9 },
  sectors: [
    { code: "SW-801050", name: "有色金属", source: "申万一级行业", memberCount: 134, changePct: 1.72, up: 92, down: 37, flat: 5 },
    { code: "SW-801120", name: "食品饮料", source: "申万一级行业", memberCount: 118, changePct: -0.54, up: 41, down: 72, flat: 5 },
  ],
  stocks: [
    { code: "601600.SH", name: "中国铝业", sector: "有色金属", current: 8.42, prevClose: 8.28, open: 8.3, changePct: 1.69, change5mPct: 0.2, volumeRatio: 1.3, limitUp: 9.11, limitDown: 7.45, limitState: "normal" },
    { code: "000858.SZ", name: "五粮液", sector: "食品饮料", current: 122.6, prevClose: 123.2, open: 122.9, changePct: -0.49, change5mPct: -0.12, volumeRatio: 0.9, limitUp: 135.52, limitDown: 110.88, limitState: "normal" },
  ],
};

const DROP_SNAPSHOT: MarketSnapshot = {
  ...NORMAL_SNAPSHOT,
  fixtureId: "market_drop",
  indices: [
    { code: "000001.SH", name: "上证指数", value: 3478.62, changePct: -2.18 },
    { code: "399001.SZ", name: "深证成指", value: 10621.19, changePct: -3.04 },
    { code: "399006.SZ", name: "创业板指", value: 2198.4, changePct: -3.86 },
    { code: "000300.SH", name: "沪深 300", value: 3861.22, changePct: -2.51 },
  ],
  breadth: { up: 648, down: 4489, flat: 84, limitUp: 21, limitDown: 87 },
  sectors: [
    { code: "SW-801050", name: "有色金属", source: "申万一级行业", memberCount: 134, changePct: -3.42, up: 16, down: 115, flat: 3 },
    { code: "SW-801120", name: "食品饮料", source: "申万一级行业", memberCount: 118, changePct: -2.31, up: 18, down: 96, flat: 4 },
  ],
  stocks: [
    { code: "601600.SH", name: "中国铝业", sector: "有色金属", current: 7.49, prevClose: 8.28, open: 7.98, changePct: -9.54, change5mPct: -2.84, volumeRatio: 3.6, limitUp: 9.11, limitDown: 7.45, limitState: "near_down" },
    { code: "000858.SZ", name: "五粮液", sector: "食品饮料", current: 116.1, prevClose: 123.2, open: 119.1, changePct: -5.76, change5mPct: -2.16, volumeRatio: 2.8, limitUp: 135.52, limitDown: 110.88, limitState: "normal" },
    { code: "300750.SZ", name: "宁德时代", sector: "电力设备", current: 228.4, prevClose: 238.5, open: 230.4, changePct: -4.23, change5mPct: -1.08, volumeRatio: 1.7, limitUp: 286.2, limitDown: 190.8, limitState: "normal" },
  ],
};

const LIMIT_SNAPSHOT: MarketSnapshot = {
  ...DROP_SNAPSHOT,
  fixtureId: "limit_wave",
  stocks: [
    { ...DROP_SNAPSHOT.stocks[0], current: 7.45, changePct: -10.02, limitState: "sealed_down" },
    { ...DROP_SNAPSHOT.stocks[1], current: 111.3, changePct: -9.66, change5mPct: 0.62, limitState: "opened_down" },
  ],
};

const FAILURE_SNAPSHOT: MarketSnapshot = {
  ...DROP_SNAPSHOT,
  fixtureId: "provider_failure",
  delayedMinutes: 18,
  dataComplete: false,
};

export const FIXTURES: Record<string, MarketSnapshot> = {
  normal: NORMAL_SNAPSHOT,
  market_drop: DROP_SNAPSHOT,
  limit_wave: LIMIT_SNAPSHOT,
  provider_failure: FAILURE_SNAPSHOT,
};

export function getFixture(id: string): MarketSnapshot {
  return structuredClone(FIXTURES[id] ?? DROP_SNAPSHOT);
}

export function scansPerTradingDay(interval: number) {
  return Math.ceil(240 / interval);
}

export function estimateStorageMb(
  interval: number,
  instruments: number,
  tradingDays = 22,
  bytesPerRow = 160,
) {
  return (scansPerTradingDay(interval) * tradingDays * instruments * bytesPerRow) / 1_000_000;
}

export function nextTaskLabel(settings: UserSettings, now = new Date()) {
  const session = getMarketSessionState(now);
  if (!session.isTradingDay) return "下一交易日 09:35 关键简报";
  if (session.code === "before_open") return "09:35 开盘后简报";
  if (session.code === "lunch_break") return "13:05 午后恢复简报";
  if (session.code === "closed") return settings.daily_review_enabled ? `${settings.full_review_time} 完整复盘` : "下一交易日";
  return `${settings.monitor_interval_minutes} 分钟内进行下一次扫描`;
}
