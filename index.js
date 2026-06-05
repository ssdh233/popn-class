async function wapper() {
  let domparser = new DOMParser();

  const VERSION = "v1.3.2";
  console.log("Running popn class script", VERSION);

  const round = (number, p) => {
    return Math.round(number * 10 ** p) / 10 ** p;
  };

  const floor = (number, p) => {
    return Math.floor(number * 10 ** p) / 10 ** p;
  };

  const MEDAL_BONUS = {
    a: 5000,
    b: 5000,
    c: 5000,
    d: 5000,
    e: 3000,
    f: 3000,
    g: 3000,
    h: 0,
    i: 0,
    j: 0,
    k: 3000,
    l: 3000,
    none: 0,
  };

  const GAME_VERSION = window.location.href.includes("/popn/popn29")
    ? "popn29"
    : "jamfizz";
  const PLAY_DATA_URL = `https://p.eagate.573.jp/game/popn/${GAME_VERSION}/playdata`;
  const MEDAL_IMAGE_URL = `https://eacache.s.konaminet.jp/game/popn/${GAME_VERSION}/images/p/common/medal`;

  function resToText(res) {
    return res.arrayBuffer().then((buffer) => {
      if (res.headers.get("Content-Type").includes("UTF-8")) {
        return new TextDecoder().decode(buffer);
      } else {
        return new TextDecoder("Shift_JIS").decode(buffer);
      }
    });
  }

  function whatever(url, level) {
    return fetch(url)
      .then(resToText)
      .then((text) => domparser.parseFromString(text, "text/html"))
      .then((doc) => {
        const selector = GAME_VERSION === "popn29"
          ? "ul.mu_list_lv_table > li"
          : "ul.mu_list_table > li";
        return doc.querySelectorAll(selector);
      })
      .then((lis) => {
        return Array.from(lis)
          .filter((li) =>
            GAME_VERSION === "popn29"
              ? !li.classList.contains("st_th")
              : li.firstElementChild.className.startsWith("col")
          )
          .map((li) =>
            GAME_VERSION === "popn29"
              ? [
                  li.children[3].querySelector("p").textContent,
                  li.children[3].querySelector("img").src
                    .replace(`${MEDAL_IMAGE_URL}/meda_`, "")
                    .replace(".png", ""),
                  li.children[0].querySelector("p").textContent,
                  li.children[0].querySelector("a").textContent,
                ]
              : [
                  li.children[3].textContent,
                  li.children[3].firstChild.src
                    .replace(`${MEDAL_IMAGE_URL}/meda_`, "")
                    .replace(".png", ""),
                  li.firstElementChild.childNodes[3].textContent,
                  li.firstElementChild.firstElementChild.textContent,
                ]
          )
          .map(([score, medal, genre, song]) => {
            let point =
              score < 50000
                ? 0
                : (10000 * level +
                    parseInt(score) -
                    50000 +
                    MEDAL_BONUS[medal]) /
                  5440;
            point = floor(round(point, 8), 2);
            return {
              song,
              genre,
              score,
              medal,
              level,
              point,
            };
          });
      });
  }

  const promises = [
    [0, 50],
    [1, 50],
    [0, 49],
    [1, 49],
    [2, 49],
    [3, 49],
    [4, 49],
    [5, 49],
    [0, 48],
    [1, 48],
    [2, 48],
    [3, 48],
    [4, 48],
    [5, 48],
    [6, 48],
    [7, 48],
    [8, 48],
    [9, 48],
  ].map(([page, level]) => {
    const query = GAME_VERSION === "popn29"
      ? `page=${page}&version=-1&bemani=0&category=0&keyword=&lv=${level}&sort=none&sort_type=none`
      : `page=${page}&lv=${level}`;
    return whatever(`${PLAY_DATA_URL}/mu_lv.html?${query}`, level);
  });

  const player = await fetch(`${PLAY_DATA_URL}/index.html`)
    .then(resToText)
    .then((text) => domparser.parseFromString(text, "text/html"))
    .then((doc) => {
      const selector = GAME_VERSION === "popn29"
        ? "#status_table .st_box ul li:first-child div"
        : "#status_table > div.st_box > div:nth-child(2)";
      const el = doc.querySelector(selector);
      if (!el) throw new Error("プレーヤー名の取得に失敗しました。");
      return el.textContent;
    });

  const first50Points = (await Promise.all(promises))
    .flat()
    .sort((a, b) => b.point - a.point)
    .slice(0, 50);
  const classPointRaw = round(
    first50Points.reduce((acc, cur) => acc + cur.point, 0) / 50,
    8
  );

  const divEl = document.createElement("div");
  divEl.id = "pokkura";
  divEl.innerHTML = `
  <style scoped>
  #pokkura {
    padding: 16px;
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
    table-layout: fixed;
    max-width: 400px;
    margin-bottom: 20px;
  }
  .pokuraTable:first-child {
    margin-right: 10px;
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
    max-width: 180px;
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
    .pokuraTable {
      width: 100%;
      max-width: 400px;
      margin-bottom: 20px;
    }
    .profileTable {
      width: auto;
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
  <table class="pokuraTable profileTable"><tr><td>プレーヤー名</td><td>${player}</td></tr><tr><td>ポックラ</td><td>${floor(
    classPointRaw,
    2
  ).toFixed(2)}</td></tr><tr><td>+0.01まであと約</td><td>${Math.ceil(
    ((1 - ((classPointRaw * 100) % 1)) * 5440 * 50) / 100
  )}</td></tr></table>
  <div class="pokura">
  <table class="pokuraTable">
    <tr><th style="width:34px">LV</th><th>曲名</th><th style="width:65px">スコア</th><th style="width:45px">メダル</th><th style="width:62px">ポックラ</th></tr>
    ${first50Points
      .slice(0, 25)
      .map(
        (x) =>
          `<tr><td>${x.level}</td><td class="col-song"><div class="col-genre-text">${x.genre}</div><div class="col-song-text">${x.song}</div></td><td>${
            x.score
          }</td><td><img src="${MEDAL_IMAGE_URL}/meda_${
            x.medal
          }.png"></td><td>${x.point.toFixed(2)}</td></tr>`
      )
      .join("")}
  </table>
  <table class="pokuraTable">
    <tr><th style="width:34px">LV</th><th>曲名</th><th style="width:65px">スコア</th><th style="width:45px">メダル</th><th style="width:62px">ポックラ</th></tr>
    ${first50Points
      .slice(25)
      .map(
        (x) =>
          `<tr><td>${x.level}</td><td class="col-song"><div class="col-genre-text">${x.genre}</div><div class="col-song-text">${x.song}</div></td><td>${
            x.score
          }</td><td><img src="${MEDAL_IMAGE_URL}/meda_${
            x.medal
          }.png"></td><td>${x.point.toFixed(2)}</td></tr>`
      )
      .join("")}
  </table>
  </div>
  <div class="footnote">ポックラスクリプト${VERSION}</div>
  `;

  document.body.innerHTML = "";
  document.body.appendChild(divEl);
}

wapper();
