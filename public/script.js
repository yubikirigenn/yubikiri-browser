let proxiedActive = false;

// =============================
// 初期化
// =============================
window.addEventListener("DOMContentLoaded", () => {
  wireSearchBoxes();
  wireTopBarAutoShow();
  setTopSmallVisible(false); // 最初は小バー非表示
});

// =============================
// サイトを読み込む
// =============================
async function loadSite(url) {
  const content = document.getElementById("content");
  const topLarge = document.getElementById("top-large");

  if (!content) return;

  proxiedActive = false;
  setTopSmallVisible(false);

  // === URL を決定 ===
  let target;
  if (looksLikeUrl(url)) {
    if (!/^[a-zA-Z][a-zA-Z0-9+\-.]*:/.test(url)) {
      target = "https://" + url;
    } else {
      target = url;
    }
  } else {
    const q = encodeURIComponent(url);
    target = `https://www.google.com/search?q=${q}`;
  }

  // === fetch 実行 ===
  try {
    const res = await fetch(`/proxy?url=${encodeURIComponent(target)}`);
    if (!res.ok) throw new Error("HTTP error! status: " + res.status);
    const html = await res.text();

    content.innerHTML = html;
    proxiedActive = true;

    if (topLarge) {
      topLarge.style.display = "none";
    }
  } catch (err) {
    console.error("Client fetch error:", err);
    content.innerHTML = `<div style="padding:24px;color:#900">
      読み込みに失敗しました：${String(err).replace(/</g, "&lt;")}
    </div>`;
    proxiedActive = false;
    setTopSmallVisible(false);
  }
}

// =============================
// ヘルパー関数
// =============================

// URLらしいかを判定
function looksLikeUrl(str) {
  return /\./.test(str);
}

// 小さいバーの表示/非表示
function setTopSmallVisible(visible) {
  const topSmall = document.getElementById("top-small");
  if (topSmall) {
    topSmall.style.display = visible ? "block" : "none";
  }
}

// =============================
// 検索ボックスの動作を紐づけ
// =============================
function wireSearchBoxes() {
  const largeInput = document.querySelector("#top-large input");
  const largeButton = document.getElementById("top-large-go");
  const smallInput = document.querySelector("#top-small input");
  const smallButton = document.getElementById("top-small-go");

  if (largeButton) {
    largeButton.addEventListener("click", () => {
      const v = largeInput.value.trim();
      if (v) loadSite(v);
    });
  }
  if (largeInput) {
    largeInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const v = largeInput.value.trim();
        if (v) loadSite(v);
      }
    });
  }

  if (smallButton) {
    smallButton.addEventListener("click", () => {
      const v = smallInput.value.trim();
      if (v) loadSite(v);
    });
  }
  if (smallInput) {
    smallInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const v = smallInput.value.trim();
        if (v) loadSite(v);
      }
    });
  }
}

// =============================
// 上部バーの自動表示/非表示
// =============================
function wireTopBarAutoShow() {
  let hideTimer = null;
  document.addEventListener("mousemove", (e) => {
    if (!proxiedActive) return;
    if (e.clientY <= 40) {
      clearTimeout(hideTimer);
      setTopSmallVisible(true);
    } else {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => setTopSmallVisible(false), 700);
    }
  });
}

// =============================
// 内部用ラッパー
// =============================
function wrappedLoadSite(url) {
  if (typeof loadSite === "function") {
    loadSite(url);
  } else {
    console.error("wrappedLoadSite: loadSite 関数が見つかりません");
  }
}
