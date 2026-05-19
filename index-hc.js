async function wapper() {
  let domparser = new DOMParser();

  const VERSION = "v2.5.3";
  console.log("Running popn class script", VERSION);

  const loadingEl = document.createElement("div");
  loadingEl.style.cssText = "padding:40px;text-align:center;font-size:14px;color:#555;";
  loadingEl.textContent = "曲データ取得中...";
  document.body.innerHTML = "";
  document.body.appendChild(loadingEl);

  const round = (number, p) => Math.round(number * 10 ** p) / 10 ** p;
  const floor = (number, p) => Math.floor(number * 10 ** p) / 10 ** p;

  const MEDAL_BONUS = {
    a: 21250, // PERFECT
    b: 17500, // Full Combo
    c: 17500, // Full Combo
    d: 17500, // Full Combo
    e: 12500, // CLEAR
    f: 12500, // CLEAR
    g: 12500, // CLEAR
    h: 0,     // 未クリア
    i: 0,     // 未クリア
    j: 0,     // 未クリア
    k: 10000,  // EASYクリア
    l: 6250,  // アシストクリア
    none: 0,  // 未クリア
  };

  const PLAY_DATA_URL = "https://p.eagate.573.jp/game/popn/popn29/playdata";
  const MEDAL_IMAGE_URL =
    "https://eacache.s.konaminet.jp/game/popn/popn29/images/p/common/medal";

  function resToText(res) {
    return res.arrayBuffer().then((buffer) => {
      if (res.headers.get("Content-Type").includes("UTF-8")) {
        return new TextDecoder().decode(buffer);
      } else {
        return new TextDecoder("Shift_JIS").decode(buffer);
      }
    });
  }

  function calcPoint(scoreText, level, medal) {
    const s = parseInt(scoreText);
    if (isNaN(s) || s < 50000) return 0;
    return floor(floor((level * (3750 * level + (MEDAL_BONUS[medal] ?? 0) + (s - 50000))) / 3881250, 8) * 60, 2);
  }
  
  let requestCount = 0;

  function fetchAndParse(url, parser) {
    requestCount++;
    return fetch(url)
      .then(resToText)
      .then((text) => domparser.parseFromString(text, "text/html"))
      .then(parser);
  }

  function parseSongs(level) {
    return (doc) => {
      const lis = doc.querySelectorAll("ul.mu_list_lv_table > li");
      return Array.from(lis)
        .filter((li) => li.className !== "st_th")
        .map((li) => {
          const scoreText = li.children[3].querySelector("p").textContent;
          const medal = li.children[3]
            .querySelector("img")
            .src.replace(`${MEDAL_IMAGE_URL}/meda_`, "")
            .replace(".png", "");
          const genre = li.children[0].querySelector("p").textContent;
          const song = li.children[0].querySelector("a").textContent;
          const href = li.children[0].querySelector("a").getAttribute("href");
          const no = new URLSearchParams(href.split("?")[1]).get("no");
          const point = calcPoint(scoreText, level, medal);
          return { song, genre, score: scoreText, medal, level, point, no };
        });
    };
  }

  async function fetchAllLevelPages(version, level) {
    const results = [];
    let page = 0;
    while (true) {
      const url = `${PLAY_DATA_URL}/mu_lv.html?page=${page}&version=${version}&bemani=0&category=0&keyword=&sort=none&lv=${level}`;
      const songs = await fetchAndParse(url, parseSongs(level));
      if (songs.length === 0) break;
      results.push(...songs);
      page++;
    }
    return results;
  }

  // localStorage cache: { [no]: { score, medal } } — 歴代=VERSIONが確認済みの曲
  // score をキーとして保持することで、歴代スコアが更新されたら自動的に無効化される
  const CACHE_KEY = "popn_hc_version_cache_v2";
  const versionCache = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");

  function saveCache() {
    localStorage.setItem(CACHE_KEY, JSON.stringify(versionCache));
  }

  const TOGGLE_KEY = "popn_hc_use_historical_easy_clear";
  let useHistoricalEC = localStorage.getItem(TOGGLE_KEY) === "true";

  const SUPABASE_URL = "https://fnujaznrlerqpyhwhiry.supabase.co/rest/v1/";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZudWphem5ybGVycXB5aHdoaXJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0NDI1NzgsImV4cCI6MjA5NDAxODU3OH0.GRccND27_3NCgABj6JULYDzWQfhXafkAL17Ws6BIZQQ";

  // mu_detail.html の EX 難易度から VERSION スコアとメダル（回数推定）を取得
  function parseDetailPage(doc) {
    const section = doc.querySelector("#ex");
    if (!section) return null;
    const tables = section.querySelectorAll("table");
    if (tables.length < 2) return null;

    const versionScore = tables[1].querySelector("tr.score td.play_value").textContent.trim();
    if (versionScore === "-") {
      return { score: "0", medal: "none" };
    }

    // VERSION セクションにメダル表示なし → プレー回数から推測
    const playRows = tables[1].querySelectorAll("tr.play td.play_value");
    const clearCount   = parseInt(playRows[1]?.textContent) || 0; // クリア回数
    const fcCount      = parseInt(playRows[2]?.textContent) || 0; // FULL COMBO回数
    const perfectCount = parseInt(playRows[3]?.textContent) || 0; // PERFECT回数

    let medal;
    if (perfectCount > 0) medal = "a";
    else if (fcCount > 0) medal = "b";
    else if (clearCount > 0) medal = "e";
    else medal = "h";

    return { score: versionScore, medal };
  }

  async function fetchVersionScore(song) {
    const cached = versionCache[song.no];
    if (cached && cached.score === song.score) {
      const vm = cached.medal;
      const hm = song.medal;
      // VERSIONメダルのボーナスが歴代と同じ場合のみ歴代メダルを採用
      const effectiveMedal = (MEDAL_BONUS[vm] ?? 0) === (MEDAL_BONUS[hm] ?? 0) ? hm : vm;
      const point = calcPoint(song.score, song.level, effectiveMedal);
      return { ...song, historicalMedal: hm, versionMedal: vm, medal: effectiveMedal, point };
    }

    const url = `${PLAY_DATA_URL}/mu_detail.html?no=${encodeURIComponent(song.no)}&back=index`;
    const result = await fetchAndParse(url, parseDetailPage);
    if (!result) return { ...song, historicalMedal: song.medal, versionMedal: song.medal };

    const hm = song.medal;
    const vm = result.medal;

    if (result.score === song.score &&
        (MEDAL_BONUS[vm] ?? 0) >= (MEDAL_BONUS[hm] ?? 0)) {
      versionCache[song.no] = { score: song.score, medal: vm };
      saveCache();
    }

    // VERSIONメダルのボーナスが歴代と同じ場合のみ歴代メダルを採用
    const effectiveMedal = (MEDAL_BONUS[vm] ?? 0) === (MEDAL_BONUS[hm] ?? 0) ? hm : vm;
    const point = calcPoint(result.score, song.level, effectiveMedal);
    return { ...song, score: result.score, historicalMedal: hm, versionMedal: vm, medal: effectiveMedal, point };
  }

  const [{ player, realPokkura }, ...songPages] = await Promise.all([
    fetchAndParse(
      `${PLAY_DATA_URL}/index.html`,
      (doc) => ({
        player: doc.querySelector("#status_table .st_box li:first-child div").textContent,
        realPokkura: parseFloat(doc.querySelector("#popnclass").textContent.trim()) || null,
      })
    ),
    // 新曲 (version=29): lv49, 48, 47, 46 — 歴代=VERSION前提なのでそのまま使う
    fetchAllLevelPages(29, 49),
    fetchAllLevelPages(29, 48),
    fetchAllLevelPages(29, 47),
    fetchAllLevelPages(29, 46),
    // 旧曲 (version=-1): lv50, 49, 48
    fetchAllLevelPages(-1, 50),
    fetchAllLevelPages(-1, 49),
    fetchAllLevelPages(-1, 48),
  ]);

  const newSongs = songPages.slice(0, 4).flat();
  const newSongNos = new Set(newSongs.map((s) => s.no));
  const oldSongs = songPages.slice(4).flat().filter((s) => !newSongNos.has(s.no));

  const top20New = [...newSongs].sort((a, b) => b.point - a.point).slice(0, 20);

  // 上位120候補を10件ずつ取得し、現在の40位が次の候補の歴代ポックラを超えたら早期終了
  const oldCandidates = [...oldSongs].sort((a, b) => b.point - a.point).slice(0, 120);
  const oldResolved = [];
  let oldCutoffPoint = null;
  for (let i = 0; i < oldCandidates.length; i += 10) {
    const batch = oldCandidates.slice(i, i + 10);
    oldResolved.push(...await Promise.all(batch.map(fetchVersionScore)));

    const nextIndex = i + 10;
    if (oldResolved.length >= 40 && nextIndex < oldCandidates.length) {
      const cutoff = [...oldResolved].sort((a, b) => b.point - a.point)[39].point;
      if (cutoff >= oldCandidates[nextIndex].point) {
        oldCutoffPoint = cutoff;
        break;
      }
    }
  }
  const oldSongsFetched = oldResolved.length;

  // トグルON時: historicalMedal が k(EASY) で versionMedal が h(未クリア) の曲は歴代メダルを使用
  function applyToggleToOldSongs(songs, useEC) {
    return songs.map((song) => {
      const hm = song.historicalMedal ?? song.medal;
      const vm = song.versionMedal ?? song.medal;
      let effectiveMedal;
      if (useEC && hm === "k" && (vm === "h" || vm === "none")) {
        effectiveMedal = "k";
      } else {
        effectiveMedal = (MEDAL_BONUS[vm] ?? 0) === (MEDAL_BONUS[hm] ?? 0) ? hm : vm;
      }
      const point = calcPoint(song.score, song.level, effectiveMedal);
      return { ...song, medal: effectiveMedal, point };
    });
  }

  function computeTop40Old(songs, useEC) {
    return [...applyToggleToOldSongs(songs, useEC)]
      .sort((a, b) => b.point - a.point)
      .slice(0, 40);
  }

  async function uploadRecord() {
    try {
      const top40ForUpload = computeTop40Old(oldResolved, false);
      const top40ForUploadEC = computeTop40Old(oldResolved, true);
      const classPoint = floor(round([...top20New, ...top40ForUpload].reduce((acc, cur) => acc + cur.point, 0), 8) / 60, 2);
      const classPoint2 = floor(round([...top20New, ...top40ForUploadEC].reduce((acc, cur) => acc + cur.point, 0), 8) / 60, 2);
      if (classPoint < 175) return;
      await fetch(`${SUPABASE_URL}pokkura_records`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          player_name: player,
          pokkura: classPoint,
          pokkura2: classPoint2,
          real_pokkura: realPokkura,
          new_point: floor(round(top20New.reduce((acc, cur) => acc + cur.point, 0), 8), 2),
          old_point: floor(round(top40ForUpload.reduce((acc, cur) => acc + cur.point, 0), 8), 2),
          top20_new: top20New,
          top40_old: oldResolved,
          old_songs_fetched: oldSongsFetched,
          old_cutoff_point: oldCutoffPoint,
          use_historical_ec: useHistoricalEC,
          request_count: requestCount,
          script_version: VERSION,
        }),
      });
    } catch (e) {
      console.error("Failed to upload record:", e);
    }
  }

  const divEl = document.createElement("div");
  divEl.id = "pokkura";
  document.body.innerHTML = "";
  document.body.appendChild(divEl);

  function renderResult(currentTop40Old) {
    const classPointRaw = floor(
      round([...top20New, ...currentTop40Old].reduce((acc, cur) => acc + cur.point, 0), 8) / 60,
      2
    );

    const renderRows = (songs) =>
      songs
        .map(
          (x) =>
            `<tr><td>${x.level}</td><td class="col-song"><div class="col-genre-text">${x.genre}</div><div class="col-song-text">${x.song}</div></td><td>${
              x.score
            }</td><td><img src="${MEDAL_IMAGE_URL}/meda_${
              x.medal
            }.png"></td><td>${floor(x.point / 60, 3).toFixed(3)}</td></tr>`
        )
        .join("");

    divEl.innerHTML = `
  <style scoped>
  #pokkura {
    padding: 16px 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .pokura {
    display: flex;
    justify-content: center;
  }
  .pokuraTable {
    background-color: #feffb7;
    border-collapse: collapse;
    font-size: 13px;
    width: 100%;
    max-width: 400px;
    table-layout: fixed;
  }
  .pokuraTable tr {
    border-bottom: 2px solid #d82f66;
  }
  .pokuraTable th {
    padding: 4px 8px;
    white-space: nowrap;
    text-align: center;
  }
  .pokuraTable td {
    padding: 1px 6px;
    text-align: center;
  }
  .pokuraTable td img {
    vertical-align: middle;
  }
  .col-song {
    overflow: hidden;
    text-align: left;
  }
  .col-genre-text {
    font-size: 9px;
    line-height: 1.2;
    color: #888;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .col-song-text {
    font-size: 11px;
    line-height: 1.2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .profileTable {
    width: auto;
    font-size: 13px;
  }
  .profileTable td {
    padding: 3px 8px;
  }
  .profileTable td:first-child {
    font-weight: bold;
    white-space: nowrap;
  }
  .sectionLabel {
    text-align: center;
    font-weight: bold;
    font-size: 13px;
    margin: 10px 0 4px;
    color: #d82f66;
  }
  .toggleWrapper {
    margin: 4px 0 6px;
    text-align: center;
  }
  .toggleLabel {
    cursor: pointer;
    font-size: 12px;
    color: #555;
    user-select: none;
  }
  .footnote {
    font-size: 10px;
    margin: 8px auto;
    color: gray;
    text-align: center;
  }
  @media (max-width: 768px) {
    .pokura {
      flex-direction: column;
    }
    .pokuraTable th:first-child,td:first-child {
      min-width: 20px;
    }
    .pokuraTable th:nth-child(3),td:nth-child(3) {
      min-width: 40px;
    }
    .pokuraTable th:nth-child(4),td:nth-child(4) {
      min-width: 40px;
    }
    .pokuraTable th:nth-child(5),td:nth-child(5) {
      min-width: 50px;
    }
  }
  </style>
  <table class="pokuraTable profileTable">
    <tr><td>プレーヤー名</td><td>${player}</td></tr>
    <tr><td>ポックラ</td><td>${classPointRaw.toFixed(2)}</td></tr>
    <tr><td>新曲</td><td>${floor(round(top20New.reduce((acc, cur) => acc + cur.point, 0), 8) / 60, 2).toFixed(2)}</td></tr>
    <tr><td>旧曲</td><td>${floor(round(currentTop40Old.reduce((acc, cur) => acc + cur.point, 0), 8) / 60, 2).toFixed(2)}</td></tr>
  </table>
  <div class="sectionLabel">新曲</div>
  <div class="pokura">
    <table class="pokuraTable">
      <tr><th style="width:34px">LV</th><th>曲名</th><th style="width:65px">スコア</th><th style="width:45px">メダル</th><th style="width:62px">ポックラ</th></tr>
      ${renderRows(top20New)}
    </table>
  </div>
  <div class="sectionLabel">旧曲</div>
  <div class="pokura">
    <table class="pokuraTable">
      <tr><th style="width:34px">LV</th><th>曲名</th><th style="width:65px">スコア</th><th style="width:45px">メダル</th><th style="width:62px">ポックラ</th></tr>
      ${renderRows(currentTop40Old)}
    </table>
  </div>
  <div class="toggleWrapper">
    <label class="toggleLabel">
      <input type="checkbox" id="toggleEC" ${useHistoricalEC ? "checked" : ""}> EASYクリアの歴代メダルを参照する
    </label>
  </div>
  <div class="footnote">※ 表示されるポックラ値はスクリプトによる推定値です。実際のゲーム内ポックラと異なる場合があります。</div>
  <div class="footnote">ポックラスクリプト${VERSION}</div>
  `;

    document.getElementById("toggleEC").addEventListener("change", function () {
      useHistoricalEC = this.checked;
      localStorage.setItem(TOGGLE_KEY, this.checked.toString());
      renderResult(computeTop40Old(oldResolved, this.checked));
    });
  }

  renderResult(computeTop40Old(oldResolved, useHistoricalEC));
  uploadRecord();
}

wapper();
