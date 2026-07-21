"use client";

import { useEffect, useMemo, useState } from "react";
import costSnapshot from "@/data/cost-snapshot.json";
import lastRealIndexSnapshot from "@/data/last-real-index-snapshot.json";
import {
  DEFAULT_SETTINGS,
  estimateStorageMb,
  evaluateRules,
  getMarketSessionState,
  highestRisk,
  nextTaskLabel,
  scansPerTradingDay,
  type AlertEvent,
  type MarketSnapshot,
  type RiskLevel,
  type UserSettings,
} from "@/lib/domain";
import type {
  HistoricalReviewResponse,
  HistoricalReviewResult,
  HistoricalStockMovement,
} from "@/lib/historical-review";
import type { WatchSearchResult } from "@/lib/instruments";
import type { StockQuote } from "@/lib/market";

type PageId =
  | "home"
  | "watch"
  | "tasks"
  | "alerts"
  | "reviews"
  | "notifications"
  | "costs"
  | "status";

type HealthItem = {
  id: string;
  name: string;
  status: string;
  message: string;
};

type WatchItem = {
  id: string;
  object_type: "sector" | "stock";
  code: string;
  name: string;
  tag: "watch" | "holding";
  cost_price: number | null;
};

type ApiData = {
  ok?: boolean;
  message?: string;
  settings?: UserSettings;
  alerts?: AlertEvent[];
  watches?: WatchItem[];
  services?: HealthItem[];
  snapshot?: MarketSnapshot;
  results?: WatchSearchResult[];
  sourceStatus?: "live" | "fallback" | "featured";
  quotes?: StockQuote[];
  historical?: HistoricalReviewResult;
  cacheHit?: boolean;
  cacheExpiresAt?: string;
  payload?: {
    events?: AlertEvent[];
    snapshot?: MarketSnapshot;
    delivery?: { message?: string };
  };
};

async function readApiData(response: Response) {
  return response.json() as Promise<ApiData>;
}

const NAV: Array<{ id: PageId; icon: string; label: string }> = [
  { id: "home", icon: "⌂", label: "首页" },
  { id: "watch", icon: "◎", label: "关注" },
  { id: "tasks", icon: "◷", label: "任务" },
  { id: "alerts", icon: "!", label: "预警" },
  { id: "reviews", icon: "▤", label: "复盘" },
  { id: "notifications", icon: "↗", label: "通知" },
  { id: "costs", icon: "¥", label: "成本" },
  { id: "status", icon: "●", label: "状态" },
];

const PUSH_MODE_COPY = {
  event_only: ["只推异常", "默认。没有触发事件时保持安静。"],
  interval_digest: ["每次都摘要", "每个周期都发一条简短盘面。"],
  both: ["摘要 + 异常", "周期摘要中合并本周期风险事件。"],
} as const;

function signed(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatMb(value: number) {
  return value >= 1000 ? `${(value / 1000).toFixed(2)} GB` : `${value.toFixed(1)} MB`;
}

function shanghaiDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function riskCopy(level: RiskLevel) {
  if (level === "danger") return { label: "高风险", icon: "▲", detail: "多项风险指标同时达到高位" };
  if (level === "warning") return { label: "需留意", icon: "◆", detail: "部分指标达到提醒阈值" };
  return { label: "一般", icon: "●", detail: "未出现默认高风险信号" };
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className={`toggle ${checked ? "is-on" : ""}`}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

function Pill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: string }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty">
      <span aria-hidden="true">○</span>
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  );
}

export function AStockApp() {
  const [page, setPage] = useState<PageId>("home");
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [snapshot, setSnapshot] = useState<MarketSnapshot>(
    () => lastRealIndexSnapshot as MarketSnapshot,
  );
  const [dataMode, setDataMode] = useState<"real" | "cached_real">(
    "cached_real",
  );
  const [marketLoading, setMarketLoading] = useState(true);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [health, setHealth] = useState<HealthItem[]>([]);
  const [saveState, setSaveState] = useState("正在连接云端保存…");
  const [running, setRunning] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [watchInput, setWatchInput] = useState("");
  const [watchItems, setWatchItems] = useState<WatchItem[]>([]);
  const [searchResults, setSearchResults] = useState<WatchSearchResult[]>([]);
  const [selectedResult, setSelectedResult] = useState<WatchSearchResult | null>(null);
  const [searchMessage, setSearchMessage] = useState("常用选项正在载入…");
  const [searching, setSearching] = useState(false);
  const [watchMutation, setWatchMutation] = useState<string | null>(null);
  const [newWatchTag, setNewWatchTag] = useState<"watch" | "holding">("watch");
  const [stockQuotes, setStockQuotes] = useState<Record<string, StockQuote>>({});
  const [watchQuoteError, setWatchQuoteError] = useState<string | null>(null);
  const [keyMomentDraft, setKeyMomentDraft] = useState("10:30");
  const [alertLevel, setAlertLevel] = useState<"all" | RiskLevel>("all");
  const [costInterval, setCostInterval] = useState(5);
  const [costScope, setCostScope] = useState<"market" | "sector" | "watch">("market");
  const [historicalDate, setHistoricalDate] = useState(
    () => (lastRealIndexSnapshot as MarketSnapshot).asOf.slice(0, 10),
  );
  const [historicalReview, setHistoricalReview] =
    useState<HistoricalReviewResponse | null>(null);
  const [historicalLoading, setHistoricalLoading] = useState(false);
  const [historicalError, setHistoricalError] = useState<string | null>(null);

  const currentAlerts = useMemo(() => evaluateRules(snapshot, settings), [snapshot, settings]);
  const risk = highestRisk(currentAlerts);
  const riskInfo = riskCopy(risk);
  const session = getMarketSessionState(new Date());
  const visibleAlerts = alerts.filter((event) => alertLevel === "all" || event.level === alertLevel);

  useEffect(() => {
    const queryPage = new URLSearchParams(window.location.search).get("page") as PageId | null;
    if (queryPage && NAV.some((item) => item.id === queryPage)) {
      queueMicrotask(() => setPage(queryPage));
    }
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    fetch("/api/state", { cache: "no-store" })
      .then(async (response) => ({ ok: response.ok, data: await readApiData(response) }))
      .then(({ ok, data }) => {
        if (data.settings) setSettings(data.settings);
        if (Array.isArray(data.alerts) && data.alerts.length) setAlerts(data.alerts);
        if (Array.isArray(data.watches)) setWatchItems(data.watches);
        setSaveState(ok ? "已连接云端保存" : "当前使用会话内默认设置");
      })
      .catch(() => setSaveState("当前使用会话内默认设置"));
    fetch("/api/health", { cache: "no-store" })
      .then(readApiData)
      .then((data) => setHealth(data.services ?? []))
      .catch(() => setHealth([]));
    fetch("/api/search", { cache: "no-store" })
      .then(readApiData)
      .then((data) => {
        if (Array.isArray(data.results)) setSearchResults(data.results);
        setSearchMessage(data.message ?? "可以输入名称或 6 位代码查找。");
      })
      .catch(() => setSearchMessage("常用选项读取失败，请直接输入名称或代码查找。"));
    fetch("/api/market", { cache: "no-store" })
      .then(async (response) => ({ ok: response.ok, data: await readApiData(response) }))
      .then(({ ok, data }) => {
        if (!ok || !data.snapshot) throw new Error(data.message);
        setSnapshot(data.snapshot);
        setDataMode("real");
        setAlerts(evaluateRules(data.snapshot));
        setMarketError(null);
      })
      .catch(() => {
        setDataMode("cached_real");
        setMarketError("实时刷新失败，当前显示上次成功读取的真实收盘快照，时间见页面标注。");
      })
      .finally(() => setMarketLoading(false));
  }, []);

  useEffect(() => {
    const codes = watchItems
      .filter((item) => item.object_type === "stock")
      .map((item) => item.code);
    if (!codes.length) return;
    let ignored = false;
    fetch(`/api/watch-quotes?codes=${encodeURIComponent(codes.join(","))}`, {
      cache: "no-store",
    })
      .then(async (response) => ({ ok: response.ok, data: await readApiData(response) }))
      .then(({ ok, data }) => {
        if (ignored) return;
        if (!ok || !Array.isArray(data.quotes)) throw new Error(data.message);
        setStockQuotes(
          Object.fromEntries(
            (data.quotes as StockQuote[]).map((quote) => [quote.code, quote]),
          ),
        );
        setWatchQuoteError(null);
      })
      .catch(() => {
        if (ignored) return;
        setStockQuotes({});
        setWatchQuoteError("真实股票行情暂时读取失败；已标记为没有数据。");
      });
    return () => {
      ignored = true;
    };
  }, [watchItems]);

  async function refreshRealMarket() {
    setMarketLoading(true);
    try {
      const response = await fetch("/api/market", { cache: "no-store" });
      const data = await readApiData(response);
      if (!response.ok || !data.snapshot) throw new Error(data.message);
      setSnapshot(data.snapshot);
      setDataMode("real");
      setAlerts(evaluateRules(data.snapshot, settings));
      setMarketError(null);
      setToast(`真实指数已更新：${data.snapshot.asOf.slice(0, 16).replace("T", " ")}`);
    } catch (error) {
      setMarketError(error instanceof Error ? error.message : "真实指数读取失败。");
      setToast("真实指数读取失败；已停止生成新的行情结论。");
    } finally {
      setMarketLoading(false);
    }
  }

  function go(next: PageId) {
    setPage(next);
    window.history.replaceState({}, "", next === "home" ? "/" : `/?page=${next}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function patchSettings(patch: Partial<UserSettings>) {
    setSettings((current) => ({ ...current, ...patch }));
    setSaveState("有未保存更改");
  }

  async function saveSettings() {
    setSaveState("正在保存…");
    try {
      const response = await fetch("/api/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      const data = await readApiData(response);
      if (!response.ok || !data.settings) throw new Error(data.message);
      setSettings(data.settings);
      setSaveState("刚刚已保存");
      setToast("设置已经保存，刷新页面也会保留。");
    } catch {
      setSaveState("保存失败，请稍后重试");
      setToast("保存失败，原有设置没有被覆盖。");
    }
  }

  async function run(type: "scan" | "test_notification") {
    setRunning(type);
    try {
      const response = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          force: true,
        }),
      });
      const result = await readApiData(response);
      if (!response.ok || !result.ok) throw new Error(result.message);
      if (type === "scan") {
        const nextAlerts = result.payload?.events ?? currentAlerts;
        if (result.payload?.snapshot) setSnapshot(result.payload.snapshot);
        setAlerts(nextAlerts);
        setToast("真实指数扫描完成；当前覆盖不足，未运行全市场风险规则。");
      } else {
        setToast(result.payload?.delivery?.message ?? "测试通知已写入日志。");
      }
      const healthResponse = await fetch("/api/health", { cache: "no-store" });
      const healthData = await readApiData(healthResponse);
      setHealth(healthData.services ?? []);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "任务失败，请检查系统状态。");
    } finally {
      setRunning(null);
    }
  }

  async function loadHistoricalReview() {
    setHistoricalLoading(true);
    setHistoricalError(null);
    setHistoricalReview(null);
    try {
      const response = await fetch(
        `/api/historical-review?date=${encodeURIComponent(historicalDate)}`,
        { cache: "no-store" },
      );
      const data = await readApiData(response);
      if (
        !response.ok ||
        !data.historical ||
        typeof data.cacheHit !== "boolean" ||
        !data.cacheExpiresAt
      ) {
        throw new Error(data.message ?? "真实历史数据读取失败。");
      }
      setHistoricalReview({
        historical: data.historical,
        cacheHit: data.cacheHit,
        cacheExpiresAt: data.cacheExpiresAt,
      });
    } catch (error) {
      setHistoricalError(
        error instanceof Error
          ? error.message
          : "真实历史数据读取失败；本次不生成复盘。",
      );
    } finally {
      setHistoricalLoading(false);
    }
  }

  async function testBrowserNotification() {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setToast("这个浏览器不支持本机通知，请改用 Server酱或邮件。");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setToast("你没有允许通知；可以在浏览器的网站设置中重新开启。");
      return;
    }
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification("Aria 监盘测试通知", {
      body: "如果你看到这条消息，说明这台设备的浏览器通知可用。",
      tag: "market-watch-test",
    });
    setToast("已发出一条本机系统通知。它不是后台 Web Push。");
  }

  async function searchWatchCandidates(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setSearching(true);
    setSelectedResult(null);
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(watchInput.trim())}`, {
        cache: "no-store",
      });
      const data = await readApiData(response);
      if (!response.ok || !Array.isArray(data.results)) throw new Error(data.message);
      setSearchResults(data.results);
      setSearchMessage(
        data.sourceStatus === "fallback"
          ? `${data.message} 股票网络搜索暂时不可用，当前结果来自备用目录。`
          : (data.message ?? "请选择一个候选后再确认关注。"),
      );
    } catch (error) {
      setSearchResults([]);
      setSearchMessage(error instanceof Error ? error.message : "查找失败，请稍后重试。");
    } finally {
      setSearching(false);
    }
  }

  function isAlreadyWatched(result: WatchSearchResult) {
    return watchItems.some(
      (item) =>
        item.object_type === result.objectType && item.code === result.code,
    );
  }

  async function addSelectedWatch() {
    if (!selectedResult) return;
    setWatchMutation(`add:${selectedResult.objectType}:${selectedResult.code}`);
    try {
      const response = await fetch("/api/watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objectType: selectedResult.objectType,
          code: selectedResult.code,
          name: selectedResult.name,
          tag: newWatchTag,
        }),
      });
      const data = await readApiData(response);
      if (!response.ok || !Array.isArray(data.watches)) throw new Error(data.message);
      setWatchItems(data.watches);
      setSelectedResult(null);
      setToast(data.message ?? "已加入关注。");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "添加失败，请稍后重试。");
    } finally {
      setWatchMutation(null);
    }
  }

  async function changeWatchTag(item: WatchItem) {
    setWatchMutation(`tag:${item.id}`);
    const tag = item.tag === "holding" ? "watch" : "holding";
    try {
      const response = await fetch("/api/watch", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, tag }),
      });
      const data = await readApiData(response);
      if (!response.ok || !Array.isArray(data.watches)) throw new Error(data.message);
      setWatchItems(data.watches);
      setToast(data.message ?? "标签已修改。");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "标签修改失败。");
    } finally {
      setWatchMutation(null);
    }
  }

  async function removeWatch(item: WatchItem) {
    setWatchMutation(`remove:${item.id}`);
    try {
      const response = await fetch(`/api/watch?id=${encodeURIComponent(item.id)}`, {
        method: "DELETE",
      });
      const data = await readApiData(response);
      if (!response.ok || !Array.isArray(data.watches)) throw new Error(data.message);
      setWatchItems(data.watches);
      setToast(`${item.name}已从关注列表移除。`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "移除失败。");
    } finally {
      setWatchMutation(null);
    }
  }

  const scopeCount = costScope === "market" ? 5500 : costScope === "sector" ? 400 : 30;
  const storage = estimateStorageMb(costInterval, scopeCount);
  const scans = scansPerTradingDay(costInterval);

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="主要导航">
        <button className="brand" onClick={() => go("home")} aria-label="回到首页">
          <span className="brand-mark">A</span>
          <span><strong>Aria 监盘</strong><small>A 股真实数据提醒</small></span>
        </button>
        <nav>
          {NAV.map((item) => (
            <button
              key={item.id}
              className={page === item.id ? "active" : ""}
              onClick={() => go(item.id)}
              aria-current={page === item.id ? "page" : undefined}
            >
              <span aria-hidden="true">{item.icon}</span>{item.label}
              {item.id === "alerts" && alerts.length > 0 ? <b>{alerts.length}</b> : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <Pill tone="green">
            {dataMode === "real" ? "真实指数·实验源" : "真实指数·上次成功"}
          </Pill>
          <p>只展示真实行情；数据缺失时明确标记不可用。</p>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div>
            <p className="eyebrow">ASIA/SHANGHAI · {session.date}</p>
            <h1>{NAV.find((item) => item.id === page)?.label}</h1>
          </div>
          <div className="top-actions">
            <span className={`market-state state-${session.isOpen ? "open" : "closed"}`}>
              <i />{session.label}
            </span>
            <button className="avatar" aria-label="当前用户">友</button>
          </div>
        </header>

        {page === "home" && (
          <div className="page-stack">
            <section className={`risk-hero risk-${risk}`}>
              <div className="hero-copy">
                <div className="hero-kicker">
                  <span className="risk-icon">{riskInfo.icon}</span>
                  <span>
                    最近交易日真实快照 ·{" "}
                    {snapshot.asOf.slice(0, 16).replace("T", " ")}
                  </span>
                </div>
                <h2>
                  {marketLoading ? "正在检查行情更新" : "真实指数已更新"}
                </h2>
                <p>当前真实数据覆盖四个主要指数和已关注股票。市场宽度、行业成分和涨跌停仍缺少正式数据，所以不生成相关结论。</p>
                {marketError ? <p className="source-warning">{marketError}</p> : null}
                <div className="hero-actions">
                  <button className="button button-dark" onClick={() => refreshRealMarket()} disabled={marketLoading}>
                    {marketLoading ? "正在更新…" : "刷新真实数据"}
                  </button>
                  <button className="button button-ghost" onClick={() => go("status")}>
                    查看覆盖说明
                  </button>
                </div>
              </div>
              <div
                className="breadth-ring"
                aria-label="四个真实主要指数"
              >
                <strong>{snapshot.indices.length}</strong>
                <span>真实指数</span>
              </div>
            </section>

            <section className="session-note">
              <span aria-hidden="true">◷</span>
              <div><strong>{session.reason}</strong><p>下一项：{nextTaskLabel(settings)}</p></div>
            </section>

            <section>
              <div className="section-head">
                <div><p className="eyebrow">市场整体</p><h2>主要指数</h2></div>
                <span className="data-time">
                  {snapshot.asOf.slice(0, 16).replace("T", " ")} ·{" "}
                  {dataMode === "real" ? "真实数据·实验源" : "真实数据·上次成功"}
                </span>
              </div>
              <div className="index-grid">
                {snapshot.indices.map((index) => (
                  <article className="index-card" key={index.code}>
                    <div><span>{index.name}</span><small>{index.code}</small></div>
                    <strong>{index.value.toLocaleString("zh-CN")}</strong>
                    <b className={index.changePct >= 0 ? "up" : "down"}>
                      {index.changePct >= 0 ? "↑" : "↓"} {signed(index.changePct)}
                    </b>
                  </article>
                ))}
              </div>
            </section>

            <section className="two-column">
                <div className="panel coverage-panel">
                  <Pill tone="amber">尚未覆盖</Pill>
                  <h2>市场宽度与涨跌停</h2>
                  <p>公开指数快照不包含全市场上涨、下跌、涨停和跌停家数。正式数据接入前，这里只显示“尚未覆盖”，也不触发相关规则。</p>
                </div>
                <div className="panel coverage-panel">
                  <Pill tone="amber">尚未覆盖</Pill>
                  <h2>行业成分与当日涨跌停价</h2>
                  <p>自选股价格已读取真实快照；行业成分、行业涨跌幅和个股当日涨跌停价尚无可用数据。</p>
                </div>
            </section>

            <section>
              <div className="section-head">
                <div><p className="eyebrow">最近预警</p><h2>为什么亮灯</h2></div>
                <button className="text-button" onClick={() => go("alerts")}>全部 {currentAlerts.length} 条</button>
              </div>
              <div className="alert-list">
                {currentAlerts.length ? currentAlerts.slice(0, 3).map((event) => <AlertCard key={event.id} event={event} />) : <Empty title="暂无可生成的真实预警" detail="当前真实数据覆盖不足；未覆盖的规则不会生成预警。" />}
              </div>
            </section>
          </div>
        )}

        {page === "watch" && (
          <div className="page-stack">
            <section className="intro-card">
                <div><Pill tone="green">先选择，再确认</Pill><h2>行业分类和股票都由你选择</h2><p>“有色金属”是把相关上市公司归到一起的行业大类，不是一只股票；输入名称、常用说法或 6 位代码后，系统会返回多个候选供你选择。</p></div>
              <span className="intro-glyph">◎</span>
            </section>
            <section className="panel">
              <form className="watch-search-form" onSubmit={searchWatchCandidates}>
                <label className="search-field">
                  <span>搜索股票或行业分类</span>
                  <div>
                    <b aria-hidden="true">⌕</b>
                    <input
                      value={watchInput}
                      onChange={(event) => setWatchInput(event.target.value)}
                      placeholder="例如：银行 / 宁德时代 / 300750"
                      aria-describedby="watch-search-help"
                    />
                    <button type="submit" disabled={searching}>
                      {searching ? "查找中…" : "查找"}
                    </button>
                  </div>
                </label>
              </form>
              <div className="search-summary" id="watch-search-help" role="status">
                <span>{watchInput.trim() ? "搜索结果" : "常用选项"}</span>
                <p>{searchMessage}</p>
              </div>
              {searchResults.length ? (
                <div className="search-results" aria-label="可选行业分类和股票">
                  {searchResults.map((result) => {
                    const key = `${result.objectType}:${result.code}`;
                    const selected =
                      selectedResult?.objectType === result.objectType &&
                      selectedResult.code === result.code;
                    const watched = isAlreadyWatched(result);
                    return (
                      <article className={selected ? "selected" : ""} key={key}>
                        <span className={`object-icon ${result.objectType === "stock" ? "stock" : ""}`}>
                          {result.objectType === "stock" ? "股" : "板"}
                        </span>
                        <div>
                          <div className="candidate-title">
                            <strong>{result.name}</strong>
                            <Pill tone={result.objectType === "sector" ? "green" : "amber"}>
                              {result.objectType === "sector" ? "行业分类" : "股票"}
                            </Pill>
                          </div>
                          <p>{result.code} · {result.classification}</p>
                          <small>{result.matchReason}</small>
                        </div>
                        <button
                          type="button"
                          className={watched ? "candidate-added" : ""}
                          disabled={watched}
                          aria-pressed={selected}
                          onClick={() => {
                            setSelectedResult(result);
                            setNewWatchTag("watch");
                          }}
                        >
                          {watched ? "已关注" : selected ? "已选择" : "选择"}
                        </button>
                      </article>
                    );
                  })}
                </div>
              ) : null}
              {selectedResult && (
                <div className="mapping-card">
                  <div className="mapping-top">
                    <span className={`object-icon ${selectedResult.objectType === "stock" ? "stock" : ""}`}>
                      {selectedResult.objectType === "stock" ? "股" : "板"}
                    </span>
                    <div>
                      <strong>你选择了：{selectedResult.name}</strong>
                      <p>{selectedResult.matchReason}</p>
                    </div>
                    <Pill tone="amber">待确认</Pill>
                  </div>
                  <dl>
                    <div><dt>数据源分类</dt><dd>{selectedResult.classification}</dd></div>
                    <div><dt>{selectedResult.objectType === "sector" ? "行业代码" : "股票代码"}</dt><dd>{selectedResult.code}</dd></div>
                    <div>
                      <dt>{selectedResult.objectType === "sector" ? "成分股数量" : "行情状态"}</dt>
                      <dd>{selectedResult.objectType === "sector" ? "待正式源确认" : "添加后读取真实快照"}</dd>
                    </div>
                  </dl>
                  <p className="plain-note">
                    人话解释：{selectedResult.objectType === "sector"
                      ? `将按“${selectedResult.classification}”里的“${selectedResult.name}”监控；成分股数量会变化，未接正式数据源前不展示猜测数字。`
                      : "这里只确认你要关注哪只 A 股；添加后读取公开页面的真实行情，读取失败时明确显示不可用。"}
                    {" "}
                    <a href={selectedResult.sourceUrl} target="_blank" rel="noreferrer">
                      查看来源 ↗
                    </a>
                  </p>
                  <div className="confirm-row">
                    <label>
                      <span>关注标签</span>
                      <select value={newWatchTag} onChange={(event) => setNewWatchTag(event.target.value as "watch" | "holding")}>
                        <option value="watch">仅关注</option>
                        <option value="holding">持有</option>
                      </select>
                    </label>
                    <div className="inline-actions">
                      <button
                        type="button"
                        className="button button-dark"
                        disabled={watchMutation?.startsWith("add:")}
                        onClick={addSelectedWatch}
                      >
                        {watchMutation?.startsWith("add:") ? "保存中…" : "确认并关注"}
                      </button>
                      <button type="button" className="button button-light" onClick={() => setSelectedResult(null)}>取消</button>
                    </div>
                  </div>
                </div>
              )}
            </section>
            <section>
              <div className="section-head"><div><p className="eyebrow">当前关注</p><h2>你选择的行业分类和股票</h2></div><Pill tone="neutral">{watchItems.length} 项</Pill></div>
              {watchItems.length ? (
                <div className="object-grid">
                  {watchItems.map((item) => (
                    <WatchObject
                      key={item.id}
                      item={item}
                      quote={stockQuotes[item.code]}
                      busy={watchMutation?.endsWith(item.id) ?? false}
                      onTag={() => changeWatchTag(item)}
                      onRemove={() => removeWatch(item)}
                    />
                  ))}
                </div>
              ) : (
                <Empty title="还没有关注对象" detail="从上面的候选中选择一个，确认后会保存到这里。" />
              )}
              {watchQuoteError && watchItems.some((item) => item.object_type === "stock") ? <p className="data-warning">{watchQuoteError}</p> : null}
              <p className="disclaimer">手填成本价只用于排序和风险提醒；系统不接券商账户、不读取持仓，也不会自动下单。</p>
            </section>
          </div>
        )}

        {page === "tasks" && (
          <div className="page-stack narrow">
            <section className="task-card">
              <TaskHeader number="A" title="周期监控" detail="盘中按固定间隔扫描；午休、周末和节假日自动跳过。" enabled={settings.periodic_monitoring_enabled} onChange={(value) => patchSettings({ periodic_monitoring_enabled: value })} />
              <div className={settings.periodic_monitoring_enabled ? "task-body" : "task-body disabled"}>
                <label className="field"><span>多久扫描一次</span><small>扫描不等于每次都推送</small><select value={settings.monitor_interval_minutes} onChange={(event) => patchSettings({ monitor_interval_minutes: Number(event.target.value) as UserSettings["monitor_interval_minutes"] })}><option value={5}>每 5 分钟（默认）</option><option value={30}>每 30 分钟</option><option value={60}>每 60 分钟</option><option value={120}>每 120 分钟</option><option value={180}>每 180 分钟</option></select></label>
                <fieldset><legend>什么情况下推送</legend><div className="choice-grid">{(Object.keys(PUSH_MODE_COPY) as Array<keyof typeof PUSH_MODE_COPY>).map((mode) => <label className={`choice-card ${settings.periodic_push_mode === mode ? "selected" : ""}`} key={mode}><input type="radio" name="push-mode" checked={settings.periodic_push_mode === mode} onChange={() => patchSettings({ periodic_push_mode: mode })} /><span><b>{PUSH_MODE_COPY[mode][0]}</b><small>{PUSH_MODE_COPY[mode][1]}</small></span></label>)}</div></fieldset>
              </div>
            </section>
            <section className="task-card">
              <TaskHeader number="B" title="关键时点扫描" detail="市场 → 板块 → 自选股三层简报；与周期扫描重合时只发一条。" enabled={settings.key_moment_monitoring_enabled} onChange={(value) => patchSettings({ key_moment_monitoring_enabled: value })} />
              <div className={settings.key_moment_monitoring_enabled ? "task-body" : "task-body disabled"}>
                <div className="time-chips">{settings.key_moments.map((time) => <span key={time}>{time}<button aria-label={`删除 ${time}`} onClick={() => patchSettings({ key_moments: settings.key_moments.filter((item) => item !== time) })}>×</button></span>)}</div>
                <div className="add-time"><input type="time" value={keyMomentDraft} onChange={(event) => setKeyMomentDraft(event.target.value)} /><button className="button button-light" onClick={() => { if (!settings.key_moments.includes(keyMomentDraft)) patchSettings({ key_moments: [...settings.key_moments, keyMomentDraft].sort() }); }}>添加时点</button></div>
              </div>
            </section>
            <section className="task-card">
              <TaskHeader number="C" title="收盘复盘" detail="15:10 数字速览；16:30 数据就绪后生成完整复盘，每天最多成功推送一次。" enabled={settings.daily_review_enabled} onChange={(value) => patchSettings({ daily_review_enabled: value })} />
              <div className={settings.daily_review_enabled ? "task-body two-fields" : "task-body two-fields disabled"}><label className="field"><span>收盘速览</span><input type="time" value={settings.quick_review_time} onChange={(event) => patchSettings({ quick_review_time: event.target.value })} /></label><label className="field"><span>完整复盘</span><input type="time" value={settings.full_review_time} onChange={(event) => patchSettings({ full_review_time: event.target.value })} /></label></div>
            </section>
            <div className="save-bar"><div><strong>{saveState}</strong><span>三条任务链互不捆绑</span></div><button className="button button-dark" onClick={saveSettings}>保存全部设置</button></div>
          </div>
        )}

        {page === "alerts" && (
          <div className="page-stack">
            <section className="toolbar">
              <div className="filter-tabs">{(["all", "danger", "warning", "notice"] as const).map((level) => <button key={level} className={alertLevel === level ? "active" : ""} onClick={() => setAlertLevel(level)}>{level === "all" ? "全部" : level === "danger" ? "高风险" : level === "warning" ? "需留意" : "一般"}</button>)}</div>
              <Pill tone="green">只显示真实数据生成的记录</Pill>
            </section>
            <section className="summary-strip"><div><strong>{visibleAlerts.length}</strong><span>条符合筛选</span></div><div><strong>{visibleAlerts.filter((event) => event.level === "danger").length}</strong><span>条高风险</span></div><div><strong>1</strong><span>批合并结果</span></div><button className="button button-dark" onClick={() => run("scan")} disabled={running === "scan"}>{running === "scan" ? "正在扫描…" : "运行一次扫描"}</button></section>
            <section className="alert-list">{visibleAlerts.length ? visibleAlerts.map((event) => <AlertCard key={event.id} event={event} expanded />) : <Empty title="当前筛选没有预警" detail="这不代表没有市场风险，只表示没有事件达到当前规则阈值。" />}</section>
          </div>
        )}

        {page === "reviews" && (
          <div className="page-stack">
            <section className="review-hero historical-review-hero">
              <div>
                <Pill tone="green">真实股票日线</Pill>
                <h2>选择一天，查看开盘前后变化</h2>
                <p>复盘范围是当前关注列表里的股票；“有色金属”等行业分类不参与单股价格计算。</p>
              </div>
              <div className="historical-date-controls">
                <label>
                  <span>复盘日期</span>
                  <input
                    type="date"
                    value={historicalDate}
                    max={shanghaiDate()}
                    onChange={(event) => {
                      setHistoricalDate(event.target.value);
                      setHistoricalReview(null);
                      setHistoricalError(null);
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="button button-dark"
                  onClick={loadHistoricalReview}
                  disabled={historicalLoading || !historicalDate}
                >
                  {historicalLoading ? "正在读取真实数据…" : "读取这一天"}
                </button>
              </div>
            </section>
            <section className="history-method panel">
              <div>
                <Pill tone="neutral">开盘前基准</Pill>
                <strong>上一交易日收盘价</strong>
                <p>用于比较隔夜到 09:30 开盘时发生了多少变化。</p>
              </div>
              <span aria-hidden="true">→</span>
              <div>
                <Pill tone="neutral">开盘后</Pill>
                <strong>09:30 开盘价与当日收盘价</strong>
                <p>公开历史源没有稳定的 09:25 集合竞价和完整分钟轨迹，因此页面不会冒充这些数据。</p>
              </div>
            </section>
            <section className="review-scope">
              <div className="section-head compact">
                <div><p className="eyebrow">本次范围</p><h2>当前关注的股票</h2></div>
                <Pill tone="neutral">{watchItems.filter((item) => item.object_type === "stock").length} 只</Pill>
              </div>
              <div className="scope-chips">
                {watchItems.filter((item) => item.object_type === "stock").map((item) => (
                  <span key={item.id}>{item.name}<small>{item.code}</small></span>
                ))}
              </div>
            </section>
            {historicalLoading ? (
              <Empty title="正在读取真实历史行情" detail="首次读取会访问公开行情页面；同一天、同一组股票再次查询会优先使用云端缓存。" />
            ) : historicalError ? (
              <Empty title="没有数据" detail={`${historicalError} 页面不会生成估算结果。`} />
            ) : historicalReview ? (
              <HistoricalReviewDocument response={historicalReview} />
            ) : (
              <Empty title="请选择日期并读取" detail="若这一天不是交易日、股票尚未上市或数据源没有返回记录，页面会明确显示“没有数据”。" />
            )}
          </div>
        )}

        {page === "notifications" && (
          <div className="page-stack narrow">
            <section className="intro-card"><div><Pill tone="amber">先真实收到，再谈自动化</Pill><h2>选择你能用的通知方式</h2><p>业务层不会直接绑定某一家厂商。密钥只放服务端，页面和浏览器都看不到。</p></div><span className="intro-glyph">↗</span></section>
            <section className="channel-list">
              <ChannelCard id="browser" title="本机浏览器通知" badge="无需账号" description="点击测试后，这台设备会弹出系统通知；它不是后台 Web Push。" selected={settings.notification_channel === "browser"} onSelect={() => patchSettings({ notification_channel: "browser" })} action={<button className="button button-light" onClick={testBrowserNotification}>测试本机通知</button>} />
              <ChannelCard id="serverchan" title="Server酱 · 个人微信" badge="推荐" description="微信扫码开通，服务端保存 SendKey。免费版每天最多 5 条。" selected={settings.notification_channel === "serverchan"} onSelect={() => patchSettings({ notification_channel: "serverchan" })} action={<Pill tone="amber">尚未配置 Secret</Pill>} />
              <ChannelCard id="email" title="邮件" badge="备用" description="支持 Resend；需要 API Key、发件域名和收件邮箱。" selected={settings.notification_channel === "email"} onSelect={() => patchSettings({ notification_channel: "email" })} action={<Pill tone="neutral">尚未配置 Secret</Pill>} />
            </section>
            <div className="save-bar"><div><strong>{saveState}</strong><span>只记录真实渠道的返回状态</span></div><div className="inline-actions">{settings.notification_channel !== "browser" ? <button className="button button-light" onClick={() => run("test_notification")} disabled={running === "test_notification"}>{running === "test_notification" ? "测试中…" : "测试当前服务端渠道"}</button> : null}<button className="button button-dark" onClick={saveSettings}>保存渠道</button></div></div>
          </div>
        )}

        {page === "costs" && (
          <div className="page-stack">
            <section className="cost-hero"><div><p className="eyebrow">2026-07-18 官方价格快照</p><h2>先算清，再开通</h2><p>推荐先用全市场实时日线快照自行计算 5 分钟变化，比完整实时分钟行情预计少 800 元/月。</p></div><div><span>推荐方案</span><strong>¥223.87<small>/月</small></strong><p>¥2,686.44 / 年</p></div></section>
            <section className="calculator panel"><div className="section-head compact"><div><p className="eyebrow">调用量计算器</p><h2>你的选择会用多少资源</h2></div><Pill tone="neutral">估算值，不等于实际账单</Pill></div><div className="calculator-controls"><label className="field"><span>扫描周期</span><select value={costInterval} onChange={(event) => setCostInterval(Number(event.target.value))}>{[5, 30, 60, 120, 180].map((value) => <option key={value} value={value}>{value} 分钟</option>)}</select></label><fieldset><legend>保存范围</legend><div className="segmented">{([["market", "全市场 5500 只"], ["sector", "板块约 400 只"], ["watch", "自选约 30 只"]] as const).map(([value, label]) => <button key={value} className={costScope === value ? "active" : ""} onClick={() => setCostScope(value)}>{label}</button>)}</div></fieldset></div><div className="estimate-grid"><div><span>每日盘中扫描</span><strong>{scans}<small>次</small></strong></div><div><span>每月盘中扫描</span><strong>{scans * 22}<small>次</small></strong></div><div><span>原始快照/月</span><strong>{formatMb(storage)}</strong></div><div><span>大模型盘中调用</span><strong>0<small>次</small></strong></div></div></section>
            <section><div className="section-head"><div><p className="eyebrow">三个方案</p><h2>从验证到高频</h2></div></div><div className="scenario-grid">{costSnapshot.scenarios.map((scenario) => <article className={scenario.id === "recommended" ? "scenario-card recommended" : "scenario-card"} key={scenario.id}>{scenario.id === "recommended" && <Pill tone="green">推荐</Pill>}<h3>{scenario.name}</h3><p>{scenario.scope}</p><strong>¥{scenario.monthly_cny.toLocaleString("zh-CN")}<small>/月</small></strong><span>约 ¥{scenario.annual_cny.toLocaleString("zh-CN")} / 年</span><ul>{scenario.included.map((item) => <li key={item}>✓ {item}</li>)}</ul><div><small>尚未开通</small><p>{scenario.not_enabled.join("、")}</p></div></article>)}</div></section>
            <section className="panel"><div className="section-head compact"><div><p className="eyebrow">官方来源</p><h2>价格从哪里来</h2></div><span className="data-time">检查于 2026-07-18</span></div><div className="source-list">{costSnapshot.sources.slice(0, 10).map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer"><span>{source.name}</span><b>打开官方页 ↗</b></a>)}</div></section>
          </div>
        )}

        {page === "status" && (
          <div className="page-stack narrow">
            <section className="status-hero"><span className="status-orbit"><i /></span><div><Pill tone="green">真实数据限定</Pill><h2>只有真实数据才生成结果</h2><p>四个主要指数、关注股票快照和历史日线来自真实公开行情；未覆盖的数据只显示不可用。</p></div></section>
            <section className="status-list">{health.length ? health.map((item) => <article key={item.id}><span className={`health-dot health-${item.status}`} /><div><strong>{item.name}</strong><p>{item.message}</p></div><Pill tone={item.status === "healthy" || item.status === "ready" ? "green" : item.status.includes("config") ? "amber" : "neutral"}>{statusLabel(item.status)}</Pill></article>) : <Empty title="正在读取状态" detail="如果长时间没有结果，请刷新页面。" />}</section>
            <section className="panel"><div className="section-head compact"><div><p className="eyebrow">安全边界</p><h2>这个产品不会做什么</h2></div></div><ul className="safety-list"><li><span>01</span>不保存券商账号密码，不接账户，不自动下单。</li><li><span>02</span>密钥只在服务端环境变量，前端包和日志不包含真实 Token。</li><li><span>03</span>数据过期时停止生成正常行情结论，最多提醒一次系统异常。</li><li><span>04</span>不把阈值或复盘包装成买卖指令、收益保证或投资建议。</li></ul></section>
          </div>
        )}
      </main>

      <nav className="mobile-nav" aria-label="手机导航">
        {NAV.slice(0, 5).map((item) => <button key={item.id} className={page === item.id ? "active" : ""} onClick={() => go(item.id)}><span>{item.icon}</span>{item.label}</button>)}
        <button className={["notifications", "costs", "status"].includes(page) ? "active" : ""} onClick={() => go(page === "notifications" ? "costs" : page === "costs" ? "status" : "notifications")}><span>•••</span>更多</button>
      </nav>

      {toast && <div className="toast" role="status"><span>✓</span>{toast}<button aria-label="关闭提示" onClick={() => setToast(null)}>×</button></div>}
    </div>
  );
}

function statusLabel(status: string) {
  const labels: Record<string, string> = { healthy: "正常", ready: "已就绪", experimental: "真实·实验", degraded: "已降级", needs_config: "待配置", configured_unverified: "待验证", failed: "异常" };
  return labels[status] ?? status;
}

function TaskHeader({ number, title, detail, enabled, onChange }: { number: string; title: string; detail: string; enabled: boolean; onChange: (value: boolean) => void }) {
  return <div className="task-head"><span>{number}</span><div><h2>{title}</h2><p>{detail}</p></div><Toggle checked={enabled} onChange={onChange} label={`${title}总开关`} /></div>;
}

function WatchObject({
  item,
  quote,
  busy,
  onTag,
  onRemove,
}: {
  item: WatchItem;
  quote?: StockQuote;
  busy: boolean;
  onTag: () => void;
  onRemove: () => void;
}) {
  const isStock = item.object_type === "stock";
  return (
    <article className={`object-card ${isStock ? "" : "sector-card"}`}>
      <div className="object-card-top">
        <span className={`object-icon ${isStock ? "stock" : ""}`}>
          {isStock ? "股" : "类"}
        </span>
        <Pill tone={item.tag === "holding" ? "amber" : "neutral"}>
          {item.tag === "holding" ? "持有" : "仅关注"}
        </Pill>
      </div>
      <h3>{item.name}</h3>
      <p>
        {isStock ? item.code : `申万一级行业 · ${item.code}`}
        {item.cost_price ? ` · 手填成本价 ${item.cost_price}` : ""}
      </p>
      {!isStock ? (
        <div className="sector-explainer">
          <Pill tone="green">行业分类</Pill>
          <strong>不是单只股票</strong>
          <small>它代表一组相关上市公司，用于汇总观察；没有一个可以直接展示的单一股价。</small>
        </div>
      ) : quote ? (
        <div className="object-quote">
          <strong>¥{quote.value.toFixed(2)}</strong>
          <b className={quote.changePct >= 0 ? "up" : "down"}>
            {signed(quote.changePct)}
          </b>
          <small>真实快照 · {quote.asOf.slice(5, 16).replace("T", " ")}</small>
        </div>
      ) : (
        <div className="object-quote pending">
          <strong>真实行情读取中</strong>
          <small>读取失败时明确显示没有数据</small>
        </div>
      )}
      <div className="object-actions">
        <button type="button" onClick={onTag} disabled={busy}>
          {item.tag === "holding" ? "改为仅关注" : "标记持有"}
        </button>
        <button type="button" className="remove" onClick={onRemove} disabled={busy}>
          {busy ? "处理中…" : "移除"}
        </button>
      </div>
    </article>
  );
}

function AlertCard({ event, expanded = false }: { event: AlertEvent; expanded?: boolean }) {
  return <article className={`alert-card alert-${event.level}`}><div className="alert-marker"><span>{event.level === "danger" ? "▲" : event.level === "warning" ? "◆" : "●"}</span></div><div className="alert-main"><div className="alert-title"><div><Pill tone={event.objectType === "market" ? "amber" : event.objectType === "stock" ? "green" : "neutral"}>{event.objectType === "market" ? "市场" : event.objectType === "sector" ? "板块" : event.objectType === "system" ? "系统" : "个股"}</Pill><h3>{event.title}</h3></div><time>{event.dataTime.slice(11, 16)}</time></div><p>{event.reason}</p>{expanded && <dl className="evidence-grid"><div><dt>当前值</dt><dd>{event.currentValue}</dd></div><div><dt>触发阈值</dt><dd>{event.threshold}</dd></div><div><dt>数据来源</dt><dd>{event.provider}</dd></div><div><dt>风险等级</dt><dd>{event.level === "danger" ? "高风险" : event.level === "warning" ? "需留意" : "一般"}</dd></div></dl>}</div></article>;
}

type AvailableHistoricalMovement = HistoricalStockMovement & {
  status: "available";
  tradeDate: string;
  previousTradeDate: string;
  previousClose: number;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  openGapPct: number;
  intradayPct: number;
  dayChangePct: number;
};

function isAvailableMovement(
  item: HistoricalStockMovement,
): item is AvailableHistoricalMovement {
  return (
    item.status === "available" &&
    typeof item.previousClose === "number" &&
    typeof item.open === "number" &&
    typeof item.close === "number" &&
    typeof item.high === "number" &&
    typeof item.low === "number" &&
    typeof item.volume === "number" &&
    typeof item.openGapPct === "number" &&
    typeof item.intradayPct === "number" &&
    typeof item.dayChangePct === "number" &&
    typeof item.tradeDate === "string" &&
    typeof item.previousTradeDate === "string"
  );
}

function HistoricalReviewDocument({
  response,
}: {
  response: HistoricalReviewResponse;
}) {
  const { historical } = response;
  const available = historical.items.filter(isAvailableMovement);
  const up = available.filter((item) => item.dayChangePct > 0.005).length;
  const down = available.filter((item) => item.dayChangePct < -0.005).length;
  const flat = available.length - up - down;
  const average = available.length
    ? available.reduce((sum, item) => sum + item.dayChangePct, 0) /
      available.length
    : 0;

  return (
    <article className="review-document historical-document">
      <header>
        <span>关注股票历史复盘</span>
        <b>{historical.tradeDate}</b>
        <small>
          {response.cacheHit ? "已使用云端缓存" : "刚刚读取真实源"} ·{" "}
          {historical.priceAdjustment}
        </small>
      </header>
      <section className="historical-headline">
        <div>
          <p className="eyebrow">一句话数据结论</p>
          <h2>{historical.summary.headline}</h2>
        </div>
        <div className="history-metrics">
          <span><small>有数据</small><strong>{available.length}/{historical.requestedStockCount}</strong></span>
          <span><small>上涨 / 下跌</small><strong>{up} / {down}</strong></span>
          <span><small>基本持平</small><strong>{flat}</strong></span>
          <span><small>样本平均</small><strong className={average >= 0 ? "up" : "down"}>{signed(average)}</strong></span>
        </div>
      </section>
      <section>
        <div className="section-head compact">
          <div><p className="eyebrow">逐只真实数据</p><h2>上一收盘 → 开盘 → 收盘</h2></div>
          <Pill tone={historical.status === "complete" ? "green" : "amber"}>
            {historical.status === "complete" ? "数据完整" : historical.status === "partial" ? "部分有数据" : "没有数据"}
          </Pill>
        </div>
        <div className="history-stock-grid">
          {historical.items.map((item) =>
            isAvailableMovement(item) ? (
              <HistoricalStockCard key={item.code} item={item} />
            ) : (
              <article className="history-stock-card no-data-card" key={item.code}>
                <div className="history-stock-title">
                  <div><strong>{item.name}</strong><small>{item.code}</small></div>
                  <Pill tone="neutral">没有数据</Pill>
                </div>
                <p>{item.message ?? "数据源没有返回可验证的真实记录。"}</p>
              </article>
            ),
          )}
        </div>
      </section>
      <section className="history-review-sections">
        <div><p className="eyebrow">已确认事实</p><ul>{historical.summary.facts.map((item) => <li key={item}>{item}</li>)}</ul></div>
        <div><p className="eyebrow">数据提示 · 非操作建议</p><ul>{historical.summary.observations.map((item) => <li key={item}>{item}</li>)}</ul></div>
        <div><p className="eyebrow">暂无可验证原因</p><ul>{historical.summary.unknowns.map((item) => <li key={item}>{item}</li>)}</ul></div>
        <div><p className="eyebrow">之后继续观察</p><ol>{historical.summary.nextChecks.map((item) => <li key={item}>{item}</li>)}</ol></div>
      </section>
      <footer>
        <p>读取时间：{historical.fetchedAt.slice(0, 19).replace("T", " ")} UTC；缓存有效至 {response.cacheExpiresAt.slice(0, 19).replace("T", " ")} UTC。</p>
        <p>数据源：<a href={historical.sourceUrl} target="_blank" rel="noreferrer">{historical.provider} ↗</a>。本页只呈现价格事实和温和提示，不构成证券投资咨询或买卖建议。</p>
      </footer>
    </article>
  );
}

function HistoricalStockCard({ item }: { item: AvailableHistoricalMovement }) {
  return (
    <article className="history-stock-card">
      <div className="history-stock-title">
        <div><strong>{item.name}</strong><small>{item.code}</small></div>
        <b className={item.dayChangePct >= 0 ? "up" : "down"}>{signed(item.dayChangePct)}</b>
      </div>
      <div className="price-flow">
        <span>
          <small>{item.previousTradeDate}<br />上一收盘</small>
          <strong>¥{item.previousClose.toFixed(2)}</strong>
        </span>
        <i aria-hidden="true">→</i>
        <span>
          <small>09:30<br />开盘</small>
          <strong>¥{item.open.toFixed(2)}</strong>
          <em className={item.openGapPct >= 0 ? "up" : "down"}>{signed(item.openGapPct)}</em>
        </span>
        <i aria-hidden="true">→</i>
        <span>
          <small>15:00<br />收盘</small>
          <strong>¥{item.close.toFixed(2)}</strong>
          <em className={item.intradayPct >= 0 ? "up" : "down"}>{signed(item.intradayPct)}</em>
        </span>
      </div>
      <dl className="history-range">
        <div><dt>最高</dt><dd>¥{item.high.toFixed(2)}</dd></div>
        <div><dt>最低</dt><dd>¥{item.low.toFixed(2)}</dd></div>
        <div><dt>成交量</dt><dd>{Math.round(item.volume).toLocaleString("zh-CN")}</dd></div>
      </dl>
    </article>
  );
}

function ChannelCard({ id, title, badge, description, selected, onSelect, action }: { id: string; title: string; badge: string; description: string; selected: boolean; onSelect: () => void; action: React.ReactNode }) {
  return <article className={`channel-card ${selected ? "selected" : ""}`}><label><input type="radio" name="notification-channel" value={id} checked={selected} onChange={onSelect} /><span className="radio-mark" /><div><div><h3>{title}</h3><Pill tone={badge === "推荐" ? "green" : "neutral"}>{badge}</Pill></div><p>{description}</p></div></label>{action}</article>;
}
