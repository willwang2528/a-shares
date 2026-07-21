const SINA_ALL_A_URL =
  "https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData";

export type StockIdentity = { providerCode: string; code: string; name: string };

export type DailyLimitStats = {
  limitUp: number;
  limitDown: number;
  openedLimit: number;
  openedLimitRate: number;
  coveredStocks: number;
  requestedStocks: number;
  asOf: string;
  provider: string;
  limitUpCodes: string[];
};

function quoteTimeToIso(value: string) {
  if (!/^\d{14}$/.test(value)) throw new Error("涨跌停行情时间格式不正确");
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(8, 10)}:${value.slice(10, 12)}:${value.slice(12, 14)}+08:00`;
}

export function parseSinaAStockList(raw: unknown): StockIdentity[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw
    .map((item) => item as { symbol?: unknown; code?: unknown; name?: unknown })
    .map((item) => {
      const providerCode = typeof item.symbol === "string" ? item.symbol : "";
      const code = typeof item.code === "string" ? item.code : "";
      const name = typeof item.name === "string" ? item.name.trim() : "";
      const exchange = providerCode.startsWith("sh") ? "SH" : providerCode.startsWith("sz") ? "SZ" : null;
      if (!exchange || !/^\d{6}$/.test(code) || !name) return null;
      const key = `${code}.${exchange}`;
      if (seen.has(key)) return null;
      seen.add(key);
      return { providerCode, code: key, name };
    })
    .filter((item): item is StockIdentity => item !== null);
}

export async function fetchSinaNodeMemberCodes(
  node: string,
  fetcher: typeof fetch = fetch,
) {
  if (!/^[a-zA-Z0-9_]+$/.test(node)) throw new Error("板块代码格式不正确");
  const response = await fetcher(
    `${SINA_ALL_A_URL}?page=1&num=500&sort=symbol&asc=1&node=${encodeURIComponent(node)}&symbol=`,
    {
      headers: {
        Accept: "application/json,text/plain,*/*",
        "User-Agent": "Aria-Market-Watch/0.1 private-evaluation",
      },
      signal: AbortSignal.timeout(8_000),
    },
  );
  if (!response.ok) throw new Error(`板块成分股返回 ${response.status}`);
  const codes = parseSinaAStockList(await response.json()).map((item) => item.providerCode);
  if (!codes.length) throw new Error("板块成分股没有真实数据");
  return codes;
}

export function parseTencentDailyLimits(raw: string) {
  const rows: Array<{
    code: string;
    current: number;
    high: number;
    limitUp: number;
    limitDown: number;
    asOf: string;
  }> = [];
  for (const line of raw.split(";")) {
    const match = line.trim().match(/^v_((?:sh|sz)\d{6})="([^"]*)"/);
    if (!match) continue;
    const fields = match[2].split("~");
    const current = Number(fields[3]);
    const high = Number(fields[33]);
    const limitUp = Number(fields[47]);
    const limitDown = Number(fields[48]);
    if (
      !Number.isFinite(current) ||
      !Number.isFinite(high) ||
      !Number.isFinite(limitUp) ||
      !Number.isFinite(limitDown) ||
      current <= 0 ||
      limitUp <= 0 ||
      limitDown <= 0
    ) {
      continue;
    }
    rows.push({
      code: match[1],
      current,
      high,
      limitUp,
      limitDown,
      asOf: quoteTimeToIso(fields[30] ?? ""),
    });
  }
  return rows;
}

function atPrice(value: number, target: number) {
  return Math.abs(value - target) < 0.005;
}

export async function fetchSinaAStockCatalogGroup(
  group: 0 | 1,
  fetcher: typeof fetch = fetch,
) {
  const startPage = group === 0 ? 1 : 31;
  const pages = Array.from({ length: 30 }, (_, index) => startPage + index);
  const stocks: StockIdentity[] = [];
  for (let index = 0; index < pages.length; index += 6) {
    const results = await Promise.all(
      pages.slice(index, index + 6).map(async (page) => {
        const response = await fetcher(
          `${SINA_ALL_A_URL}?page=${page}&num=100&sort=symbol&asc=1&node=hs_a&symbol=`,
          {
            headers: {
              Accept: "application/json,text/plain,*/*",
              "User-Agent": "Aria-Market-Watch/0.1 private-evaluation",
            },
            signal: AbortSignal.timeout(10_000),
          },
        );
        if (!response.ok) throw new Error(`A 股代码目录第 ${page} 页返回 ${response.status}`);
        return parseSinaAStockList(await response.json());
      }),
    );
    stocks.push(...results.flat());
  }
  return stocks;
}

export async function fetchDailyLimitStats(
  stocks: StockIdentity[],
  fetcher: typeof fetch = fetch,
) {
  if (stocks.length < 4500) throw new Error("沪深 A 股代码目录返回数量不完整");

  const rows: ReturnType<typeof parseTencentDailyLimits> = [];
  const batches: StockIdentity[][] = [];
  for (let index = 0; index < stocks.length; index += 120) {
    batches.push(stocks.slice(index, index + 120));
  }
  for (let index = 0; index < batches.length; index += 6) {
    const responses = await Promise.all(
      batches.slice(index, index + 6).map(async (batch) => {
        const response = await fetcher(
          `https://qt.gtimg.cn/q=${batch.map((item) => item.providerCode).join(",")}`,
          {
            headers: {
              Accept: "text/plain,*/*",
              "User-Agent": "Aria-Market-Watch/0.1 private-evaluation",
            },
            signal: AbortSignal.timeout(10_000),
          },
        );
        if (!response.ok) throw new Error(`个股限价源返回 ${response.status}`);
        const bytes = await response.arrayBuffer();
        return parseTencentDailyLimits(new TextDecoder("latin1").decode(bytes));
      }),
    );
    rows.push(...responses.flat());
  }
  if (rows.length / stocks.length < 0.9) {
    throw new Error(`涨跌停价覆盖不足（${rows.length}/${stocks.length}）`);
  }

  const sealedUp = rows.filter((item) => atPrice(item.current, item.limitUp)).length;
  const limitUpCodes = rows
    .filter((item) => atPrice(item.current, item.limitUp))
    .map((item) => item.code);
  const limitDown = rows.filter((item) => atPrice(item.current, item.limitDown)).length;
  const openedLimit = rows.filter(
    (item) => atPrice(item.high, item.limitUp) && item.current < item.limitUp - 0.005,
  ).length;
  const touchedUp = sealedUp + openedLimit;
  return {
    limitUp: sealedUp,
    limitDown,
    openedLimit,
    openedLimitRate: touchedUp ? (openedLimit / touchedUp) * 100 : 0,
    coveredStocks: rows.length,
    requestedStocks: stocks.length,
    asOf: rows.map((item) => item.asOf).sort().at(-1) as string,
    provider: "腾讯个股行情限价字段 + 新浪沪深 A 股代码目录（真实数据·实验源）",
    limitUpCodes,
  } satisfies DailyLimitStats;
}
