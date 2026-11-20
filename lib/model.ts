// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// The question the board answers is narrow and literal: if a protocol's record stayed exactly as the
// snapshot shows it, what would the token it may one day issue be worth, and what should a reader do
// about it now? That is a valuation of a *claim on a protocol's future*, not a forecast of whether or
// when a token appears. Everything below is derived from the snapshot's own ten fields.
//
//   base        = tvl_usd x BASE_MULTIPLE
//   category    = the protocol's category, valued against the whole universe's category mix
//   growth      = change_7d, clamped, weighted, and read *relative* to its category's own median
//   patience    = how long it has run with no token: the longer the record, the stronger the claim
//   breadth     = how many chains the record spans: more chains, more surface to farm
//
//   implied = base x category x growth x patience x breadth
//
// No protocol name is special-cased. Every constant is stated on the dashboard, and the same function
// scores every row, which is what makes the ranking an argument a reader can check rather than a list.
//
// A protocol is pre-token when its record carries no market cap, no CoinGecko id and no symbol. The
// snapshot never says a protocol *has* no token — only that it records none — so the board says
// "records no token" wherever a reader would otherwise read a claim the data does not make.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  relative_growth_weight: number;
  patience_floor: number;
  patience_range: number;
  patience_days: number;
  unknown_age_days: number;
  category_weight: number;
  breadth_weight: number;
  breadth_cap: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.28,
  growth_weight: 0.45,
  growth_floor: -60,
  growth_cap: 120,
  relative_growth_weight: 0.35,
  patience_floor: 0.55,
  patience_range: 0.75,
  patience_days: 1095,
  unknown_age_days: 240,
  category_weight: 0.5,
  breadth_weight: 0.06,
  breadth_cap: 1.25,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 360;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    relative_growth_pct: number;
    relative_multiplier: number;
    patience_multiplier: number;
    category_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  growth_multiplier: number;
  relative_multiplier: number;
  patience_multiplier: number;
  category_multiplier: number;
  breadth_multiplier: number;
  on_watchlist: boolean;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/**
 * The board's own calibration: the multiple that turns a protocol's TVL into a token value, measured
 * from the snapshot itself rather than picked. The live-token protocols in the same snapshot show what
 * the market actually pays for a dollar of TVL, so their median market-cap-to-TVL ratio is the board's
 * base multiple. A pre-token claim is then valued on the same scale as the market's own values, which
 * is the only scale the snapshot can defend.
 */
export interface Calibration {
  /** The live-token protocols the ratio was measured on. */
  sample: number;
  /** Median market cap over TVL across that sample. */
  median_ratio: number;
  /** The quartiles, so a reader sees the spread the median sits in. */
  p25_ratio: number;
  p75_ratio: number;
  /** The percentile of the sample the board used, and the multiple it produced. */
  percentile: number;
  base_multiple: number;
  /** The TVL floor a protocol needed to enter the sample. */
  min_tvl_usd: number;
}

/** One category's derived prior, as the dashboard's methodology panel shows it. */
export interface CategoryPrior {
  category: string;
  protocols: number;
  median_tvl_usd: number;
  multiplier: number;
}

/** Everything the dashboard needs: the board, the live set, the priors, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  universe_size: number;
  pre_token_size: number;
  rows: RadarRow[];
  live: LiveRow[];
  categories: CategoryPrior[];
  calibration: Calibration;
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a non-empty list of numbers, or 0. */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/**
 * Every category's prior, derived from the universe rather than written down: a category whose
 * protocols hold more TVL than the universe's median category is a category the market weighs more
 * heavily, so a claim on one of its protocols is worth more per dollar of TVL. The multiplier is
 * applied on a log scale and held inside [1 - w/2, 1 + w], so it tilts the ranking without letting
 * one fat category flatten the board.
 */
export function categoryPriors(protocols: SnapshotProtocol[], model: ModelConstants): Map<string, number> {
  const byCategory = new Map<string, number[]>();
  for (const p of protocols) {
    const key = p.category ?? 'Uncategorised';
    const list = byCategory.get(key);
    if (list === undefined) byCategory.set(key, [p.tvl_usd]);
    else list.push(p.tvl_usd);
  }
  const medians = [...byCategory.values()].map((v) => median(v)).filter((v) => v > 0);
  const universeMedian = median(medians);
  const out = new Map<string, number>();
  for (const [key, values] of byCategory) {
    const own = median(values);
    if (own <= 0 || universeMedian <= 0) {
      out.set(key, 1);
      continue;
    }
    // log2 of how many times the universe's median category TVL this category sits at
    const ratio = Math.log2(own / universeMedian);
    const raw = 1 + (ratio / 4) * model.category_weight;
    out.set(key, Math.min(1 + model.category_weight, Math.max(1 - model.category_weight / 2, raw)));
  }
  return out;
}

/** Every category's median 7-day change, so a protocol's growth is read against its own peers. */
function categoryGrowthMedians(protocols: SnapshotProtocol[]): Map<string, number> {
  const byCategory = new Map<string, number[]>();
  for (const p of protocols) {
    if (p.change_7d === null) continue;
    const key = p.category ?? 'Uncategorised';
    const list = byCategory.get(key);
    if (list === undefined) byCategory.set(key, [p.change_7d]);
    else list.push(p.change_7d);
  }
  const out = new Map<string, number>();
  for (const [key, values] of byCategory) out.set(key, median(values));
  return out;
}

/** The multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  priors: Map<string, number>,
  growthMedians: Map<string, number>,
): {
  implied: number;
  growthPct: number;
  growthMult: number;
  relativePct: number;
  relativeMult: number;
  patienceMult: number;
  categoryMult: number;
  breadthMult: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const categoryKey = protocol.category ?? 'Uncategorised';

  // Absolute growth, clamped to the model's own window: a +300% week is momentum, not a valuation.
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;

  // Relative growth: the same week read against the protocol's own category. A protocol up 12% in a
  // category up 20% is losing ground; one up 4% in a category down 10% is gaining it.
  const peer = growthMedians.get(categoryKey) ?? 0;
  const relativePct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth - peer));
  const relativeMult = 1 + (relativePct / 100) * model.relative_growth_weight;

  // Patience: how long the record has run with no token. A protocol that has carried real TVL for
  // years without issuing one is the strongest kind of claim — the record itself is the evidence.
  const ageForModel = age ?? model.unknown_age_days;
  const patienceMult =
    model.patience_floor +
    (Math.min(Math.max(ageForModel, 0), model.patience_days) / model.patience_days) * model.patience_range;

  const categoryMult = priors.get(categoryKey) ?? 1;

  // Breadth: how many chains the record spans. More chains means more places to hold the position.
  const breadthMult = Math.min(model.breadth_cap, 1 + Math.max(0, protocol.chains.length - 1) * model.breadth_weight);

  const base = protocol.tvl_usd * model.base_multiple;
  const implied = Math.max(
    1,
    Math.round(base * growthMult * relativeMult * patienceMult * categoryMult * breadthMult),
  );
  return {
    implied,
    growthPct,
    growthMult,
    relativePct,
    relativeMult,
    patienceMult,
    categoryMult,
    breadthMult,
    age,
  };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const priors = categoryPriors(snapshot.protocols, model);
  const growthMedians = categoryGrowthMedians(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but
  // the board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols below the watchlist floor, by TVL, capped. Never a
  // replacement for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, model, priors, growthMedians);
    return { p, v };
  });
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.v.age,
    implied_value_usd: s.v.implied,
    model: {
      base_multiple: model.base_multiple,
      growth_pct: s.v.growthPct,
      growth_multiplier: round4(s.v.growthMult),
      relative_growth_pct: s.v.relativePct,
      relative_multiplier: round4(s.v.relativeMult),
      patience_multiplier: round4(s.v.patienceMult),
      category_multiplier: round4(s.v.categoryMult),
      breadth_multiplier: round4(s.v.breadthMult),
      age_days: s.v.age,
    },
    farm_steps: farmSteps(s.p, s.v.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  const multi = p.chains.length > 1 ? ` Repeat the position on ${p.chains.slice(1, 3).join(' and ')} if the same app is deployed there.` : '';
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.${multi}`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/**
 * Measure the base multiple from the snapshot: among live-token protocols with meaningful TVL, the
 * ratio of market cap to TVL, at the requested percentile. The 50th percentile is the market's median
 * verdict on what a dollar of protocol TVL is worth in token terms; a board may argue for another
 * percentile, but it must show which one it used and what the sample was.
 */
export function calibrate(snapshot: Snapshot, opts: { percentile?: number; min_tvl_usd?: number } = {}): Calibration {
  const percentile = opts.percentile ?? 0.5;
  const minTvl = opts.min_tvl_usd ?? 50_000_000;
  const ratios: number[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.tvl_usd < minTvl) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (ratio > 0 && Number.isFinite(ratio)) ratios.push(ratio);
  }
  ratios.sort((a, b) => a - b);
  if (ratios.length === 0) {
    return { sample: 0, median_ratio: 0, p25_ratio: 0, p75_ratio: 0, percentile, base_multiple: MODEL.base_multiple, min_tvl_usd: minTvl };
  }
  const at = (q: number): number => ratios[Math.min(ratios.length - 1, Math.floor(q * ratios.length))]!;
  return {
    sample: ratios.length,
    median_ratio: round4(ratios[Math.floor(ratios.length / 2)]!),
    p25_ratio: round4(at(0.25)),
    p75_ratio: round4(at(0.75)),
    percentile,
    base_multiple: round4(Math.max(0.01, at(percentile))),
    min_tvl_usd: minTvl,
  };
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow, watchlist: Set<string>): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    growth_multiplier: row.model.growth_multiplier,
    relative_multiplier: row.model.relative_multiplier,
    patience_multiplier: row.model.patience_multiplier,
    category_multiplier: row.model.category_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
    on_watchlist: watchlist.has(row.slug),
  };
}

/** The category priors, for the dashboard's methodology panel. */
function priorRows(snapshot: Snapshot, model: ModelConstants): CategoryPrior[] {
  const priors = categoryPriors(snapshot.protocols, model);
  const byCategory = new Map<string, number[]>();
  for (const p of snapshot.protocols) {
    const key = p.category ?? 'Uncategorised';
    const list = byCategory.get(key);
    if (list === undefined) byCategory.set(key, [p.tvl_usd]);
    else list.push(p.tvl_usd);
  }
  return [...byCategory.entries()]
    .map(([category, values]) => ({
      category,
      protocols: values.length,
      median_tvl_usd: Math.round(median(values)),
      multiplier: round4(priors.get(category) ?? 1),
    }))
    .sort((a, b) => b.multiplier - a.multiplier || b.protocols - a.protocols);
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL, opts: { calibrate?: boolean } = {}): { board: BoardRow[]; radar: RadarData } {
  // The base multiple is measured, not picked: the live-token protocols in the same snapshot say what
  // a dollar of TVL has been worth in token terms, at the median (or the model's default, when
  // calibration is off).
  const calibration = calibrate(snapshot, { percentile: 0.5 });
  const effective: ModelConstants =
    opts.calibrate === false ? model : { ...model, base_multiple: calibration.base_multiple || model.base_multiple };
  const board = buildBoard(snapshot, effective);
  const live = liveRows(snapshot);
  const watchlist = new Set(snapshot.watchlist);
  const early = board.filter((r) => !watchlist.has(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model: effective,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    universe_size: snapshot.protocols.length,
    pre_token_size: snapshot.protocols.filter(isPreToken).length,
    rows: board.map((r) => radarRow(r, watchlist)),
    live,
    categories: priorRows(snapshot, effective),
    calibration,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}