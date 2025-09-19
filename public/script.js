// public/script.js
document.addEventListener("DOMContentLoaded", () => {
  const topLargeInput = document.querySelector("#top-large input");
  const topLargeButton = document.getElementById("top-large-go");
  const topSmallInput = document.querySelector("#top-small input");
  const topSmallButton = document.getElementById("top-small-go");
  const topSmall = document.getElementById("top-small");

  function isValidUrl(text) {
    try {
      // 先頭が http/https で始まらない場合は new URL() で相対扱いになってしまうので補正
      if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(text)) return false;
      new URL(text);
      return true;
    } catch {
      return false;
    }
  }

  function go(value) {
    value = (value || "").trim();
    if (!value) return;
    let target;
    if (isValidUrl(value)) {
      target = `/proxy?url=${encodeURIComponent(value)}`;
    } else {
      target = `/proxy?url=${encodeURIComponent("https://www.google.com/search?q=" + encodeURIComponent(value))}`;
    }
    window.location.href = target;
  }

  // 大バーの送信
  if (topLargeButton) topLargeButton.addEventListener("click", () => go(topLargeInput.value));
  if (topLargeInput) topLargeInput.addEventListener("keydown", e => { if (e.key === "Enter") go(topLargeInput.value); });

  // 小バーの送信
  if (topSmallButton) topSmallButton.addEventListener("click", () => go(topSmallInput.value));
  if (topSmallInput) topSmallInput.addEventListener("keydown", e => { if (e.key === "Enter") go(topSmallInput.value); });

  // スクロールで小バー表示（あなたの既存の動作に合わせて）
  window.addEventListener("scroll", () => {
    if (window.scrollY > 150) {
      topSmall.style.top = "0";
    } else {
      topSmall.style.top = "-80px"; // CSS に合わせて微調整
    }
  });
});
