async function wapper() {
  let domparser = new DOMParser();

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
  };

  function whatever(url, level) {
    return fetch(url)
      .then((res) => res.arrayBuffer())
      .then((buffer) => new TextDecoder("Shift_JIS").decode(buffer))
      .then((text) => domparser.parseFromString(text, "text/html"))
      .then((doc) => doc.querySelectorAll("ul.mu_list_table > li"))
      .then((lis) =>
        Array.from(lis)
          .filter((li) => li.firstElementChild.className.startsWith("col"))
          .map((li) => [
            li.children[3].textContent,
            li.children[3].firstChild.src
              .replace(
                "https://eacache.s.konaminet.jp/game/popn/peace/p/images/p/common/medal/meda_",
                ""
              )
              .replace(".png", ""),
            li.firstElementChild.lastElementChild.textContent,
            li.firstElementChild.firstElementChild.textContent,
          ])
          .map(([score, medal, genre, song]) => {
            console.log({ song, score, medal });
            return {
              song,
              genre,
              score,
              medal,
              level,
              point:
                score < 50000
                  ? 0
                  : Math.floor(
                      (100 *
                        (10000 * level +
                          parseInt(score) -
                          50000 +
                          MEDAL_BONUS[medal])) /
                        5440
                    ) / 100,
            };
          })
      );
  }

  const promises = [
    [0, 50],
    [0, 49],
    [1, 49],
    [2, 49],
    [0, 48],
    [1, 48],
    [2, 48],
    [3, 48],
    [4, 48],
    [5, 48],
  ].map(([page, level]) =>
    whatever(
      `https://p.eagate.573.jp/game/popn/peace/p/playdata/mu_lv.html?page=${page}&level=${level}`,
      level
    )
  );

  const player = await fetch(
    "https://p.eagate.573.jp/game/popn/peace/p/playdata/index.html"
  )
    .then((res) => res.arrayBuffer())
    .then((buffer) => new TextDecoder("Shift_JIS").decode(buffer))
    .then((text) => domparser.parseFromString(text, "text/html"))
    .then(
      (doc) =>
        doc.querySelector("#status_table > div.st_box > div:nth-child(2)")
          .textContent
    );

  const s = (await Promise.all(promises))
    .flat()
    .sort((a, b) => b.point - a.point)
    .slice(0, 50);
  const avg = s.reduce((acc, cur) => acc + cur.point, 0) / 50;

  const divEl = document.createElement("div");
  divEl.id = "pokkura";
  divEl.innerHTML = `
  <style scoped>
  .pokura {
    display: flex;
    justify-content: center;
  }
  .pokuraTable {
    background-color: #feffb7;
    border-collapse: collapse;
  }
  .pokuraTable:first-child {
    margin-right: 10px;
  }
  .pokuraTable tr {
    border-bottom: 2px solid #d82f66;
  }
  .pokuraTable th {
    padding: 4px;
  }
  .pokuraTable td {
    padding: 0 4px;
  }
  .pokuraTable td img {
    vertical-align: middle;
  }
  .profileTable {
    margin: 10px auto;
    font-size: 14px;
  }
  .profileTable td {
    padding: 5px;
  }
  .profileTable td:first-child {
    font-weight: bold;
  }
  @media (max-width: 768px) {
    .pokura {
      flex-direction: column;
    }
    .pokuraTable {
      width: 100%;
      margin-bottom: 20px;
    }
    .profileTable {
      width: auto;
    }
    .pokuraTable th:first-child,td:first-child {
      min-width: 20px;
    }
    .pokuraTable th:nth-child(4),td:nth-child(4) {
      min-width: 40px;
    }
    .pokuraTable th:nth-child(5),td:nth-child(5) {
      min-width: 40px;
    }
    .pokuraTable th:nth-child(6),td:nth-child(6) {
      min-width: 50px;
    }
  }
  </style>
  <table class="pokuraTable profileTable"><tr><td>プレーヤー名</td><td>${player}</td></tr><tr><td>ポックラ</td><td>${avg.toFixed(
    2
  )}</td></tr></table>
  <div class="pokura">
  <table class="pokuraTable">
    <tr><th>LV</th><th>ジャンル</th><th>曲名</th><th>スコア</th><th>メダル</th><th>ポックラ</th></tr>
    ${s
      .slice(0, 25)
      .map(
        (x) =>
          `<tr><td>${x.level}</td><td>${x.genre}</td><td>${x.song}</td><td>${
            x.score
          }</td><td><img src="https://eacache.s.konaminet.jp/game/popn/peace/p/images/p/common/medal/meda_${
            x.medal
          }.png"></td><td>${x.point.toFixed(2)}</td></tr>`
      )
      .join("")}
  </table>
  <table class="pokuraTable">
    <tr><th>LV</th><th>ジャンル</th><th>曲名</th><th>スコア</th><th>メダル</th><th>ポックラ</th></tr>
    ${s
      .slice(25)
      .map(
        (x) =>
          `<tr><td>${x.level}</td><td>${x.genre}</td><td>${x.song}</td><td>${
            x.score
          }</td><td><img src="https://eacache.s.konaminet.jp/game/popn/peace/p/images/p/common/medal/meda_${
            x.medal
          }.png"></td><td>${x.point.toFixed(2)}</td></tr>`
      )
      .join("")}
  </table></div>`;

  document.body.innerHTML = "";
  document.body.appendChild(divEl);
}

wapper();
