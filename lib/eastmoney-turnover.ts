const EASTMONEY_KLINE_URL =
  "https://push2his.eastmoney.com/api/qt/stock/kline/get";

export type HistoricalTurnover = { tradeDate: string; turnoverYuan: number };

export function parseEastmoneyIndexTurnover(raw: unknown): HistoricalTurnover[] {
  const data = raw as { data?: { klines?: unknown } };
  if (!Array.isArray(data.data?.klines)) return [];
  return data.data.klines
    .map((value) => typeof value === "string" ? value.split(",") : [])
    .map((fields) => ({ tradeDate: fields[0] ?? "", turnoverYuan: Number(fields[6]) }))
    .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item.tradeDate) && Number.isFinite(item.turnoverYuan) && item.turnoverYuan > 0);
}

function compactDate(date: string) {
  return date.replaceAll("-", "");
}

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

async function fetchIndexTurnover(
  secid: "1.000001" | "0.399001",
  tradeDate: string,
  fetcher: typeof fetch,
) {
  const params = new URLSearchParams({
    secid,
    fields1: "f1,f2,f3,f4,f5,f6",
    fields2: "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61",
    klt: "101",
    fqt: "0",
    beg: compactDate(shiftDate(tradeDate, -14)),
    end: compactDate(tradeDate),
  });
  const response = await fetcher(`${EASTMONEY_KLINE_URL}?${params}`, {
    headers: {
      Accept: "application/json,text/plain,*/*",
      "User-Agent": "Aria-Market-Watch/0.1 private-evaluation",
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`历史成交额源返回 ${response.status}`);
  return parseEastmoneyIndexTurnover(await response.json());
}

export async function fetchPreviousTradingDayTurnover(
  tradeDate: string,
  fetcher: typeof fetch = fetch,
) {
  const [shanghai, shenzhen] = await Promise.all([
    fetchIndexTurnover("1.000001", tradeDate, fetcher),
    fetchIndexTurnover("0.399001", tradeDate, fetcher),
  ]);
  const shMap = new Map(shanghai.map((item) => [item.tradeDate, item.turnoverYuan]));
  const previousDate = shenzhen
    .map((item) => item.tradeDate)
    .filter((date) => date < tradeDate && shMap.has(date))
    .sort()
    .at(-1);
  if (!previousDate) throw new Error("前一交易日成交额没有真实数据");
  const shanghaiYuan = shMap.get(previousDate) as number;
  const shenzhenYuan = shenzhen.find((item) => item.tradeDate === previousDate)?.turnoverYuan;
  if (!shenzhenYuan) throw new Error("前一交易日深市成交额没有真实数据");
  return { tradeDate: previousDate, shanghaiYuan, shenzhenYuan, totalYuan: shanghaiYuan + shenzhenYuan };
}
