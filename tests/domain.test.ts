import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SETTINGS,
  estimateStorageMb,
  evaluateRules,
  generateDeterministicReview,
  getDueBundle,
  getMarketSessionState,
  scansPerTradingDay,
  shouldPush,
  type MarketSnapshot,
} from "../lib/domain.ts";
import realSnapshot from "../data/last-real-index-snapshot.json" with { type: "json" };

const recordedRealSnapshot = realSnapshot as MarketSnapshot;

function cnDate(value: string) {
  return new Date(`${value}+08:00`);
}

test("supports all required monitoring intervals", () => {
  assert.deepEqual(
    [5, 30, 60, 120, 180].map((interval) => scansPerTradingDay(interval)),
    [48, 8, 4, 2, 2],
  );
});

test("recognizes weekend, official holiday, lunch and trading boundaries", () => {
  assert.equal(getMarketSessionState(cnDate("2026-07-18T10:00:00")).code, "non_trading_day");
  assert.equal(getMarketSessionState(cnDate("2026-10-02T10:00:00")).code, "non_trading_day");
  assert.equal(getMarketSessionState(cnDate("2026-07-17T09:29:00")).code, "before_open");
  assert.equal(getMarketSessionState(cnDate("2026-07-17T09:30:00")).code, "morning");
  assert.equal(getMarketSessionState(cnDate("2026-07-17T11:30:00")).code, "lunch_break");
  assert.equal(getMarketSessionState(cnDate("2026-07-17T13:00:00")).code, "afternoon");
  assert.equal(getMarketSessionState(cnDate("2026-07-17T15:00:00")).code, "closed");
});

test("does not schedule periodic work during the lunch break", () => {
  const due = getDueBundle(cnDate("2026-07-17T12:00:00"), DEFAULT_SETTINGS);
  assert.equal(due.due, false);
  assert.match(due.skipReason ?? "", /午间休市/);
});

test("merges periodic and key-moment triggers into one due bundle", () => {
  const due = getDueBundle(
    cnDate("2026-07-17T14:30:00"),
    DEFAULT_SETTINGS,
    "2026-07-17T14:25:00+08:00",
  );
  assert.equal(due.due, true);
  assert.equal(due.merged, true);
  assert.deepEqual(due.triggers, ["periodic", "key_moment"]);
});

test("implements event_only, interval_digest and both push modes", () => {
  const realEvents = evaluateRules(recordedRealSnapshot);
  assert.equal(realEvents.length, 0);
  assert.equal(shouldPush("event_only", realEvents), false);
  assert.equal(shouldPush("interval_digest", realEvents), true);
  assert.equal(shouldPush("both", realEvents), true);
});

test("real-data review separates facts, possible explanations and unknowns", () => {
  const review = generateDeterministicReview(recordedRealSnapshot);
  assert.ok(review.facts.length >= 4);
  assert.ok(review.possibleExplanations.length > 0);
  assert.ok(review.unknowns.length > 0);
  assert.equal(review.modelStatus, "not_used");
});

test("cost storage estimate changes with interval and scope", () => {
  const fiveMinuteMarket = estimateStorageMb(5, 5500);
  const thirtyMinuteWatch = estimateStorageMb(30, 30);
  assert.ok(fiveMinuteMarket > 900);
  assert.ok(thirtyMinuteWatch < 1);
  assert.ok(fiveMinuteMarket > thirtyMinuteWatch * 1000);
});

test("recorded real index data does not create unsupported alerts", () => {
  assert.deepEqual(evaluateRules(recordedRealSnapshot), []);
});
