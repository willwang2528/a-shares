import { getMarketSessionState, type MarketSnapshot, type RiskLevel } from "./domain";
import type { StockQuote } from "./market";
import type { SectorPerformance } from "./sina-sector-performance";
import type { StoredWatchItem } from "./storage";

export type TodayBriefStatus = "available" | "no_watch" | "no_data" | "stale";
export type TodayBriefLayerId = "market" | "sector" | "stock";

export type TodayBriefLayer = {
  layer: TodayBriefLayerId;
  status: TodayBriefStatus;
  name: string;
  code: string | null;
  currentValue: string;
  changePct: number | null;
  comparisonBase: string;
  reason: string;
  level: RiskLevel | null;
  dataTime: string | null;
  dataTimeLabel: string;
  provider: string;
  sourceUrl: string;
  coverageText: string;
  detailPage: string;
};

export type TodayBrief = {
  mode: "manual_only";
  generatedAt: string;
  layers: {
    market: TodayBriefLayer;
    sector: TodayBriefLayer;
    stock: TodayBriefLayer;
  };
};

export type WatchedSectorResult = {
  watch: StoredWatchItem;
  performance: SectorPerformance | null;
};

const DETAIL_PAGES: Record<TodayBriefLayerId, string> = {
  market: "/",
  sector: "/?page=watch",
  stock: "/?page=watch",
};

function changeRisk(changePct: number, kind: TodayBriefLayerId): RiskLevel {
  if (kind === "sector") {
    if (changePct <= -3) return "danger";
    if (changePct <= -2) return "warning";
    return "notice";
  }
  if (kind === "stock") {
    if (changePct <= -5) return "danger";
    if (changePct <= -2) return "warning";
    return "notice";
  }
  if (changePct <= -5) return "danger";
  if (changePct <= -2) return "warning";
  return "notice";
}

function unavailableLayer(
  layer: TodayBriefLayerId,
  status: Exclude<TodayBriefStatus, "available">,
  input: Pick<TodayBriefLayer, "name" | "reason" | "coverageText"> &
    Partial<Pick<TodayBriefLayer, "dataTime" | "provider" | "sourceUrl">>,
): TodayBriefLayer {
  return {
    layer,
    status,
    name: input.name,
    code: null,
    currentValue: status === "stale" ? "数据已过期" : "没有数据",
    changePct: null,
    comparisonBase: "无法形成可靠比较",
    reason: input.reason,
    level: null,
    dataTime: input.dataTime ?? null,
    dataTimeLabel: "数据时间",
    provider: input.provider ?? "本层未取得可用真实数据",
    sourceUrl: input.sourceUrl ?? "",
    coverageText: input.coverageText,
    detailPage: DETAIL_PAGES[layer],
  };
}

export function chooseLargestIndex(snapshot: MarketSnapshot) {
  return [...snapshot.indices].sort(
    (left, right) =>
      Math.abs(right.changePct) - Math.abs(left.changePct) ||
      left.code.localeCompare(right.code),
  )[0] ?? null;
}

export function buildMarketBriefLayer(
  snapshot: MarketSnapshot | null,
): TodayBriefLayer {
  if (!snapshot) {
    return unavailableLayer("market", "no_data", {
      name: "市场整体",
      reason: "六个主要指数真实行情读取失败，本层不生成结论。",
      coverageText: "真实指数 0/6",
    });
  }
  if (!snapshot.dataComplete) {
    return unavailableLayer("market", "stale", {
      name: "市场整体",
      reason: "指数数据超过盘中新鲜度上限，本层停止生成正常结论。",
      coverageText: `真实指数 ${snapshot.indices.length}/6`,
      dataTime: snapshot.asOf,
      provider: snapshot.provider,
      sourceUrl: snapshot.sourceUrl,
    });
  }
  const selected = chooseLargestIndex(snapshot);
  if (!selected) {
    return unavailableLayer("market", "no_data", {
      name: "市场整体",
      reason: "真实行情源没有返回可比较的主要指数。",
      coverageText: "真实指数 0/6",
      dataTime: snapshot.asOf,
      provider: snapshot.provider,
      sourceUrl: snapshot.sourceUrl,
    });
  }
  return {
    layer: "market",
    status: "available",
    name: selected.name,
    code: selected.code,
    currentValue: `${selected.value.toLocaleString("zh-CN")} · ${selected.changePct > 0 ? "+" : ""}${selected.changePct.toFixed(2)}%`,
    changePct: selected.changePct,
    comparisonBase: "相对上一交易日收盘",
    reason: `六个主要指数中，${selected.name}的绝对涨跌幅最大；这里只陈述价格变化事实${snapshot.coverage === "indices_only" ? "，不代表全市场风险" : ""}。`,
    level:
      snapshot.coverage === "indices_only"
        ? null
        : changeRisk(selected.changePct, "market"),
    dataTime: snapshot.asOf,
    dataTimeLabel: "行情时间",
    provider: snapshot.provider,
    sourceUrl: snapshot.sourceUrl ?? "https://gu.qq.com/",
    coverageText: `真实指数 ${snapshot.indices.length}/6`,
    detailPage: DETAIL_PAGES.market,
  };
}

function riskOrder(level: RiskLevel) {
  return level === "danger" ? 3 : level === "warning" ? 2 : 1;
}

export function chooseWatchedStock(
  watches: StoredWatchItem[],
  quotes: StockQuote[],
) {
  const order = new Map(watches.map((watch, index) => [watch.code, index]));
  const byCode = new Map(quotes.map((quote) => [quote.code, quote]));
  return watches
    .filter((watch) => watch.object_type === "stock")
    .map((watch) => ({ watch, quote: byCode.get(watch.code) }))
    .filter(
      (item): item is { watch: StoredWatchItem; quote: StockQuote } =>
        item.quote !== undefined,
    )
    .sort((left, right) => {
      const levelDifference =
        riskOrder(changeRisk(right.quote.changePct, "stock")) -
        riskOrder(changeRisk(left.quote.changePct, "stock"));
      if (levelDifference) return levelDifference;
      const movementDifference =
        Math.abs(right.quote.changePct) - Math.abs(left.quote.changePct);
      if (movementDifference) return movementDifference;
      if (left.watch.tag !== right.watch.tag) {
        return left.watch.tag === "holding" ? -1 : 1;
      }
      return (order.get(left.watch.code) ?? 0) - (order.get(right.watch.code) ?? 0);
    })[0] ?? null;
}

function quoteIsStale(asOf: string, now: Date) {
  if (!getMarketSessionState(now).isOpen) return false;
  return now.getTime() - new Date(asOf).getTime() > 3 * 60_000;
}

export function buildStockBriefLayer(
  watches: StoredWatchItem[],
  quotes: StockQuote[],
  now = new Date(),
): TodayBriefLayer {
  const stockWatches = watches.filter((watch) => watch.object_type === "stock");
  if (!stockWatches.length) {
    return unavailableLayer("stock", "no_watch", {
      name: "关注股票",
      reason: "还没有关注股票；添加后这里只会从你的关注范围中选择。",
      coverageText: "关注股票 0 只",
    });
  }
  const selected = chooseWatchedStock(stockWatches, quotes);
  const coverage = `真实行情 ${quotes.filter((quote) => stockWatches.some((watch) => watch.code === quote.code)).length}/${stockWatches.length} 只关注股票`;
  if (!selected) {
    return unavailableLayer("stock", "no_data", {
      name: "关注股票",
      reason: "已关注股票的真实快照均未返回，本层不生成结论。",
      coverageText: coverage,
      provider: "腾讯公开行情页面接口（真实数据·实验源）",
      sourceUrl: "https://gu.qq.com/",
    });
  }
  if (quoteIsStale(selected.quote.asOf, now)) {
    return unavailableLayer("stock", "stale", {
      name: selected.watch.name,
      reason: "入选股票的快照超过盘中新鲜度上限，本层停止生成正常结论。",
      coverageText: coverage,
      dataTime: selected.quote.asOf,
      provider: "腾讯公开行情页面接口（真实数据·实验源）",
      sourceUrl: "https://gu.qq.com/",
    });
  }
  return {
    layer: "stock",
    status: "available",
    name: selected.watch.name,
    code: selected.watch.code,
    currentValue: `¥${selected.quote.value.toFixed(2)} · ${selected.quote.changePct > 0 ? "+" : ""}${selected.quote.changePct.toFixed(2)}%`,
    changePct: selected.quote.changePct,
    comparisonBase: "相对上一交易日收盘",
    reason: `只在已关注股票中按风险等级、绝对涨跌幅排序；同级同幅时“持有”优先。当前标签：${selected.watch.tag === "holding" ? "持有" : "仅关注"}。`,
    level: changeRisk(selected.quote.changePct, "stock"),
    dataTime: selected.quote.asOf,
    dataTimeLabel: "行情时间",
    provider: "腾讯公开行情页面接口（真实数据·实验源）",
    sourceUrl: "https://gu.qq.com/",
    coverageText: coverage,
    detailPage: DETAIL_PAGES.stock,
  };
}

export function chooseWatchedSector(results: WatchedSectorResult[]) {
  return results
    .map((item, index) => ({ ...item, index }))
    .filter(
      (item): item is WatchedSectorResult & { performance: SectorPerformance; index: number } =>
        item.performance !== null,
    )
    .sort((left, right) => {
      const levelDifference =
        riskOrder(changeRisk(right.performance.changePct, "sector")) -
        riskOrder(changeRisk(left.performance.changePct, "sector"));
      if (levelDifference) return levelDifference;
      const movementDifference =
        Math.abs(right.performance.changePct) - Math.abs(left.performance.changePct);
      return movementDifference || left.index - right.index;
    })[0] ?? null;
}

export function buildSectorBriefLayer(
  watches: StoredWatchItem[],
  results: WatchedSectorResult[],
  dataTime: string,
): TodayBriefLayer {
  const sectorWatches = watches.filter((watch) => watch.object_type === "sector");
  if (!sectorWatches.length) {
    return unavailableLayer("sector", "no_watch", {
      name: "关注板块",
      reason: "还没有关注板块；添加后这里只会从你的关注范围中选择。",
      coverageText: "关注板块 0 个",
    });
  }
  const selected = chooseWatchedSector(results);
  const supportedCount = results.filter((item) => item.performance !== null).length;
  const conceptCount = sectorWatches.filter(
    (watch) => watch.code.startsWith("EASTMONEY:") || watch.code.startsWith("SINA:gn_"),
  ).length;
  const coverage = `真实汇总 ${supportedCount}/${sectorWatches.length} 个关注板块${conceptCount ? `；${conceptCount} 个概念板块当前没有可靠汇总` : ""}`;
  if (!selected) {
    return unavailableLayer("sector", "no_data", {
      name: "关注板块",
      reason: "当前关注板块没有取得可验证的真实成分汇总；不会拿热门板块替代。",
      coverageText: coverage,
      provider: "新浪财经行情中心（真实行业成分·实验源）",
      sourceUrl: "https://vip.stock.finance.sina.com.cn/mkt/",
    });
  }
  const performance = selected.performance;
  return {
    layer: "sector",
    status: "available",
    name: selected.watch.name,
    code: selected.watch.code,
    currentValue: `${performance.changePct > 0 ? "+" : ""}${performance.changePct.toFixed(2)}%`,
    changePct: performance.changePct,
    comparisonBase: "成分股相对前收盘涨跌幅的等权平均",
    reason: `只在已关注且名称、代码精确核验的行业中排序；${performance.up} 只上涨、${performance.down} 只下跌、${performance.flat} 只基本持平。来源未提供板块统一时间戳，页面显示本次读取时间。`,
    level: changeRisk(performance.changePct, "sector"),
    dataTime,
    dataTimeLabel: "本次读取时间（行情新鲜度未知）",
    provider: "新浪财经行情中心（真实行业成分·实验源）",
    sourceUrl: "https://vip.stock.finance.sina.com.cn/mkt/",
    coverageText: `${coverage}；入选行业覆盖 ${performance.memberCount} 只有效成分股`,
    detailPage: DETAIL_PAGES.sector,
  };
}
