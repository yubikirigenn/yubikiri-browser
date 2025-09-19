// script.js

// 入力とボタンの取得
const topLargeInput = document.querySelector("#top-large input");
const topLargeButton = document.querySelector("#top-large button");

const topSmallInput = document.querySelector("#top-small input");
const topSmallButton = document.querySelector("#top-small button");

// 入力値を判定して proxy に飛ばす関数
function goToProxy(inputValue) {
  inputValue = inputValue.trim();
  let url;
  try {
    url = new URL(inputValue); // URLとして正しい場合はそのまま
  } catch {
    // URLでない場合は Google 検索に変換
    url = new URL("https://www.google.com/search?q=" + encodeURIComponent(inputValue));
  }
  window.location.href = "/proxy?url=" + encodeURIComponent(url);
}

// 大きなバーのボタンイベント
topLargeButton.addEventListener("click", () => {
  goToProxy(topLargeInput.value);
});

// Enter キーでの送信
topLargeInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") goToProxy(topLargeInput.value);
});

// 小さなバーのボタンイベント
topSmallButton.addEventListener("click", () => {
  goToProxy(topSmallInput.value);
});

// Enter キーでの送信
topSmallInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") goToProxy(topSmallInput.value);
});

// スクロールで小バー表示
const topSmall = document.getElementById("top-small");
window.addEventListener("scroll", () => {
  if (window.scrollY > 150) {
    topSmall.style.top = "0";
  } else {
    topSmall.style.top = "-60px";
  }
});
