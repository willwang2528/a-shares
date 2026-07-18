"use client";

import { useEffect, useMemo, useState } from "react";
import costSnapshot from "@/data/cost-snapshot.json";
import {
  DEFAULT_SETTINGS,
  estimateStorageMb,
  evaluateRules,
  generateDeterministicReview,
  getFixture,
  getMarketSessionState,
  highestRisk,
  nextTaskLabel,
  scansPerTradingDay,
  type AlertEvent,
  type DailyReview,
  type MarketSnapshot,
  type RiskLevel,
  type UserSettings,
} from "@/lib/domain";

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
  const [fixtureId, setFixtureId] = useState("market_drop");
  const [snapshot, setSnapshot] = useState<MarketSnapshot>(() => getFixture("market_drop"));
  const [dataMode, setDataMode] = useState<"real" | "demo">("real");
  const [marketLoading, setMarketLoading] = useState(true);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [reviews, setReviews] = useState<DailyReview[]>([]);
  const [health, setHealth] = useState<HealthItem[]>([]);
  const [saveState, setSaveState] = useState("正在连接云端保存…");
  const [running, setRunning] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sectorInput, setSectorInput] = useState("");
  const [sectorMatch, setSectorMatch] = useState(false);
  const [sectorConfirmed, setSectorConfirmed] = useState(true);
  const [keyMomentDraft, setKeyMomentDraft] = useState("10:30");
  const [alertLevel, setAlertLevel] = useState<"all" | RiskLevel>("all");
  const [costInterval, setCostInterval] = useState(5);
  const [costScope, setCostScope] = useState<"market" | "sector" | "watch">("market");

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
      .then(async (response) => ({ ok: response.ok, data: await response.json() }))
      .then(({ ok, data }) => {
        if (data.settings) setSettings(data.settings);
        if (Array.isArray(data.alerts) && data.alerts.length) setAlerts(data.alerts);
        if (Array.isArray(data.reviews) && data.reviews.length) setReviews(data.reviews);
        setSaveState(ok ? "已连接云端保存" : "当前为会话内演示配置");
      })
      .catch(() => setSaveState("当前为会话内演示配置"));
    fetch("/api/health", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => setHealth(data.services ?? []))
      .catch(() => setHealth([]));
    fetch("/api/market", { cache: "no-store" })
      .then(async (response) => ({ ok: response.ok, data: await response.json() }))
      .then(({ ok, data }) => {
        if (!ok || !data.snapshot) throw new Error(data.message);
        setSnapshot(data.snapshot);
        setDataMode("real");
        setAlerts(evaluateRules(data.snapshot));
        setMarketError(null);
      })
      .catch(() => {
        setDataMode("demo");
        setMarketError("真实指数读取失败，当前保留 Mock 演示且不冒充真实行情。");
      })
      .finally(() => setMarketLoading(false));
  }, []);

  async function refreshRealMarket() {
    setMarketLoading(true);
    try {
      const response = await fetch("/api/market", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.snapshot) throw new Error(data.message);
      setSnapshot(data.snapshot);
      setDataMode("real");
      setAlerts(evaluateRules(data.snapshot, settings));
      setMarketError(null);
      setToast(`真实指数已更新：${data.snapshot.asOf.slice(0, 16).replace("T", " ")}`);
    } catch (error) {
      setMarketError(error instanceof Error ? error.message : "真实指数读取失败。");
      setToast("真实指数读取失败；页面不会用 Mock 冒充真实行情。");
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
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      setSettings(data.settings);
      setSaveState("刚刚已保存");
      setToast("设置已经保存，刷新页面也会保留。");
    } catch {
      setSaveState("保存失败，请稍后重试");
      setToast("保存失败，原有设置没有被覆盖。");
    }
  }

  async function run(type: "scan" | "review" | "test_notification") {
    setRunning(type);
    try {
      const response = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          fixtureId: dataMode === "demo" ? fixtureId : undefined,
          force: true,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message);
      if (type === "scan") {
        const nextAlerts = result.payload?.events ?? currentAlerts;
        if (result.payload?.snapshot) setSnapshot(result.payload.snapshot);
        setAlerts(nextAlerts);
        setToast(
          dataMode === "real"
            ? `真实指数扫描完成；当前覆盖不足，未运行全市场风险规则。`
            : `Mock 扫描完成：发现 ${nextAlerts.length} 条事件。`,
        );
      } else if (type === "review") {
        const review = result.payload?.review ?? generateDeterministicReview(snapshot);
        setReviews((current) => [review, ...current.filter((item) => item.tradeDate !== review.tradeDate)]);
        setToast("复盘已生成并保存；模型未配置时自动使用数字型版本。");
      } else {
        setToast(result.payload?.delivery?.message ?? "测试通知已写入日志。");
      }
      const healthResponse = await fetch("/api/health", { cache: "no-store" });
      const healthData = await healthResponse.json();
      setHealth(healthData.services ?? []);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "任务失败，请检查系统状态。");
    } finally {
      setRunning(null);
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
    await registration.showNotification("盘面守望测试通知", {
      body: "如果你看到这条消息，说明这台设备的浏览器通知可用。",
      tag: "market-watch-test",
    });
    setToast("已发出一条本机系统通知。它不是后台 Web Push。");
  }

  const scopeCount = costScope === "market" ? 5500 : costScope === "sector" ? 400 : 30;
  const storage = estimateStorageMb(costInterval, scopeCount);
  const scans = scansPerTradingDay(costInterval);

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="主要导航">
        <button className="brand" onClick={() => go("home")} aria-label="回到首页">
          <span className="brand-mark">守</span>
          <span><strong>盘面守望</strong><small>A 股风险提醒</small></span>
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
          <Pill tone={dataMode === "real" ? "green" : "amber"}>
            {dataMode === "real" ? "真实指数·实验" : "Mock 演示"}
          </Pill>
          <p>
            {dataMode === "real"
              ? "主要指数来自公开行情页面；完整全市场数据仍待正式授权。"
              : "当前数据仅用于测试，不代表真实市场。"}
          </p>
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
                    {dataMode === "real" ? "最近交易日真实快照" : "Mock 测试场景"} ·{" "}
                    {snapshot.asOf.slice(0, 16).replace("T", " ")}
                  </span>
                </div>
                <h2>
                  {dataMode === "real"
                    ? marketLoading
                      ? "正在读取真实指数"
                      : "真实指数已更新"
                    : `盘面${riskInfo.label}`}
                </h2>
                <p>
                  {dataMode === "real"
                    ? "当前真实数据覆盖四个主要指数。市场宽度、板块和个股尚未接入正式授权数据，因此不生成完整风险结论。"
                    : `${riskInfo.detail}。当前是 Mock 演示数据，只用于验证规则，不代表真实市场。`}
                </p>
                {marketError ? <p className="source-warning">{marketError}</p> : null}
                <div className="hero-actions">
                  <button className="button button-dark" onClick={() => refreshRealMarket()} disabled={marketLoading}>
                    {marketLoading ? "正在更新…" : "刷新真实数据"}
                  </button>
                  <button className="button button-ghost" onClick={() => go(dataMode === "real" ? "status" : "alerts")}>
                    {dataMode === "real" ? "查看覆盖说明" : "查看触发依据"}
                  </button>
                </div>
              </div>
              <div
                className="breadth-ring"
                aria-label={dataMode === "real" ? "四个真实主要指数" : `下跌 ${snapshot.breadth.down} 家`}
              >
                <strong>
                  {dataMode === "real"
                    ? snapshot.indices.length
                    : `${Math.round((snapshot.breadth.down / (snapshot.breadth.up + snapshot.breadth.down + snapshot.breadth.flat)) * 100)}%`}
                </strong>
                <span>{dataMode === "real" ? "真实指数" : "股票下跌"}</span>
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
                  {dataMode === "real" ? "真实数据·实验源" : "Mock"}
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

            {dataMode === "real" ? (
              <section className="two-column">
                <div className="panel coverage-panel">
                  <Pill tone="amber">尚未覆盖</Pill>
                  <h2>市场宽度与涨跌停</h2>
                  <p>公开指数快照不包含全市场上涨、下跌、涨停和跌停家数。正式数据接入前，这里不显示 Mock 数字，也不触发相关规则。</p>
                </div>
                <div className="panel coverage-panel">
                  <Pill tone="amber">尚未覆盖</Pill>
                  <h2>板块与自选股</h2>
                  <p>板块成分、个股行情和数据源当日涨跌停价仍需正式授权。当前关注对象会保留，但不会混入演示价格。</p>
                </div>
              </section>
            ) : (
            <section className="two-column">
              <div>
                <div className="section-head compact">
                  <div><p className="eyebrow">市场宽度</p><h2>今天有多弱？</h2></div>
                </div>
                <div className="breadth-card">
                  <div className="breadth-bar" aria-label="上涨下跌家数比例">
                    <i style={{ width: `${(snapshot.breadth.up / 5221) * 100}%` }} />
                    <b style={{ width: `${(snapshot.breadth.down / 5221) * 100}%` }} />
                  </div>
                  <div className="breadth-numbers">
                    <span><i className="dot dot-up" />上涨<strong>{snapshot.breadth.up}</strong></span>
                    <span><i className="dot dot-down" />下跌<strong>{snapshot.breadth.down}</strong></span>
                    <span><i className="dot dot-flat" />平盘<strong>{snapshot.breadth.flat}</strong></span>
                  </div>
                  <div className="limit-row">
                    <span>涨停 <b className="up">{snapshot.breadth.limitUp}</b></span>
                    <span>跌停 <b className="down">{snapshot.breadth.limitDown}</b></span>
                  </div>
                </div>
              </div>
              <div>
                <div className="section-head compact">
                  <div><p className="eyebrow">三层关注</p><h2>板块与自选</h2></div>
                  <button className="text-button" onClick={() => go("watch")}>管理</button>
                </div>
                <div className="watch-list">
                  {snapshot.sectors.map((sector) => (
                    <article key={sector.code}>
                      <span className="object-icon">板</span>
                      <div><strong>{sector.name}</strong><small>{sector.source} · {sector.memberCount} 只</small></div>
                      <b className={sector.changePct >= 0 ? "up" : "down"}>{signed(sector.changePct)}</b>
                    </article>
                  ))}
                  {snapshot.stocks.slice(0, 2).map((stock) => (
                    <article key={stock.code}>
                      <span className="object-icon stock">股</span>
                      <div><strong>{stock.name}</strong><small>{stock.code}</small></div>
                      <b className={stock.changePct >= 0 ? "up" : "down"}>{signed(stock.changePct)}</b>
                    </article>
                  ))}
                </div>
              </div>
            </section>
            )}

            <section>
              <div className="section-head">
                <div><p className="eyebrow">最近预警</p><h2>为什么亮灯</h2></div>
                <button className="text-button" onClick={() => go("alerts")}>全部 {currentAlerts.length} 条</button>
              </div>
              <div className="alert-list">
                {currentAlerts.length ? currentAlerts.slice(0, 3).map((event) => <AlertCard key={event.id} event={event} />) : <Empty title="未运行完整风险判断" detail={dataMode === "real" ? "真实数据当前只覆盖指数；需要全市场、板块和个股授权数据后才能运行完整规则。" : "当前 Mock 场景没有事件达到阈值。"} />}
              </div>
            </section>
          </div>
        )}

        {page === "watch" && (
          <div className="page-stack">
            <section className="intro-card">
              <div><Pill tone="green">先确认再添加</Pill><h2>告诉我你关心什么</h2><p>输入“有色金属”这类自然语言后，系统会展示匹配分类、代码和成分股数量，不会静默猜测。</p></div>
              <span className="intro-glyph">◎</span>
            </section>
            <section className="panel">
              <label className="search-field">
                <span>搜索股票或板块</span>
                <div><b aria-hidden="true">⌕</b><input value={sectorInput} onChange={(event) => setSectorInput(event.target.value)} placeholder="例如：有色金属 / 601600" /><button onClick={() => setSectorMatch(true)}>查找</button></div>
              </label>
              {sectorMatch && (
                <div className="mapping-card">
                  <div className="mapping-top"><span className="object-icon">板</span><div><strong>匹配到：有色金属</strong><p>输入内容：{sectorInput || "有色金属"}</p></div><Pill tone="amber">待确认</Pill></div>
                  <dl><div><dt>数据源分类</dt><dd>申万一级行业</dd></div><div><dt>指数代码</dt><dd>SW-801050</dd></div><div><dt>成分股</dt><dd>134 只</dd></div></dl>
                  <p className="plain-note">人话解释：系统会按申万行业里的“有色金属”监控，而不是把名称相似的概念板块混进来。</p>
                  <div className="inline-actions"><button className="button button-dark" onClick={() => { setSectorConfirmed(true); setSectorMatch(false); setToast("已确认板块映射。"); }}>确认并关注</button><button className="button button-light" onClick={() => setSectorMatch(false)}>取消</button></div>
                </div>
              )}
            </section>
            <section>
              <div className="section-head"><div><p className="eyebrow">当前关注</p><h2>板块和股票</h2></div><Pill tone="neutral">3 项</Pill></div>
              <div className="object-grid">
                {sectorConfirmed && <WatchObject type="sector" name="有色金属" code="申万一级 · SW-801050" tag="仅关注" value="-3.42%" tone="down" />}
                <WatchObject type="stock" name="中国铝业" code="601600.SH · 成本价 7.86" tag="持有" value="-9.54%" tone="down" />
                <WatchObject type="stock" name="五粮液" code="000858.SZ" tag="仅关注" value="-5.76%" tone="down" />
              </div>
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
              <label className="scenario-select"><span>Mock 测试场景</span><select value={fixtureId} onChange={(event) => { const next = getFixture(event.target.value); setFixtureId(event.target.value); setSnapshot(next); setDataMode("demo"); setAlerts(evaluateRules(next, settings)); }}><option value="market_drop">普通交易日大跌</option><option value="limit_wave">跌停封住 / 打开</option><option value="normal">无异常交易日</option><option value="provider_failure">行情源故障</option></select></label>
            </section>
            <section className="summary-strip"><div><strong>{visibleAlerts.length}</strong><span>条符合筛选</span></div><div><strong>{visibleAlerts.filter((event) => event.level === "danger").length}</strong><span>条高风险</span></div><div><strong>1</strong><span>批合并结果</span></div><button className="button button-dark" onClick={() => run("scan")} disabled={running === "scan"}>{running === "scan" ? "正在扫描…" : "运行一次扫描"}</button></section>
            <section className="alert-list">{visibleAlerts.length ? visibleAlerts.map((event) => <AlertCard key={event.id} event={event} expanded />) : <Empty title="当前筛选没有预警" detail="这不代表没有市场风险，只表示没有事件达到当前规则阈值。" />}</section>
          </div>
        )}

        {page === "reviews" && (
          <div className="page-stack">
            <section className="review-hero"><div><Pill tone="green">结构化复盘</Pill><h2>{reviews[0]?.tradeDate ?? "尚未生成"}</h2><p>{reviews[0]?.conclusion}</p></div><button className="button button-dark" onClick={() => run("review")} disabled={running === "review"}>{running === "review" ? "生成中…" : dataMode === "real" ? "用真实指数生成" : "用 Mock 场景生成"}</button></section>
            {reviews[0] ? <ReviewDocument review={reviews[0]} snapshotProvider={snapshot.provider} /> : <Empty title="还没有复盘" detail="收盘数据就绪后会自动生成，也可以用 Mock 场景手动测试。" />}
          </div>
        )}

        {page === "notifications" && (
          <div className="page-stack narrow">
            <section className="intro-card"><div><Pill tone="amber">先真实收到，再谈自动化</Pill><h2>选择你能用的通知方式</h2><p>业务层不会直接绑定某一家厂商。密钥只放服务端，页面和浏览器都看不到。</p></div><span className="intro-glyph">↗</span></section>
            <section className="channel-list">
              <ChannelCard id="browser" title="本机浏览器通知" badge="无需账号" description="点击测试后，这台设备会弹出系统通知；它不是后台 Web Push。" selected={settings.notification_channel === "browser"} onSelect={() => patchSettings({ notification_channel: "browser" })} action={<button className="button button-light" onClick={testBrowserNotification}>测试本机通知</button>} />
              <ChannelCard id="serverchan" title="Server酱 · 个人微信" badge="推荐" description="微信扫码开通，服务端保存 SendKey。免费版每天最多 5 条。" selected={settings.notification_channel === "serverchan"} onSelect={() => patchSettings({ notification_channel: "serverchan" })} action={<Pill tone="amber">尚未配置 Secret</Pill>} />
              <ChannelCard id="email" title="邮件" badge="备用" description="支持 Resend；需要 API Key、发件域名和收件邮箱。" selected={settings.notification_channel === "email"} onSelect={() => patchSettings({ notification_channel: "email" })} action={<Pill tone="neutral">尚未配置 Secret</Pill>} />
              <ChannelCard id="simulation" title="模拟发送日志" badge="当前可用" description="不会发到外部，只验证合并、去重、重试和发送历史。" selected={settings.notification_channel === "simulation"} onSelect={() => patchSettings({ notification_channel: "simulation" })} action={<Pill tone="green">已就绪</Pill>} />
            </section>
            <div className="save-bar"><div><strong>{saveState}</strong><span>测试不会绕过任务总开关</span></div><div className="inline-actions"><button className="button button-light" onClick={() => run("test_notification")} disabled={running === "test_notification"}>{running === "test_notification" ? "测试中…" : "测试当前服务端渠道"}</button><button className="button button-dark" onClick={saveSettings}>保存渠道</button></div></div>
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
            <section className="status-hero"><span className="status-orbit"><i /></span><div><Pill tone="green">真实指数已接通</Pill><h2>真实数据优先，Mock 只做测试</h2><p>四个主要指数使用真实公开行情快照；完整市场、板块和个股仍等待正式授权，不会与 Mock 混合。</p></div></section>
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
  const labels: Record<string, string> = { healthy: "正常", ready: "已就绪", experimental: "真实·实验", mock: "Mock", degraded: "已降级", simulation: "模拟", needs_config: "待配置", configured_unverified: "待验证", failed: "异常" };
  return labels[status] ?? status;
}

function TaskHeader({ number, title, detail, enabled, onChange }: { number: string; title: string; detail: string; enabled: boolean; onChange: (value: boolean) => void }) {
  return <div className="task-head"><span>{number}</span><div><h2>{title}</h2><p>{detail}</p></div><Toggle checked={enabled} onChange={onChange} label={`${title}总开关`} /></div>;
}

function WatchObject({ type, name, code, tag, value, tone }: { type: "sector" | "stock"; name: string; code: string; tag: string; value: string; tone: string }) {
  return <article className="object-card"><div className="object-card-top"><span className={`object-icon ${type === "stock" ? "stock" : ""}`}>{type === "stock" ? "股" : "板"}</span><Pill tone={tag === "持有" ? "amber" : "neutral"}>{tag}</Pill></div><h3>{name}</h3><p>{code}</p><b className={tone}>{value}</b><button aria-label={`管理 ${name}`}>管理</button></article>;
}

function AlertCard({ event, expanded = false }: { event: AlertEvent; expanded?: boolean }) {
  return <article className={`alert-card alert-${event.level}`}><div className="alert-marker"><span>{event.level === "danger" ? "▲" : event.level === "warning" ? "◆" : "●"}</span></div><div className="alert-main"><div className="alert-title"><div><Pill tone={event.objectType === "market" ? "amber" : event.objectType === "stock" ? "green" : "neutral"}>{event.objectType === "market" ? "市场" : event.objectType === "sector" ? "板块" : event.objectType === "system" ? "系统" : "个股"}</Pill><h3>{event.title}</h3></div><time>{event.dataTime.slice(11, 16)}</time></div><p>{event.reason}</p>{expanded && <dl className="evidence-grid"><div><dt>当前值</dt><dd>{event.currentValue}</dd></div><div><dt>触发阈值</dt><dd>{event.threshold}</dd></div><div><dt>数据来源</dt><dd>{event.provider}</dd></div><div><dt>风险等级</dt><dd>{event.level === "danger" ? "高风险" : event.level === "warning" ? "需留意" : "一般"}</dd></div></dl>}</div></article>;
}

function ReviewDocument({ review, snapshotProvider }: { review: DailyReview; snapshotProvider: string }) {
  return <article className="review-document"><header><span>每日盘面复盘</span><b>{review.tradeDate}</b><small>生成于 {review.generatedAt.slice(11, 16)} · {review.modelStatus === "not_used" ? "确定性数字版" : "模型辅助版"}</small></header><section><p className="eyebrow">一句话结论</p><h2>{review.conclusion}</h2></section><section className="review-columns"><div><p className="eyebrow">已确认事实</p><ul>{review.facts.map((item) => <li key={item}>{item}</li>)}</ul></div><div><p className="eyebrow">可能解释</p><ul>{review.possibleExplanations.map((item) => <li key={item}>{item}</li>)}</ul></div><div><p className="eyebrow">暂无可验证原因</p><ul>{review.unknowns.map((item) => <li key={item}>{item}</li>)}</ul></div></section><section><p className="eyebrow">下一交易日继续观察</p><ol>{review.nextWatch.map((item) => <li key={item}>{item}</li>)}</ol></section><footer><p>{review.integrity}</p><p>页面数据源：{snapshotProvider}。本工具提供行情信息和风险提醒，不构成证券投资咨询或买卖建议。</p></footer></article>;
}

function ChannelCard({ id, title, badge, description, selected, onSelect, action }: { id: string; title: string; badge: string; description: string; selected: boolean; onSelect: () => void; action: React.ReactNode }) {
  return <article className={`channel-card ${selected ? "selected" : ""}`}><label><input type="radio" name="notification-channel" value={id} checked={selected} onChange={onSelect} /><span className="radio-mark" /><div><div><h3>{title}</h3><Pill tone={badge === "推荐" ? "green" : "neutral"}>{badge}</Pill></div><p>{description}</p></div></label>{action}</article>;
}
