import type { AlertEvent, IndexQuote } from "./domain";
import { fetchExperimentalRealSnapshot } from "./market";
import { fetchSinaIndustryPerformance } from "./sina-sector-performance";
import { fetchSinaConceptPerformance } from "./sina-concept-performance";
import { fetchPreviousTradingDayTurnover } from "./eastmoney-turnover";

const PROVIDER = "腾讯公开行情 + 新浪财经板块排行 + 东方财富历史日线（真实数据·实验源）";
const SOURCE_URL = "https://gu.qq.com/";

export type ExchangeCloseStats = {
  exchange: "SH" | "SZ";
  tradeDate: string;
  asOf: string;
  turnoverYuan: number;
  up: number;
  down: number;
  flat: number;
  listed: number;
};

export type MarketDailyReview = {
  tradeDate: string;
  asOf: string;
  dataVersion: string;
  provider: string;
  sourceUrl: string;
  indices: IndexQuote[];
  turnover: {
    shanghaiYuan: number;
    shenzhenYuan: number;
    totalYuan: number;
    previousTradeDate: string | null;
    previousTotalYuan: number | null;
    changeYuan: number | null;
    changePct: number | null;
  };
  breadth: { up: number; down: number; flat: number; total: number };
  limits: {
    limitUp: number | null;
    limitDown: number | null;
    openedLimit: number | null;
    openedLimitRate: number | null;
    unavailableReason: string | null;
  };
  strongestIndustries: Array<{
    name: string;
    changePct: number;
    turnoverYuan: number;
    coreStock: string;
    limitUp: number | null;
    sourceNode: string;
  }>;
  strongestConcepts: Array<{
    name: string;
    changePct: number;
    turnoverYuan: number;
    coreStock: string;
    limitUp: number | null;
    sourceNode: string;
  }>;
  lossDirections: Array<{
    name: string;
    changePct: number;
    coreStock: string;
    finalState: string;
  }>;
  summary: {
    headline: string;
    facts: string[];
    tomorrowChecks: string[];
  };
};

function quoteTimeToIso(value: string) {
  if (!/^\d{14}$/.test(value)) throw new Error("市场统计时间格式不正确");
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(8, 10)}:${value.slice(10, 12)}:${value.slice(12, 14)}+08:00`;
}

export function parseTencentExchangeCloseResponse(
  raw: string,
  providerCode: "sh000001" | "sz399001",
): ExchangeCloseStats {
  const parsed = JSON.parse(raw) as {
    data?: Record<string, { qt?: Record<string, string[]> }>;
  };
  const node = parsed.data?.[providerCode];
  const quote = node?.qt?.[providerCode];
  const rank = node?.qt?.zhishu;
  if (!quote || !rank) throw new Error("市场统计字段缺失");

  const turnoverWanYuan = Number(quote[37]);
  const up = Number(rank[2]);
  const flat = Number(rank[3]);
  const down = Number(rank[4]);
  const listed = Number(rank[5]);
  if (
    !Number.isFinite(turnoverWanYuan) ||
    !Number.isInteger(up) ||
    !Number.isInteger(flat) ||
    !Number.isInteger(down) ||
    !Number.isInteger(listed) ||
    up + flat + down !== listed
  ) {
    throw new Error("市场统计数值不完整");
  }
  const asOf = quoteTimeToIso(quote[30] ?? "");
  return {
    exchange: providerCode.startsWith("sh") ? "SH" : "SZ",
    tradeDate: asOf.slice(0, 10),
    asOf,
    turnoverYuan: turnoverWanYuan * 10_000,
    up,
    flat,
    down,
    listed,
  };
}

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

async function fetchExchangeCloseStats(
  code: "sh000001" | "sz399001",
  tradeDate: string,
  fetcher: typeof fetch,
) {
  const start = shiftDate(tradeDate, -12);
  const response = await fetcher(
    `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${code},day,${start},${tradeDate},12,qfq`,
    {
      headers: {
        Accept: "application/json,text/plain,*/*",
        "User-Agent": "Aria-Market-Watch/0.1 private-evaluation",
      },
      signal: AbortSignal.timeout(7_000),
    },
  );
  if (!response.ok) throw new Error(`市场统计源返回 ${response.status}`);
  return parseTencentExchangeCloseResponse(await response.text(), code);
}

function yi(value: number) {
  return `${(value / 100_000_000).toFixed(0)} 亿元`;
}

export async function buildMarketDailyReview(
  previous: MarketDailyReview | null,
  fetcher: typeof fetch = fetch,
): Promise<MarketDailyReview> {
  const snapshot = await fetchExperimentalRealSnapshot(fetcher);
  const tradeDate = snapshot.asOf.slice(0, 10);
  const [shanghai, shenzhen, industries, concepts] = await Promise.all([
    fetchExchangeCloseStats("sh000001", tradeDate, fetcher),
    fetchExchangeCloseStats("sz399001", tradeDate, fetcher),
    fetchSinaIndustryPerformance(fetcher),
    fetchSinaConceptPerformance(fetcher),
  ]);
  if (shanghai.tradeDate !== tradeDate || shenzhen.tradeDate !== tradeDate) {
    throw new Error("指数与市场统计的交易日期不一致");
  }
  const totalYuan = shanghai.turnoverYuan + shenzhen.turnoverYuan;
  const comparablePrevious = previous?.tradeDate < tradeDate ? previous : null;
  let historicalPrevious: Awaited<ReturnType<typeof fetchPreviousTradingDayTurnover>> | null = null;
  try {
    historicalPrevious = await fetchPreviousTradingDayTurnover(tradeDate, fetcher);
  } catch {
    // 历史源不可用时保留缓存比较；两者都没有则明确显示暂无数据。
  }
  const previousTradeDate = historicalPrevious?.tradeDate ?? comparablePrevious?.tradeDate ?? null;
  const previousTotalYuan = historicalPrevious?.totalYuan ?? comparablePrevious?.turnover.totalYuan ?? null;
  const changeYuan = previousTotalYuan === null ? null : totalYuan - previousTotalYuan;
  const changePct =
    previousTotalYuan && changeYuan !== null
      ? (changeYuan / previousTotalYuan) * 100
      : null;
  const breadth = {
    up: shanghai.up + shenzhen.up,
    down: shanghai.down + shenzhen.down,
    flat: shanghai.flat + shenzhen.flat,
    total: shanghai.listed + shenzhen.listed,
  };
  const risingRate = breadth.total ? (breadth.up / breadth.total) * 100 : 0;
  const temperature = risingRate >= 65 ? "多数股票上涨" : risingRate <= 35 ? "多数股票下跌" : "涨跌分布相对均衡";
  const strongestIndex = [...snapshot.indices].sort(
    (left, right) => right.changePct - left.changePct,
  )[0];
  const weakestIndex = [...snapshot.indices].sort(
    (left, right) => left.changePct - right.changePct,
  )[0];
  const comparison =
    changePct === null
      ? "前一交易日同口径成交额尚无已缓存真实记录"
      : `较 ${previousTradeDate} ${changePct >= 0 ? "增加" : "减少"} ${yi(Math.abs(changeYuan ?? 0))}（${Math.abs(changePct).toFixed(2)}%）`;
  const strongestIndustries = [...industries]
    .sort((left, right) => right.changePct - left.changePct)
    .slice(0, 3)
    .map((item) => ({
      name: item.name,
      changePct: item.changePct,
      turnoverYuan: item.turnoverYuan,
      coreStock: `${item.coreStock}（${item.coreStockChangePct >= 0 ? "+" : ""}${item.coreStockChangePct.toFixed(2)}%）`,
      limitUp: null,
      sourceNode: item.code.replace(/^SINA:/, ""),
    }));
  const strongestConcepts = [...concepts]
    .sort((left, right) => right.changePct - left.changePct)
    .slice(0, 3)
    .map((item) => ({
      name: item.name,
      changePct: item.changePct,
      turnoverYuan: item.turnoverYuan,
      coreStock: `${item.coreStock}（${item.coreStockChangePct >= 0 ? "+" : ""}${item.coreStockChangePct.toFixed(2)}%）`,
      limitUp: null,
      sourceNode: item.code.replace(/^SINA:/, ""),
    }));
  const lossDirections = [...industries]
    .sort((left, right) => left.changePct - right.changePct)
    .slice(0, 3)
    .map((item) => ({
      name: item.name,
      changePct: item.changePct,
      coreStock: item.weakestStock,
      finalState: `收盘 ${item.weakestStockChangePct >= 0 ? "+" : ""}${item.weakestStockChangePct.toFixed(2)}%`,
    }));

  return {
    tradeDate,
    asOf: [snapshot.asOf, shanghai.asOf, shenzhen.asOf].sort().at(-1) as string,
    dataVersion: `tencent-market-close:${tradeDate}:${snapshot.asOf}`,
    provider: PROVIDER,
    sourceUrl: SOURCE_URL,
    indices: snapshot.indices,
    turnover: {
      shanghaiYuan: shanghai.turnoverYuan,
      shenzhenYuan: shenzhen.turnoverYuan,
      totalYuan,
      previousTradeDate,
      previousTotalYuan,
      changeYuan,
      changePct,
    },
    breadth,
    limits: {
      limitUp: null,
      limitDown: null,
      openedLimit: null,
      openedLimitRate: null,
      unavailableReason: "当前汇总响应没有逐只股票的当日涨跌停价；未按固定百分比推算。",
    },
    strongestIndustries,
    strongestConcepts,
    lossDirections,
    summary: {
      headline: `${tradeDate} 六大指数中 ${strongestIndex.name}相对较强（${strongestIndex.changePct >= 0 ? "+" : ""}${strongestIndex.changePct.toFixed(2)}%），${temperature}；沪深成交 ${yi(totalYuan)}，${comparison}；行业主线为 ${strongestIndustries[0]?.name ?? "没有数据"}，概念方向为 ${strongestConcepts[0]?.name ?? "没有数据"}，对应核心股 ${strongestIndustries[0]?.coreStock ?? "没有数据"}、${strongestConcepts[0]?.coreStock ?? "没有数据"}；主要承压方向为 ${lossDirections[0]?.name ?? "没有数据"}，其中 ${lossDirections[0]?.coreStock ?? "没有数据"}${lossDirections[0] ? ` ${lossDirections[0].finalState}` : ""}；尾盘分钟轨迹暂无可验证数据，下一交易日继续核验成交额、上涨家数占比与主线核心股是否同向，不构成买卖建议。`,
      facts: [
        `上涨 ${breadth.up} 家、下跌 ${breadth.down} 家、平盘 ${breadth.flat} 家，统计范围共 ${breadth.total} 家。`,
        `六大指数中相对较弱的是 ${weakestIndex.name}（${weakestIndex.changePct >= 0 ? "+" : ""}${weakestIndex.changePct.toFixed(2)}%）。`,
        `申万一级行业成分股等权平均中相对较强的是 ${strongestIndustries[0]?.name ?? "没有数据"}；该口径不是行业指数涨幅。`,
        `相对较弱的行业方向是 ${lossDirections[0]?.name ?? "没有数据"}；只描述真实收盘数据，不推测原因。`,
        `真实概念排行中相对较强的是 ${strongestConcepts[0]?.name ?? "没有数据"}，核心股为 ${strongestConcepts[0]?.coreStock ?? "没有数据"}。`,
        "尾盘分钟轨迹当前没有稳定的真实历史字段，因此不推测尾盘强弱。",
        "涨跌停和炸板数据只有在逐只股票的真实当日限价字段完整后才加入总结。",
      ],
      tomorrowChecks: [
        "下一交易日继续比较同口径沪深成交额是否放大或缩小。",
        "继续观察上涨家数占比与主要指数方向是否一致。",
        `继续观察 ${strongestIndustries[0]?.name ?? "行业排行"} 的成分股表现是否延续；这是观察条件，不是操作建议。`,
        `继续核验 ${strongestConcepts[0]?.name ?? "概念排行"} 与其核心股能否保持同向；不构成买卖建议。`,
      ],
    },
  };
}

export function alertsFromMarketDailyReview(
  review: MarketDailyReview,
  downRatioThreshold = 60,
): AlertEvent[] {
  const events: AlertEvent[] = [];
  const downRatio = review.breadth.total
    ? (review.breadth.down / review.breadth.total) * 100
    : 0;
  if (downRatio >= downRatioThreshold) {
    events.push({
      id: `daily:${review.tradeDate}:market-breadth-down`,
      objectType: "market",
      objectCode: "ALL-A",
      objectName: "A 股全市场",
      eventType: "daily_market_breadth_down",
      title: `${review.tradeDate} 下跌股票占比较高`,
      currentValue: `${downRatio.toFixed(1)}%（${review.breadth.down} 家）`,
      threshold: `≥ ${downRatioThreshold}%`,
      reason: "真实收盘统计中的下跌家数占比达到用户配置阈值，记录到每日风险历史。",
      level: downRatio >= 75 ? "danger" : "warning",
      dataTime: review.asOf,
      provider: review.provider,
    });
  }
  for (const index of review.indices.filter((item) => item.changePct <= -3)) {
    events.push({
      id: `daily:${review.tradeDate}:index-drop:${index.code}`,
      objectType: "market",
      objectCode: index.code,
      objectName: index.name,
      eventType: "daily_index_drop",
      title: `${index.name}收盘跌幅较大`,
      currentValue: `${index.changePct.toFixed(2)}%`,
      threshold: "≤ -3.00%",
      reason: "六大指数真实收盘涨跌幅达到历史预警记录阈值。",
      level: index.changePct <= -5 ? "danger" : "warning",
      dataTime: review.asOf,
      provider: review.provider,
    });
  }
  if (review.limits.limitDown !== null && review.limits.limitDown >= 50) {
    events.push({
      id: `daily:${review.tradeDate}:limit-down-surge`,
      objectType: "market",
      objectCode: "ALL-A",
      objectName: "A 股全市场",
      eventType: "daily_limit_down_surge",
      title: `${review.tradeDate} 跌停股票数量较多`,
      currentValue: `${review.limits.limitDown} 家`,
      threshold: "≥ 50 家",
      reason: "使用数据源逐只返回的当日跌停价与真实收盘价核对，未使用固定涨跌幅推算。",
      level: review.limits.limitDown >= 80 ? "danger" : "warning",
      dataTime: review.asOf,
      provider: review.provider,
    });
  }
  return events;
}
