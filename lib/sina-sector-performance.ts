import {
  fetchSinaSectorEntries,
  type SinaSectorEntry,
} from "./sina-sectors";

const NODE_DATA_URL =
  "https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData";

type SinaNodeStock = {
  symbol?: unknown;
  name?: unknown;
  trade?: unknown;
  changepercent?: unknown;
  amount?: unknown;
};

export type SectorPerformance = {
  code: string;
  name: string;
  changePct: number;
  turnoverYuan: number;
  up: number;
  down: number;
  flat: number;
  memberCount: number;
  coreStock: string;
  coreStockCode: string;
  coreStockChangePct: number;
  weakestStock: string;
  weakestStockCode: string;
  weakestStockChangePct: number;
};

function finite(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function summarizeSinaSectorStocks(
  entry: SinaSectorEntry,
  raw: unknown,
): SectorPerformance | null {
  if (!Array.isArray(raw)) return null;
  const stocks = raw
    .map((item) => item as SinaNodeStock)
    .map((item) => ({
      code: typeof item.symbol === "string" ? item.symbol : "",
      name: typeof item.name === "string" ? item.name : "",
      price: finite(item.trade),
      changePct: finite(item.changepercent),
      amount: finite(item.amount),
    }))
    .filter(
      (item): item is {
        code: string;
        name: string;
        price: number;
        changePct: number;
        amount: number;
      } =>
        Boolean(item.code && item.name) &&
        item.price !== null &&
        item.price > 0 &&
        item.changePct !== null &&
        item.amount !== null &&
        item.amount >= 0,
    );
  if (!stocks.length) return null;
  const core = [...stocks].sort(
    (left, right) =>
      right.changePct - left.changePct || right.amount - left.amount,
  )[0];
  const weakest = [...stocks].sort(
    (left, right) =>
      left.changePct - right.changePct || right.amount - left.amount,
  )[0];
  return {
    code: `SINA:${entry.node}`,
    name: entry.name,
    changePct:
      stocks.reduce((sum, item) => sum + item.changePct, 0) / stocks.length,
    turnoverYuan: stocks.reduce((sum, item) => sum + item.amount, 0),
    up: stocks.filter((item) => item.changePct > 0.005).length,
    down: stocks.filter((item) => item.changePct < -0.005).length,
    flat: stocks.filter((item) => Math.abs(item.changePct) <= 0.005).length,
    memberCount: stocks.length,
    coreStock: core.name,
    coreStockCode: core.code,
    coreStockChangePct: core.changePct,
    weakestStock: weakest.name,
    weakestStockCode: weakest.code,
    weakestStockChangePct: weakest.changePct,
  };
}

async function fetchOne(entry: SinaSectorEntry, fetcher: typeof fetch) {
  const url = `${NODE_DATA_URL}?page=1&num=500&sort=symbol&asc=1&node=${encodeURIComponent(entry.node)}&symbol=`;
  const response = await fetcher(url, {
    headers: {
      Accept: "application/json,text/plain,*/*",
      "User-Agent": "Aria-Market-Watch/0.1 private-evaluation",
    },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) return null;
  return summarizeSinaSectorStocks(entry, await response.json());
}

export async function fetchSinaIndustryEntryPerformance(
  entry: SinaSectorEntry,
  fetcher: typeof fetch = fetch,
) {
  if (entry.classification.includes("概念")) return null;
  return fetchOne(entry, fetcher);
}

export async function fetchWatchedSinaIndustryPerformance(
  code: string,
  name: string,
  fetcher: typeof fetch = fetch,
) {
  if (!code.startsWith("SINA:") || code.startsWith("SINA:gn_")) return null;
  const node = code.slice("SINA:".length);
  const entries = await fetchSinaSectorEntries(fetcher);
  const entry = entries.find(
    (candidate) =>
      candidate.node === node &&
      candidate.name === name &&
      !candidate.classification.includes("概念"),
  );
  if (!entry) return null;
  return fetchSinaIndustryEntryPerformance(entry, fetcher);
}

export async function fetchSinaIndustryPerformance(
  fetcher: typeof fetch = fetch,
) {
  const entries = (await fetchSinaSectorEntries(fetcher)).filter(
    (entry) => entry.classification === "申万一级",
  );
  const results: SectorPerformance[] = [];
  for (let index = 0; index < entries.length; index += 6) {
    const batch = await Promise.all(
      entries.slice(index, index + 6).map((entry) => fetchOne(entry, fetcher)),
    );
    results.push(...batch.filter((item): item is SectorPerformance => item !== null));
  }
  if (results.length < 20) throw new Error("真实行业排行返回数量不完整");
  return results;
}
