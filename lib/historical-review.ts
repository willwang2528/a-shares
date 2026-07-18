export type HistoricalStockMovement = {
  code: string;
  name: string;
  status: "available" | "no_data" | "error";
  message?: string;
  tradeDate?: string;
  previousTradeDate?: string;
  previousClose?: number;
  open?: number;
  close?: number;
  high?: number;
  low?: number;
  volume?: number;
  openGapPct?: number;
  intradayPct?: number;
  dayChangePct?: number;
};

export type HistoricalReviewSummary = {
  headline: string;
  facts: string[];
  observations: string[];
  unknowns: string[];
  nextChecks: string[];
};

export type HistoricalReviewResult = {
  tradeDate: string;
  status: "complete" | "partial" | "no_data";
  requestedStockCount: number;
  availableStockCount: number;
  provider: string;
  sourceUrl: string;
  priceAdjustment: string;
  fetchedAt: string;
  items: HistoricalStockMovement[];
  summary: HistoricalReviewSummary;
};

export type HistoricalReviewResponse = {
  historical: HistoricalReviewResult;
  cacheHit: boolean;
  cacheExpiresAt: string;
};

const PROVIDER = "腾讯公开行情页面接口（真实历史日线·实验源）";
const SOURCE_URL = "https://gu.qq.com/";

function providerCode(code: string) {
  const match = code.match(/^(\d{6})\.(SH|SZ|BJ)$/);
  if (!match) throw new Error(`股票代码格式不正确：${code}`);
  return `${match[2].toLowerCase()}${match[1]}`;
}

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function asNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function pct(numerator: number, denominator: number) {
  if (denominator === 0) return 0;
  return (numerator / denominator - 1) * 100;
}

export function parseTencentHistoricalResponse(
  raw: string,
  stock: { code: string; name: string },
  tradeDate: string,
): HistoricalStockMovement {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ...stock,
      status: "error",
      message: "历史行情返回格式无法读取。",
    };
  }

  const key = providerCode(stock.code);
  const root =
    typeof parsed === "object" && parsed !== null
      ? (parsed as { data?: Record<string, unknown> }).data
      : undefined;
  const node =
    root && typeof root[key] === "object" && root[key] !== null
      ? (root[key] as { qfqday?: unknown; day?: unknown })
      : undefined;
  const rawRows = Array.isArray(node?.qfqday)
    ? node.qfqday
    : Array.isArray(node?.day)
      ? node.day
      : [];
  const rows = rawRows.filter(
    (row): row is unknown[] => Array.isArray(row) && row.length >= 6,
  );
  const index = rows.findIndex((row) => row[0] === tradeDate);
  if (index < 0) {
    return {
      ...stock,
      status: "no_data",
      message: "数据源没有返回这一天的真实日线，可能是休市日、尚未上市或数据暂缺。",
    };
  }
  if (index === 0) {
    return {
      ...stock,
      status: "no_data",
      message: "找到了当日日线，但缺少上一交易日收盘基准，无法完成开盘前后对比。",
    };
  }

  const current = rows[index];
  const previous = rows[index - 1];
  const previousClose = asNumber(previous[2]);
  const open = asNumber(current[1]);
  const close = asNumber(current[2]);
  const high = asNumber(current[3]);
  const low = asNumber(current[4]);
  const volume = asNumber(current[5]);
  if (
    previousClose === null ||
    open === null ||
    close === null ||
    high === null ||
    low === null ||
    volume === null
  ) {
    return {
      ...stock,
      status: "error",
      message: "历史行情缺少价格字段，没有生成推测结果。",
    };
  }

  return {
    ...stock,
    status: "available",
    tradeDate,
    previousTradeDate: String(previous[0]),
    previousClose,
    open,
    close,
    high,
    low,
    volume,
    openGapPct: pct(open, previousClose),
    intradayPct: pct(close, open),
    dayChangePct: pct(close, previousClose),
  };
}

export async function fetchTencentHistoricalMovement(
  stock: { code: string; name: string },
  tradeDate: string,
  fetcher: typeof fetch = fetch,
) {
  const code = providerCode(stock.code);
  const start = shiftDate(tradeDate, -35);
  const url =
    "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get" +
    `?param=${code},day,${start},${tradeDate},40,qfq`;
  const response = await fetcher(url, {
    headers: {
      Accept: "application/json,text/plain,*/*",
      "User-Agent": "A-Share-Watch/0.1 private-evaluation",
    },
    signal: AbortSignal.timeout(6_000),
  });
  if (!response.ok) throw new Error(`历史行情源返回 ${response.status}`);
  return parseTencentHistoricalResponse(await response.text(), stock, tradeDate);
}

function fixed(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function summarizeHistoricalMovements(
  tradeDate: string,
  items: HistoricalStockMovement[],
): HistoricalReviewSummary {
  const available = items.filter(
    (item): item is HistoricalStockMovement & {
      dayChangePct: number;
      openGapPct: number;
      intradayPct: number;
    } =>
      item.status === "available" &&
      typeof item.dayChangePct === "number" &&
      typeof item.openGapPct === "number" &&
      typeof item.intradayPct === "number",
  );
  if (!available.length) {
    return {
      headline: `${tradeDate} 没有可用于复盘的真实股票日线数据。`,
      facts: ["所有对象都明确标记为“没有数据”或“读取失败”，没有使用 Mock 补位。"],
      observations: ["数据不足时不生成走势判断。"],
      unknowns: ["无法确认当天价格表现，也无法判断变化原因。"],
      nextChecks: ["检查所选日期是否为交易日，并确认关注列表中已有股票。"],
    };
  }

  const up = available.filter((item) => item.dayChangePct > 0.005).length;
  const down = available.filter((item) => item.dayChangePct < -0.005).length;
  const flat = available.length - up - down;
  const averageDay =
    available.reduce((sum, item) => sum + item.dayChangePct, 0) / available.length;
  const averageGap =
    available.reduce((sum, item) => sum + item.openGapPct, 0) / available.length;
  const averageIntraday =
    available.reduce((sum, item) => sum + item.intradayPct, 0) / available.length;
  const strongest = [...available].sort(
    (left, right) => right.dayChangePct - left.dayChangePct,
  )[0];
  const weakest = [...available].sort(
    (left, right) => left.dayChangePct - right.dayChangePct,
  )[0];

  const observations = [
    `开盘相对上一交易日收盘平均 ${fixed(averageGap)}；这只是价格缺口描述，不代表后续方向。`,
    `从开盘到收盘平均 ${fixed(averageIntraday)}；可用于观察开盘后走势是否延续，但不能据此给出买卖指令。`,
  ];
  if (Math.abs(averageGap) < 0.3) {
    observations.push("多数样本的平均开盘缺口较小，仍需逐只查看，不能把平均值当成每只股票的表现。");
  }

  return {
    headline: `${tradeDate} 共 ${available.length} 只股票有真实数据：${up} 只上涨、${down} 只下跌、${flat} 只基本持平。`,
    facts: [
      `样本全天平均变动 ${fixed(averageDay)}。`,
      `表现相对较强的是 ${strongest.name}（${fixed(strongest.dayChangePct)}），相对较弱的是 ${weakest.name}（${fixed(weakest.dayChangePct)}）。`,
      `开盘前基准统一使用上一交易日的前复权收盘价，开盘后使用当日 09:30 开盘价和收盘价。`,
    ],
    observations,
    unknowns: [
      "当前未接入公告、新闻和资金流等可靠历史原因数据，因此不推测上涨或下跌原因。",
      "公开历史源不提供可稳定回查的 09:25 集合竞价和完整分钟轨迹，本复盘不会把日线冒充分钟数据。",
    ],
    nextChecks: [
      "继续观察各股票开盘缺口与开盘后变动是否方向一致。",
      "继续观察相对较强或较弱对象是否只是单日现象。",
    ],
  };
}

export async function buildHistoricalReview(
  tradeDate: string,
  stocks: Array<{ code: string; name: string }>,
  fetcher: typeof fetch = fetch,
): Promise<HistoricalReviewResult> {
  const limitedStocks = stocks.slice(0, 20);
  const items: HistoricalStockMovement[] = [];
  for (let index = 0; index < limitedStocks.length; index += 5) {
    const batch = limitedStocks.slice(index, index + 5);
    const batchItems = await Promise.all(
      batch.map(async (stock) => {
        try {
          return await fetchTencentHistoricalMovement(stock, tradeDate, fetcher);
        } catch {
          return {
            ...stock,
            status: "error" as const,
            message: "真实历史行情读取失败，没有使用演示数据替代。",
          };
        }
      }),
    );
    items.push(...batchItems);
  }
  const availableStockCount = items.filter(
    (item) => item.status === "available",
  ).length;
  const status =
    availableStockCount === 0
      ? "no_data"
      : availableStockCount === limitedStocks.length
        ? "complete"
        : "partial";
  return {
    tradeDate,
    status,
    requestedStockCount: limitedStocks.length,
    availableStockCount,
    provider: PROVIDER,
    sourceUrl: SOURCE_URL,
    priceAdjustment: "前复权日线",
    fetchedAt: new Date().toISOString(),
    items,
    summary: summarizeHistoricalMovements(tradeDate, items),
  };
}

function shanghaiDate(now: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function historicalCacheExpiry(
  tradeDate: string,
  status: HistoricalReviewResult["status"],
  now = new Date(),
) {
  const today = shanghaiDate(now);
  const durationMs =
    status === "no_data"
      ? 60 * 60 * 1000
      : tradeDate === today
        ? 5 * 60 * 1000
        : 7 * 24 * 60 * 60 * 1000;
  return new Date(now.getTime() + durationMs).toISOString();
}

export function historicalScopeKey(stocks: Array<{ code: string }>) {
  return stocks
    .map((stock) => stock.code)
    .sort()
    .join("|");
}
