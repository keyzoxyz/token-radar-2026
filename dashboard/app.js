// Token Radar's dashboard: renders the board from window.RADAR, which main.ts writes as data.js.
// No framework, no network, no fetched data — this file and data.js are the whole application.
//
// The board is the product: every pre-token protocol in the snapshot, ranked by implied value, with
// the model's own factors broken out per row so a reader can see why one protocol sits above another.
// Clicking a row opens its detail sheet: the factor waterfall that produced its value, and the farm
// plan derived from its own record.

'use strict';

const data = window.RADAR;
const main = document.getElementById('board');
const state = {
  q: '',
  tier: 'all',        // all | watchlist | early
  category: 'all',
  chain: 'all',
  minValue: 0,
  sort: { key: 'rank', dir: 1 },
};

/** Shorthands: format a number the way the board reads it. */
const fmt = {
  usd(n) {
    if (!Number.isFinite(n)) return '—';
    const abs = Math.abs(n);
    if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
    return `$${Math.round(n)}`;
  },
  full(n) {
    if (!Number.isFinite(n)) return '—';
    return `$${Math.round(n).toLocaleString('en-US')}`;
  },
  pct(n) {
    if (n === null || n === undefined || !Number.isFinite(n)) return '—';
    return `${n > 0 ? '+' : ''}${(n * 100).toFixed(2)}%`;
  },
  mult(n) { return `${Number(n).toFixed(3)}×`; },
  int(n) { return Number(n).toLocaleString('en-US'); },
  date(iso) { return iso ?? '—'; },
};

/** Escape text that reaches innerHTML. */
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** The growth class for a signed percent, so colour carries meaning rather than decoration. */
function growthClass(v) {
  if (v === null || v === undefined || !Number.isFinite(v)) return 'growth-flat';
  if (v > 0.001) return 'growth-pos';
  if (v < -0.001) return 'growth-neg';
  return 'growth-flat';
}

/** Categories present in the board, by row count, for the filter. */
function categories() {
  const counts = new Map();
  for (const r of data.rows) counts.set(r.category ?? 'Uncategorised', (counts.get(r.category ?? 'Uncategorised') ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

/** Chains present in the board, by row count. */
function chains() {
  const counts = new Map();
  for (const r of data.rows) for (const c of r.chains) counts.set(c, (counts.get(c) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24);
}

/** The rows the current filters and search leave, sorted. */
function visibleRows() {
  const q = state.q.trim().toLowerCase();
  let rows = data.rows.filter((r) => {
    if (state.tier === 'watchlist' && !r.on_watchlist) return false;
    if (state.tier === 'early' && r.on_watchlist) return false;
    if (state.category !== 'all' && (r.category ?? 'Uncategorised') !== state.category) return false;
    if (state.chain !== 'all' && !r.chains.includes(state.chain)) return false;
    if (r.implied_value_usd < state.minValue) return false;
    if (q !== '' && !(`${r.name} ${r.slug} ${r.category ?? ''} ${r.chains.join(' ')}`.toLowerCase().includes(q))) return false;
    return true;
  });
  const { key, dir } = state.sort;
  rows = rows.slice().sort((a, b) => {
    const av = a[key], bv = b[key];
    if (typeof av === 'string' || typeof bv === 'string') {
      const r = String(av ?? '').localeCompare(String(bv ?? ''));
      return r * dir || a.rank - b.rank;
    }
    return ((av ?? 0) - (bv ?? 0)) * dir || a.rank - b.rank;
  });
  return rows;
}

/** The masthead stamp: the snapshot's date and the model's version. */
function renderStamp() {
  document.getElementById('stamp').innerHTML =
    `snapshot <b>${esc(data.as_of)}</b> · model <b>${esc(data.model_version)}</b> · ${fmt.int(data.board_size)} rows`;
}

/** The headline: the question, the answer, and the numbers that bound it. */
function renderHeadline() {
  const top = data.rows[0];
  const watchTop = data.rows.find((r) => r.on_watchlist) ?? top;
  const el = document.createElement('section');
  el.className = 'headline';
  el.innerHTML = `
    <div>
      <h1>${esc(top.name)} carries the strongest un-issued claim in this snapshot at ${fmt.usd(top.implied_value_usd)} implied.</h1>
      <p class="dek">Every protocol here records no token: no market cap, no CoinGecko id, no symbol. The board values
      each one on the market's own terms — the median market-cap-to-TVL ratio of the ${fmt.int(data.calibration.sample)}
      live-token protocols in this same snapshot — then adjusts for growth relative to its category, how long it has run
      without a token, its category's weight, and how many chains it spans. Strongest claim on the watchlist:
      <b>${esc(watchTop.name)}</b> at ${fmt.usd(watchTop.implied_value_usd)}.</p>
    </div>
    <div class="facts">
      <div class="fact hero"><b>${fmt.usd(top.implied_value_usd)}</b><span>top implied value</span></div>
      <div class="fact"><b>${fmt.int(data.board_size)}</b><span>ranked pre-token protocols</span></div>
      <div class="fact"><b>${fmt.int(data.watchlist_size)}</b><span>on the watchlist (all covered)</span></div>
      <div class="fact"><b>${fmt.int(data.early_size)}</b><span>below the floor, found early</span></div>
      <div class="fact"><b>${fmt.mult(data.calibration.base_multiple)}</b><span>base multiple, measured</span></div>
      <div class="fact"><b>${fmt.int(data.pre_token_size)}</b><span>pre-token of ${fmt.int(data.universe_size)} seen</span></div>
    </div>`;
  main.appendChild(el);
}

/** The control bar: search, tier, category, chain and minimum value. */
function renderControls(onChange) {
  const el = document.createElement('section');
  el.className = 'controls';
  el.innerHTML = `
    <div class="field">
      <label for="q">Search</label>
      <input id="q" type="search" placeholder="protocol, category or chain…" value="${esc(state.q)}" autocomplete="off">
    </div>
    <div class="field">
      <label>Tier</label>
      <div class="seg" id="tier">
        <button data-v="all" aria-pressed="${state.tier === 'all'}">All</button>
        <button data-v="watchlist" aria-pressed="${state.tier === 'watchlist'}">Watchlist</button>
        <button data-v="early" aria-pressed="${state.tier === 'early'}">Early radar</button>
      </div>
    </div>
    <div class="field">
      <label for="cat">Category</label>
      <select id="cat">
        <option value="all">All categories</option>
        ${categories().map(([c, n]) => `<option value="${esc(c)}"${state.category === c ? ' selected' : ''}>${esc(c)} (${n})</option>`).join('')}
      </select>
    </div>
    <div class="field">
      <label for="chain">Chain</label>
      <select id="chain">
        <option value="all">All chains</option>
        ${chains().map(([c, n]) => `<option value="${esc(c)}"${state.chain === c ? ' selected' : ''}>${esc(c)} (${n})</option>`).join('')}
      </select>
    </div>
    <div class="count" id="count"></div>`;
  main.appendChild(el);

  const q = el.querySelector('#q');
  q.addEventListener('input', () => { state.q = q.value; onChange(); });
  el.querySelector('#tier').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]');
    if (!b) return;
    state.tier = b.dataset.v;
    for (const btn of el.querySelectorAll('#tier button')) btn.setAttribute('aria-pressed', String(btn.dataset.v === state.tier));
    onChange();
  });
  el.querySelector('#cat').addEventListener('change', (e) => { state.category = e.target.value; onChange(); });
  el.querySelector('#chain').addEventListener('change', (e) => { state.chain = e.target.value; onChange(); });
}

/** The board table. */
function renderTable(onChange) {
  const rows = visibleRows();
  const wrap = document.createElement('div');
  wrap.className = 'tablewrap';
  const cols = [
    ['rank', '#'],
    ['name', 'Protocol'],
    ['category', 'Category'],
    ['tvl_usd', 'TVL'],
    ['change_7d', '7d'],
    ['age_days', 'Age'],
    ['implied_value_usd', 'Implied value'],
  ];
  wrap.innerHTML = `
    <table>
      <thead><tr>${cols.map(([k, label]) => {
        const sorted = state.sort.key === k;
        return `<th scope="col"><button data-sort="${k}">${label}${sorted ? `<span class="dir">${state.sort.dir === 1 ? '▲' : '▼'}</span>` : ''}</button></th>`;
      }).join('')}<th scope="col">Chains</th></tr></thead>
      <tbody>${rows.map((r) => `
        <tr data-slug="${esc(r.slug)}" tabindex="0">
          <td class="rank">${r.rank}</td>
          <td class="name"><b>${esc(r.name)}</b>${r.on_watchlist ? '<span class="wl">◆ WL</span>' : ''}</td>
          <td class="cat">${esc(r.category ?? '—')}</td>
          <td class="num">${fmt.usd(r.tvl_usd)}</td>
          <td class="num ${growthClass(r.change_7d)}">${fmt.pct(r.change_7d)}</td>
          <td class="num">${r.age_days === null ? '—' : `${fmt.int(r.age_days)}d`}</td>
          <td class="num"><b>${fmt.usd(r.implied_value_usd)}</b></td>
          <td><span class="chain-tags">${r.chains.slice(0, 3).map((c) => `<span class="tag">${esc(c)}</span>`).join('')}${r.chains.length > 3 ? `<span class="tag">+${r.chains.length - 3}</span>` : ''}</span></td>
        </tr>`).join('')}</tbody>
    </table>`;
  main.appendChild(wrap);

  wrap.querySelector('thead').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-sort]');
    if (!b) return;
    const k = b.dataset.sort;
    if (state.sort.key === k) state.sort.dir *= -1;
    else state.sort = { key: k, dir: k === 'rank' || k === 'name' || k === 'category' ? 1 : -1 };
    onChange();
  });

  const open = (slug) => openDetail(slug);
  wrap.addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-slug]');
    if (tr) open(tr.dataset.slug);
  });
  wrap.addEventListener('keydown', (e) => {
    const tr = e.target.closest('tr[data-slug]');
    if (tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(tr.dataset.slug); }
  });
}

/** One waterfall row: a factor's label, its bar, and its multiplier. */
function wfRow(label, mult, tone) {
  const pct = Math.max(2, Math.min(100, (mult / 2.2) * 100));
  return `<div class="wf-row${tone === 'hero' ? ' hero' : ''}">
    <span class="lbl">${esc(label)}</span>
    <span class="wf-bar${mult < 1 ? ' neg' : ''}"><i style="width:${pct.toFixed(1)}%"></i></span>
    <span class="val">${fmt.mult(mult)}</span>
  </div>`;
}

/** The detail sheet for one row: the value's own arithmetic, then the farm plan. */
function openDetail(slug) {
  const r = data.rows.find((x) => x.slug === slug);
  if (!r) return;
  const ageLabel = r.age_days === null ? 'unknown' : `${fmt.int(r.age_days)} days`;
  const steps = boardSteps(r);

  const drawer = document.createElement('div');
  drawer.className = 'drawer';
  drawer.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="dh">
      <div class="sheet-head">
        <div>
          <h2 id="dh">${esc(r.name)}${r.on_watchlist ? ' <span class="tag" style="color:var(--amber);border-color:var(--amber)">watchlist</span>' : ''}</h2>
          <p class="sub">${esc(r.category ?? 'Uncategorised')} · ${esc(r.chains.join(', ') || 'chain not recorded')} · rank ${r.rank} of ${fmt.int(data.board_size)}</p>
        </div>
        <button class="close" aria-label="Close">✕</button>
      </div>

      <div class="kv">
        <div><span>Implied value</span><b style="color:var(--accent)">${fmt.usd(r.implied_value_usd)}</b></div>
        <div><span>TVL</span><b>${fmt.usd(r.tvl_usd)}</b></div>
        <div><span>7-day change</span><b class="${growthClass(r.change_7d)}">${fmt.pct(r.change_7d)}</b></div>
        <div><span>Record age</span><b>${ageLabel}</b></div>
        <div><span>Listed</span><b>${esc(fmt.date(r.listed_at))}</b></div>
        <div><span>Token recorded</span><b>none</b></div>
      </div>

      <h3 style="font-size:14px;margin-top:var(--s4)">How the value is built</h3>
      <p class="note">Start at TVL, multiply by the measured base multiple, then by each of the four adjustments.
      A factor above 1.000× raises the claim; one below lowers it.</p>
      <div class="waterfall">
        ${wfRow(`Base multiple (measured, ${fmt.mult(data.calibration.base_multiple)} of TVL)`, data.calibration.base_multiple, '')}
        ${wfRow(`Absolute 7d growth ${fmt.pct(r.change_7d)}`, r.growth_multiplier, '')}
        ${wfRow('Growth relative to its category', r.relative_multiplier, '')}
        ${wfRow(`Patience — ${ageLabel} without a token`, r.patience_multiplier, '')}
        ${wfRow(`Category weight — ${r.category ?? 'Uncategorised'}`, r.category_multiplier, '')}
        ${wfRow(`Breadth — ${r.chains.length} chain${r.chains.length === 1 ? '' : 's'}`, r.breadth_multiplier, '')}
        ${wfRow('Implied value', r.implied_value_usd / Math.max(1, r.tvl_usd), 'hero')}
      </div>
      <p class="note">${fmt.full(r.tvl_usd)} of TVL × ${fmt.mult(data.calibration.base_multiple)} × ${fmt.mult(r.growth_multiplier)}
      × ${fmt.mult(r.relative_multiplier)} × ${fmt.mult(r.patience_multiplier)} × ${fmt.mult(r.category_multiplier)}
      × ${fmt.mult(r.breadth_multiplier)} = <b style="color:var(--accent)">${fmt.full(r.implied_value_usd)}</b></p>

      <h3 style="font-size:14px;margin-top:var(--s5)">Farm plan</h3>
      <ol class="steps">${steps.map((s) => `<li>${esc(s.text)}<div class="meta">Cost: ${esc(s.cost)} · Time: ${esc(s.time)}</div></li>`).join('')}</ol>
      <p class="note">The plan is derived from this protocol's own record — its category, chains, TVL and age — not from a
      hand-kept list. Nothing here is financial advice; it is what the position costs and how long it takes.</p>
    </div>`;

  document.body.appendChild(drawer);
  const close = () => drawer.remove();
  drawer.querySelector('.close').addEventListener('click', close);
  drawer.addEventListener('click', (e) => { if (e.target === drawer) close(); });
  document.addEventListener('keydown', function onKey(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); }
  });
  drawer.querySelector('.close').focus();
}

/** The farm plan for a row, as its action and its cost/time. */
function boardSteps(r) {
  return fallbackSteps(r);
}

/**
 * The plan in the sheet: the same derivation lib/model.ts runs, so the page and the code agree.
 * data.js stays lean, so the page recomputes the plan from the row's own record — category, chains,
 * TVL and age — with no protocol name ever special-cased.
 */
function fallbackSteps(r) {
  const chain = r.chains[0] ?? 'its main chain';
  const capital = r.tvl_usd >= 5e9 ? 250 : r.tvl_usd >= 1e9 ? 150 : r.tvl_usd >= 1e8 ? 100 : 50;
  const hold = r.age_days === null ? 30 : r.age_days < 180 ? 60 : r.age_days < 365 ? 45 : 30;
  const c = (r.category ?? '').toLowerCase();
  const n = r.name;
  const action =
    (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) ? `Supply $${capital} of USDC to ${n} on ${chain} and keep the position open.` :
    (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) ? `Provide $${capital} of liquidity to ${n}'s main pool on ${chain} and keep the position open.` :
    c.includes('bridge') ? `Bridge $${capital} of USDC to ${chain} through ${n} and use the bridged funds in its app.` :
    (c.includes('staking') || c.includes('restak')) ? `Stake $${capital} of the chain's staking asset through ${n} and keep the receipt.` :
    (c.includes('perpetual') || c.includes('derivative')) ? `Deposit $${capital} of USDC as margin on ${n} and open one small hedge.` :
    c.includes('prediction') ? `Fund $${capital} and place one market position on ${n}.` :
    (c.includes('curator') || c.includes('allocator')) ? `Deposit $${capital} into a ${n} vault on ${chain} and keep the shares.` :
    c.includes('stable') ? `Mint or deposit $${capital} of the stable asset through ${n} on ${chain}.` :
    c.includes('rwa') ? `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.` :
    c.includes('insurance') ? `Buy $${capital} of cover from ${n} on ${chain} and keep the policy.` :
    `Deposit $${capital} of USDC into ${n} on ${chain} and keep the position open.`;
  const multi = r.chains.length > 1 ? ` Repeat the position on ${r.chains.slice(1, 3).join(' and ')} if the same app is deployed there.` : '';
  return [
    { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
    { text: action, cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`, time: '15 minutes to set up' },
    { text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.${multi}`, cost: 'about $2 of gas a week', time: '10 minutes a week' },
    { text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`, cost: `the $${capital} stays in the position`, time: `${hold} days` },
    { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
    { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' },
  ];
}

/** The methodology panel: the model, the calibration behind it, and the category priors. */
function renderMethod() {
  const c = data.calibration;
  const priors = data.categories.slice(0, 12);
  const el = document.createElement('section');
  el.className = 'method';
  el.innerHTML = `
    <div class="mpanel">
      <h2>The value model</h2>
      <p>Every row is scored by one function, with no protocol name special-cased:</p>
      <ol>
        <li><b>Base</b> — <code>tvl_usd × base_multiple</code>, where the multiple is measured, not chosen.</li>
        <li><b>Growth</b> — <code>change_7d</code> clamped to the model's window and weighted.</li>
        <li><b>Relative growth</b> — the same week read against the protocol's own category median, so a protocol gaining ground in a falling category outscores a laggard in a rising one.</li>
        <li><b>Patience</b> — how long the record has run with no token; the longer, the stronger the claim.</li>
        <li><b>Category weight</b> — the category's own median TVL against the universe's, on a log scale.</li>
        <li><b>Breadth</b> — how many chains the record spans.</li>
      </ol>
      <p style="margin-top:var(--s3)">A protocol is listed here when its record carries no market cap, no CoinGecko id and no symbol.
      The board says <em>records no token</em>, never <em>has no token</em>: the snapshot's silence is the evidence, and it is
      the only evidence the board claims. The watchlist is the floor and is covered in full; the ${fmt.int(data.early_size)}
      rows below it are pre-token protocols under the $50M TVL floor, taken by TVL, earliest first.</p>

      <h2 style="margin-top:var(--s5)">What the market pays for TVL</h2>
      <p>Rather than pick a multiple, the board measures it: among the live-token protocols in the same snapshot with at least
      ${fmt.usd(c.min_tvl_usd)} of TVL, the median market-cap-to-TVL ratio is the base multiple. A pre-token claim is then valued on
      the scale the market itself uses on the very same day.</p>
      <div class="kv cal-grid">
        <div><span>Sample</span><b>${fmt.int(c.sample)} live-token protocols</b></div>
        <div><span>Median ratio (used)</span><b style="color:var(--accent)">${fmt.mult(c.base_multiple)}</b></div>
        <div><span>25th percentile</span><b>${fmt.mult(c.p25_ratio)}</b></div>
        <div><span>75th percentile</span><b>${fmt.mult(c.p75_ratio)}</b></div>
      </div>
      <p class="note">The spread is wide — the median sits between a quarter of the 75th percentile's value and four times the
      25th — which is exactly why the board states the multiple it used instead of hiding it inside a ranking.</p>
    </div>

    <div class="mpanel">
      <h2>Category weights</h2>
      <p>A category's protocols are weighted by their own median TVL against the universe's, on a log scale, and held inside
      a fixed band so no single category flattens the ranking. Above 1.000× the market pays more per dollar of TVL in that
      category; below, less.</p>
      <table class="priors">
        <thead><tr><th>Category</th><th>Protocols</th><th>Median TVL</th><th>Weight</th></tr></thead>
        <tbody>${priors.map((p) => {
          const cls = p.multiplier > 1.001 ? 'hi' : p.multiplier < 0.999 ? 'lo' : '';
          return `<tr><td>${esc(p.category)}</td><td>${p.protocols}</td><td>${fmt.usd(p.median_tvl_usd)}</td><td class="${cls}">${fmt.mult(p.multiplier)}</td></tr>`;
        }).join('')}</tbody>
      </table>
      <h2 style="margin-top:var(--s5)">The live set, kept apart</h2>
      <p>The ${fmt.int(data.live_size)} largest live-token protocols are shown as the market's own values and never mixed into the
      ranked board: a protocol whose token already trades has a price, and a price is not an implied value.</p>
      <table class="priors">
        <thead><tr><th>Protocol</th><th>Market cap</th><th>TVL</th><th>MC/TVL</th></tr></thead>
        <tbody>${data.live.slice(0, 10).map((l) => {
          const ratio = l.mcap_usd && l.tvl_usd ? l.mcap_usd / l.tvl_usd : null;
          return `<tr><td>${esc(l.name)}</td><td>${fmt.usd(l.mcap_usd ?? 0)}</td><td>${fmt.usd(l.tvl_usd)}</td><td>${ratio === null ? '—' : fmt.mult(ratio)}</td></tr>`;
        }).join('')}</tbody>
      </table>
    </div>`;
  main.appendChild(el);
}

/** Redraw the table in place after a filter or sort change, keeping the controls as they are. */
function redraw() {
  const old = main.querySelector('.tablewrap');
  if (old) old.remove();
  renderTable(redraw);
  const rows = visibleRows();
  const countEl = main.querySelector('.controls #count');
  if (countEl) countEl.innerHTML = `<b>${fmt.int(rows.length)}</b> of ${fmt.int(data.board_size)} protocols`;
}

/** Boot. */
function boot() {
  if (!data || !Array.isArray(data.rows)) {
    main.innerHTML = '<p class="notice">data.js did not load, so there is no board to show.</p>';
    return;
  }
  renderStamp();
  renderHeadline();
  renderControls(redraw);
  renderTable(redraw);
  renderMethod();
  const ctl = main.querySelector('.controls');
  ctl.querySelector('#count').innerHTML = `<b>${fmt.int(data.rows.length)}</b> of ${fmt.int(data.board_size)} protocols`;
  main.setAttribute('aria-busy', 'false');
  document.getElementById('foot-note').textContent =
    `Snapshot ${data.as_of} · ${fmt.int(data.universe_size)} protocols scanned · ${fmt.int(data.board_size)} ranked · model ${data.model_version} · built from data.js only, no network.`;
}

boot();