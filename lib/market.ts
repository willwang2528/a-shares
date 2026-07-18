import {
  getMarketSessionState,
  type IndexQuote,
  type MarketSnapshot,
} from "./domain";

const TENCENT_QUOTE_URL =
  "https://qt.gtimg.cn/q=sh000001,sz399001,sz399006,sh000300";

const INDEX_DEFINITIONS: Record<
  string,
  { code: string; name: string }
> = {
  sh000001: { code: "000001.SH", name: "上证指数" },
  sz399001: { code: "399001.SZ", name: "深证成指" },
  sz399006: { code: "399006.SZ", name: "创业板指" },
  sh000300: { code: "000300.SH", name: "沪深 300" },
};

function quoteTimeToIso(value: string) {
  if (!/^\d{14}$/.test(value)) throw new Error("行情时间格式不正确");
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(8, 10)}:${value.slice(10, 12)}:${value.slice(12, 14)}+08:00`;
}

function delayedMinutes(asOf: string, now: Date) {
  return Math.max(0, Math.floor((now.getTime() - new Date(asOf).getTime()) / 60_000));
}

export function parseTencentQuoteResponse(
  raw: string,
  now = new Date(),
): MarketSnapshot {
  const quotes: Array<IndexQuote & { asOf: string }> = [];
  for (const line of raw.split(";")) {
    const match = line.trim().match(/^v_([a-z]{2}\d+)="([^"]*)"/);
    if (!match) continue;
    const definition = INDEX_DEFINITIONS[match[1]];
    if (!definition) continue;
    const fields = match[2].split("~");
    const value = Number(fields[3]);
    const changePct = Number(fields[32]);
    const asOf = quoteTimeToIso(fields[30] ?? "");
    if (!Number.isFinite(value) || !Number.isFinite(changePct)) {
      throw new Error(`${definition.name}行情字段缺失`);
    }
    quotes.push({ ...definition, value, changePct, asOf });
  }
  if (quotes.length !== Object.keys(INDEX_DEFINITIONS).length) {
    throw new Error("主要指数返回数量不完整");
  }

  const asOf = quotes
    .map((quote) => quote.asOf)
    .sort()
    .at(-1) as string;
  const delay = delayedMinutes(asOf, now);
  const session = getMarketSessionState(now);
  const isFresh = session.isOpen ? delay <= 3 : true;

  return {
    fixtureId: "real_indices",
    dataMode: "experimental_real",
    coverage: "indices_only",
    asOf,
    provider: "腾讯公开行情页面接口（真实数据·实验源）",
    sourceUrl: "https://gu.qq.com/",
    delayedMinutes: delay,
    dataComplete: isFresh,
    indices: quotes.map(({ code, name, value, changePct }) => ({
      code,
      name,
      value,
      changePct,
    })),
    breadth: { up: 0, down: 0, flat: 0, limitUp: 0, limitDown: 0 },
    sectors: [],
    stocks: [],
  };
}

export async function fetchExperimentalRealSnapshot(
  fetcher: typeof fetch = fetch,
  now = new Date(),
) {
  const response = await fetcher(TENCENT_QUOTE_URL, {
    headers: {
      Accept: "text/plain,*/*",
      "User-Agent": "A-Share-Watch/0.1 private-evaluation",
    },
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`行情源返回 ${response.status}`);
  const bytes = await response.arrayBuffer();
  // 返回内容为 GBK，但行情代码、数字与时间均为 ASCII；名称使用本地受控映射，
  // 因而无需在云函数中依赖非 UTF-8 解码器。
  const raw = new TextDecoder("latin1").decode(bytes);
  return parseTencentQuoteResponse(raw, now);
}
