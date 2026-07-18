export type WatchObjectType = "sector" | "stock";

export type WatchSearchResult = {
  objectType: WatchObjectType;
  code: string;
  name: string;
  classification: string;
  source: string;
  sourceUrl: string;
  memberCount: number | null;
  matchReason: string;
  experimental: boolean;
};

type SectorDefinition = {
  code: string;
  name: string;
  aliases: string[];
  featured?: boolean;
};

type StockDefinition = {
  code: string;
  name: string;
  featured?: boolean;
};

const SHENWAN_SOURCE = "申万宏源研究 · 一级行业";
const SHENWAN_SOURCE_URL =
  "https://www.swsresearch.com/institute_sw/allIndex/releasedIndex";
const TENCENT_SOURCE = "腾讯公开证券搜索页面（实验源）";
const TENCENT_SOURCE_URL = "https://gu.qq.com/";

// 这里保存的是可搜索的一级行业名称和代码目录，不包含成分股快照。
// 成分股数量会变化，未接入正式行业数据源前明确返回 null，避免展示过期数字。
export const SHENWAN_SECTORS: SectorDefinition[] = [
  { code: "SW-801010", name: "农林牧渔", aliases: ["农业", "养殖", "种植"], featured: true },
  { code: "SW-801030", name: "基础化工", aliases: ["化工", "化学制品"] },
  { code: "SW-801040", name: "钢铁", aliases: ["钢铁行业"] },
  { code: "SW-801050", name: "有色金属", aliases: ["有色", "金属", "稀土"], featured: true },
  { code: "SW-801080", name: "电子", aliases: ["半导体", "芯片", "消费电子"], featured: true },
  { code: "SW-801110", name: "家用电器", aliases: ["家电"] },
  { code: "SW-801120", name: "食品饮料", aliases: ["白酒", "饮料", "食品"], featured: true },
  { code: "SW-801130", name: "纺织服饰", aliases: ["纺织", "服装"] },
  { code: "SW-801140", name: "轻工制造", aliases: ["轻工", "造纸", "家居"] },
  { code: "SW-801150", name: "医药生物", aliases: ["医药", "医疗", "生物医药"], featured: true },
  { code: "SW-801160", name: "公用事业", aliases: ["电力", "燃气", "水务"] },
  { code: "SW-801170", name: "交通运输", aliases: ["交运", "物流", "航运", "机场"] },
  { code: "SW-801180", name: "房地产", aliases: ["地产", "房地产开发"] },
  { code: "SW-801200", name: "商贸零售", aliases: ["零售", "商业贸易"] },
  { code: "SW-801210", name: "社会服务", aliases: ["旅游", "酒店", "教育"] },
  { code: "SW-801230", name: "综合", aliases: ["综合行业"] },
  { code: "SW-801710", name: "建筑材料", aliases: ["建材", "水泥", "玻璃"] },
  { code: "SW-801720", name: "建筑装饰", aliases: ["建筑", "装修", "基建"] },
  { code: "SW-801730", name: "电力设备", aliases: ["新能源", "光伏", "锂电", "储能"], featured: true },
  { code: "SW-801740", name: "国防军工", aliases: ["军工", "国防"] },
  { code: "SW-801750", name: "计算机", aliases: ["软件", "人工智能", "AI"] },
  { code: "SW-801760", name: "传媒", aliases: ["游戏", "影视", "广告"] },
  { code: "SW-801770", name: "通信", aliases: ["通讯", "运营商"] },
  { code: "SW-801780", name: "银行", aliases: ["银行业"], featured: true },
  { code: "SW-801790", name: "非银金融", aliases: ["券商", "证券", "保险"] },
  { code: "SW-801880", name: "汽车", aliases: ["整车", "汽车零部件"] },
  { code: "SW-801890", name: "机械设备", aliases: ["机械", "工业设备"] },
  { code: "SW-801950", name: "煤炭", aliases: ["煤炭开采"] },
  { code: "SW-801960", name: "石油石化", aliases: ["石油", "石化", "油气"] },
  { code: "SW-801970", name: "环保", aliases: ["环境治理"] },
  { code: "SW-801980", name: "美容护理", aliases: ["美妆", "化妆品", "个护"] },
];

// 网络搜索不可用时仍能选择一组常见 A 股；价格不会从这个静态目录读取。
const LOCAL_STOCKS: StockDefinition[] = [
  { code: "600519.SH", name: "贵州茅台", featured: true },
  { code: "000858.SZ", name: "五粮液", featured: true },
  { code: "300750.SZ", name: "宁德时代", featured: true },
  { code: "601318.SH", name: "中国平安", featured: true },
  { code: "600036.SH", name: "招商银行", featured: true },
  { code: "601600.SH", name: "中国铝业", featured: true },
  { code: "000333.SZ", name: "美的集团" },
  { code: "000651.SZ", name: "格力电器" },
  { code: "002594.SZ", name: "比亚迪" },
  { code: "600900.SH", name: "长江电力" },
  { code: "601012.SH", name: "隆基绿能" },
  { code: "600030.SH", name: "中信证券" },
  { code: "601166.SH", name: "兴业银行" },
  { code: "601398.SH", name: "工商银行" },
  { code: "601288.SH", name: "农业银行" },
  { code: "601988.SH", name: "中国银行" },
  { code: "600276.SH", name: "恒瑞医药" },
  { code: "300059.SZ", name: "东方财富" },
  { code: "688981.SH", name: "中芯国际" },
  { code: "000001.SZ", name: "平安银行" },
  { code: "600887.SH", name: "伊利股份" },
  { code: "601899.SH", name: "紫金矿业" },
  { code: "601088.SH", name: "中国神华" },
  { code: "600309.SH", name: "万华化学" },
];

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/[\s._-]/g, "");
}

function sectorScore(sector: SectorDefinition, query: string) {
  const normalizedQuery = normalize(query);
  const normalizedName = normalize(sector.name);
  const normalizedCode = normalize(sector.code);
  if (!normalizedQuery) return sector.featured ? 20 : 0;
  if (normalizedName === normalizedQuery || normalizedCode === normalizedQuery) return 100;
  if (sector.aliases.some((alias) => normalize(alias) === normalizedQuery)) return 94;
  if (
    normalizedName.includes(normalizedQuery) ||
    normalizedCode.includes(normalizedQuery)
  ) {
    return 86;
  }
  if (sector.aliases.some((alias) => normalize(alias).includes(normalizedQuery))) {
    return 76;
  }
  return 0;
}

function stockScore(stock: StockDefinition, query: string) {
  const normalizedQuery = normalize(query);
  const normalizedName = normalize(stock.name);
  const normalizedCode = normalize(stock.code);
  if (!normalizedQuery) return stock.featured ? 20 : 0;
  if (normalizedName === normalizedQuery || normalizedCode === normalizedQuery) return 100;
  if (
    normalizedName.includes(normalizedQuery) ||
    normalizedCode.includes(normalizedQuery)
  ) {
    return 84;
  }
  return 0;
}

function sectorMatchReason(sector: SectorDefinition, query: string) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return "常用板块，可直接选择";
  if (
    normalize(sector.name) === normalizedQuery ||
    normalize(sector.code) === normalizedQuery
  ) {
    return "行业名称或代码完全匹配";
  }
  const alias = sector.aliases.find((item) => normalize(item) === normalizedQuery);
  if (alias) return `“${alias}”是该行业的常用说法，请确认分类`;
  return "行业名称、代码或常用说法包含输入内容";
}

function sectorResult(
  sector: SectorDefinition,
  query: string,
): WatchSearchResult {
  return {
    objectType: "sector",
    code: sector.code,
    name: sector.name,
    classification: "申万一级行业",
    source: SHENWAN_SOURCE,
    sourceUrl: SHENWAN_SOURCE_URL,
    memberCount: null,
    matchReason: sectorMatchReason(sector, query),
    experimental: false,
  };
}

function stockResult(stock: StockDefinition, query: string): WatchSearchResult {
  return {
    objectType: "stock",
    code: stock.code,
    name: stock.name,
    classification: "沪深 A 股股票",
    source: "本地 A 股常用证券目录（候选补充）",
    sourceUrl: TENCENT_SOURCE_URL,
    memberCount: null,
    matchReason: query ? "证券名称或代码匹配" : "常用股票，可直接选择",
    experimental: true,
  };
}

export function searchSectorCatalog(query: string, limit = 8) {
  return SHENWAN_SECTORS.map((sector) => ({
    sector,
    score: sectorScore(sector, query),
  }))
    .filter((item) => item.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score || left.sector.code.localeCompare(right.sector.code),
    )
    .slice(0, limit)
    .map(({ sector }) => sectorResult(sector, query));
}

export function searchLocalStockCatalog(query: string, limit = 8) {
  return LOCAL_STOCKS.map((stock) => ({
    stock,
    score: stockScore(stock, query),
  }))
    .filter((item) => item.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score || left.stock.code.localeCompare(right.stock.code),
    )
    .slice(0, limit)
    .map(({ stock }) => stockResult(stock, query));
}

export function parseTencentSearchResponse(
  raw: string,
  query: string,
): WatchSearchResult[] {
  const assignment = raw.trim().match(/^v_hint=("(?:\\.|[^"])*")/);
  if (!assignment) return [];
  let value = "";
  try {
    value = JSON.parse(assignment[1]) as string;
  } catch {
    return [];
  }
  return value
    .split("^")
    .map((item) => item.split("~"))
    .filter(
      (fields) =>
        ["sh", "sz", "bj"].includes(fields[0]) &&
        /^\d{6}$/.test(fields[1] ?? "") &&
        (fields[4] ?? "").startsWith("GP-A"),
    )
    .slice(0, 10)
    .map((fields) => {
      const exchange = fields[0].toUpperCase();
      return {
        objectType: "stock" as const,
        code: `${fields[1]}.${exchange}`,
        name: (fields[2] ?? "").replace(/\s+/g, ""),
        classification: `${exchange === "SH" ? "上交所" : exchange === "SZ" ? "深交所" : "北交所"} A 股`,
        source: TENCENT_SOURCE,
        sourceUrl: TENCENT_SOURCE_URL,
        memberCount: null,
        matchReason: /^\d/.test(query.trim())
          ? "证券代码匹配"
          : "证券名称或拼音匹配",
        experimental: true,
      };
    });
}

export async function searchTencentStocks(
  query: string,
  fetcher: typeof fetch = fetch,
) {
  if (!query.trim()) return [];
  const response = await fetcher(
    `https://smartbox.gtimg.cn/s3/?t=all&q=${encodeURIComponent(query.trim())}`,
    {
      headers: {
        Accept: "text/plain,*/*",
        "User-Agent": "A-Share-Watch/0.1 private-evaluation",
      },
      signal: AbortSignal.timeout(4_000),
    },
  );
  if (!response.ok) throw new Error(`证券搜索源返回 ${response.status}`);
  return parseTencentSearchResponse(await response.text(), query);
}

export function mergeSearchResults(
  sectors: WatchSearchResult[],
  remoteStocks: WatchSearchResult[],
  localStocks: WatchSearchResult[],
  limit = 12,
) {
  const seen = new Set<string>();
  return [...sectors, ...remoteStocks, ...localStocks]
    .filter((item) => {
      const key = `${item.objectType}:${item.code}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

export function findSectorByCode(code: string) {
  return SHENWAN_SECTORS.find((sector) => sector.code === code);
}
