// node optimize.mjs で実行
// real_pokkura が設定されているレコードを使って MEDAL_BONUS / alpha / denom を最適化する

const SUPABASE_URL = "https://fnujaznrlerqpyhwhiry.supabase.co/rest/v1/";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZudWphem5ybGVycXB5aHdoaXJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0NDI1NzgsImV4cCI6MjA5NDAxODU3OH0.GRccND27_3NCgABj6JULYDzWQfhXafkAL17Ws6BIZQQ";

const INITIAL_ALPHA = 3750;
const INITIAL_DENOM = 3880000;

const PARAM_MEDALS = {
  A: ["a"],
  B: ["b", "c", "d"],
  C: ["e", "f", "g"],
  k: ["k"],
  l: ["l"],
};

const INITIAL_BONUS = {
  a: 21135, b: 17425, c: 17425, d: 17425,
  e: 12411, f: 12411, g: 12411,
  h: 0, i: 0, j: 0,
  k: 6200, l: 9300, none: 0,
};

const STRATEGIES = {
  'floor8': (n) => Math.floor(n * 1e8) / 1e8,
  'round8': (n) => Math.round(n * 1e8) / 1e8,
  'floor3': (n) => Math.floor(n * 1e3) / 1e3,
  'round3': (n) => Math.round(n * 1e3) / 1e3,
  'floor2': (n) => Math.floor(n * 1e2) / 1e2,
  'round2': (n) => Math.round(n * 1e2) / 1e2,
};

function calcPoint(score, level, medal, bonus, alpha, denom, applyFn) {
  const s = parseInt(score);
  if (isNaN(s) || s < 50000) return 0;
  return applyFn((level * (alpha * level + (bonus[medal] ?? 0) + (s - 50000))) / denom);
}

function effectiveMedal(song, bonus) {
  const hm = song.historicalMedal ?? song.medal;
  const vm = song.versionMedal ?? song.medal;
  return (bonus[vm] ?? 0) === (bonus[hm] ?? 0) ? hm : vm;
}

function calcPokkura(record, bonus, alpha, denom, applyFn) {
  const newPts = (record.top20_new ?? [])
    .reduce((s, x) => s + calcPoint(x.score, x.level, x.medal, bonus, alpha, denom, applyFn), 0);
  const oldPts = (record.top40_old ?? [])
    .map(x => { const m = effectiveMedal(x, bonus); return calcPoint(x.score, x.level, m, bonus, alpha, denom, applyFn); })
    .sort((a, b) => b - a)
    .slice(0, 40)
    .reduce((s, v) => s + v, 0);
  return Math.floor(Math.round((newPts + oldPts) * 1e8) / 1e8 * 1e2) / 1e2;
}

// 各レコードの特徴量 (線形回帰用) — bonus のみを対象、alpha/denom は固定
function buildFeatures(record, bonus, alpha, denom, applyFn) {
  const newSongs = (record.top20_new ?? []).map(x => ({ score: x.score, level: x.level, medal: x.medal }));
  const oldSongs = (record.top40_old ?? [])
    .map(x => { const m = effectiveMedal(x, bonus); return { score: x.score, level: x.level, medal: m, pt: calcPoint(x.score, x.level, m, bonus, alpha, denom, applyFn) }; })
    .sort((a, b) => b.pt - a.pt)
    .slice(0, 40);

  const allSongs = [...newSongs, ...oldSongs];
  let base = 0;
  const coeffs = Object.fromEntries(Object.keys(PARAM_MEDALS).map(k => [k, 0]));

  for (const s of allSongs) {
    const sc = parseInt(s.score);
    if (isNaN(sc) || sc < 50000) continue;
    const lv = s.level;
    base += lv * (alpha * lv + (sc - 50000)) / denom;
    for (const [param, medals] of Object.entries(PARAM_MEDALS)) {
      if (medals.includes(s.medal)) { coeffs[param] += lv / denom; break; }
    }
  }
  return { base, coeffs };
}

// ガウス消去法で正規方程式を解く (最小二乗法)
function solveLeastSquares(X, z, n) {
  const XtX = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => X.reduce((s, r) => s + r[i] * r[j], 0))
  );
  const Xtz = Array.from({ length: n }, (_, i) => X.reduce((s, r, ri) => s + r[i] * z[ri], 0));
  const mat = XtX.map((row, i) => [...row, Xtz[i]]);

  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(mat[row][col]) > Math.abs(mat[maxRow][col])) maxRow = row;
    }
    [mat[col], mat[maxRow]] = [mat[maxRow], mat[col]];
    if (Math.abs(mat[col][col]) < 1e-12) continue;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const f = mat[row][col] / mat[col][col];
      for (let j = col; j <= n; j++) mat[row][j] -= f * mat[col][j];
    }
  }
  return Array.from({ length: n }, (_, i) => {
    const v = mat[i][n] / mat[i][i];
    return isFinite(v) ? v : null;
  });
}

const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };
const res = await fetch(
  `${SUPABASE_URL}pokkura_records?real_pokkura=not.is.null&select=player_name,real_pokkura,old_songs_fetched,top20_new,top40_old`,
  { headers }
);
const allRecords = await res.json();
const records = allRecords.filter(r => r.old_songs_fetched !== 120 && r.player_name !== "あらくり" && !(r.player_name === "すがしゅー" && r.real_pokkura === 188.53));
console.log(`レコード数: ${allRecords.length} (old_songs_fetched=120 を除外後: ${records.length})\n`);

if (records.length === 0) {
  console.log("real_pokkura が設定されているレコードがありません");
  process.exit(0);
}

const paramKeys = Object.keys(PARAM_MEDALS);
const CD_BONUS_PARAMS = { A: ["a"], B: ["b", "c", "d"], C: ["e", "f", "g"], k: ["k"] };

function runOptimize(applyFn, stratName) {
  let bonus = { ...INITIAL_BONUS };
  let alpha = INITIAL_ALPHA;
  let denom = INITIAL_DENOM;

  // フェーズ1: 線形回帰で bonus を初期化
  for (let iter = 0; iter < 8; iter++) {
    const data = records.map(r => ({ ...buildFeatures(r, bonus, alpha, denom, applyFn), target: r.real_pokkura }));
    const X = data.map(d => paramKeys.map(p => d.coeffs[p]));
    const z = data.map(d => d.target - d.base);
    const theta = solveLeastSquares(X, z, paramKeys.length);
    const newBonus = { ...bonus };
    paramKeys.forEach((p, i) => { if (theta[i] !== null) for (const m of PARAM_MEDALS[p]) newBonus[m] = theta[i]; });
    bonus = newBonus;
  }

  // フェーズ2: 座標降下法
  let cdBonus = { ...bonus };
  for (const m of CD_BONUS_PARAMS.k) cdBonus[m] = INITIAL_BONUS[m];

  const totalAbsDiff = (b, a, d) =>
    records.reduce((s, r) => s + Math.abs(calcPokkura(r, b, a, d, applyFn) - r.real_pokkura), 0);

  let improved = true, cdIter = 0;
  while (improved && cdIter < 50) {
    improved = false; cdIter++;
    for (const [param, medals] of Object.entries(CD_BONUS_PARAMS)) {
      const curVal = cdBonus[medals[0]];
      let bestVal = curVal, bestErr = totalAbsDiff(cdBonus, alpha, denom);
      for (let delta = -500; delta <= 500; delta++) {
        if (delta === 0) continue;
        const testBonus = { ...cdBonus };
        for (const m of medals) testBonus[m] = curVal + delta;
        const err = totalAbsDiff(testBonus, alpha, denom);
        if (err < bestErr - 1e-9) { bestErr = err; bestVal = curVal + delta; }
      }
      if (bestVal !== curVal) { for (const m of medals) cdBonus[m] = bestVal; improved = true; }
    }
    // alpha
    { let bestAlpha = alpha, bestErr = totalAbsDiff(cdBonus, alpha, denom);
      for (let delta = -300; delta <= 300; delta++) {
        if (delta === 0) continue;
        const err = totalAbsDiff(cdBonus, alpha + delta, denom);
        if (err < bestErr - 1e-9) { bestErr = err; bestAlpha = alpha + delta; }
      }
      if (bestAlpha !== alpha) { alpha = bestAlpha; improved = true; }
    }
    // denom
    { let bestDenom = denom, bestErr = totalAbsDiff(cdBonus, alpha, denom);
      for (let delta = -2000; delta <= 2000; delta++) {
        if (delta === 0) continue;
        const err = totalAbsDiff(cdBonus, alpha, denom + delta * 100);
        if (err < bestErr - 1e-9) { bestErr = err; bestDenom = denom + delta * 100; }
      }
      if (bestDenom !== denom) { denom = bestDenom; improved = true; }
    }
  }

  // 結果表示
  const diffs = records.map(r => calcPokkura(r, cdBonus, alpha, denom, applyFn) - r.real_pokkura);
  const sumAbs = diffs.reduce((s, d) => s + Math.abs(d), 0);
  const allZero = diffs.every(d => Math.abs(d) < 0.005);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`戦略: ${stratName}  合計|diff|=${sumAbs.toFixed(3)}  全部0.00: ${allZero ? "★YES★" : "no"}  (${cdIter}回)`);
  console.log(`  alpha=${alpha} denom=${denom}`);
  console.log(`  A=${Math.round(cdBonus.a)} B=${Math.round(cdBonus.b)} C=${Math.round(cdBonus.e)} k=${Math.round(cdBonus.k)}`);
  for (const r of records) {
    const diff = calcPokkura(r, cdBonus, alpha, denom, applyFn) - r.real_pokkura;
    if (Math.abs(diff) >= 0.005)
      console.log(`  !! ${r.player_name.padEnd(20)} 実際:${r.real_pokkura}  diff:${diff.toFixed(2)}`);
  }
  if (allZero) console.log("  → 全レコード差分 0.00 達成！");
  return { cdBonus, alpha, denom, sumAbs, allZero };
}

for (const [name, fn] of Object.entries(STRATEGIES)) {
  runOptimize(fn, name);
}
