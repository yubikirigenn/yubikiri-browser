let proxiedActive = false;

// =============================
// 初期化
// =============================
window.addEventListener("DOMContentLoaded", () => {
  const searchForm = document.getElementById("search-form");
  const searchInput = document.getElementById("search-input");

  if (searchForm) {
    searchForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const query = searchInput.value.trim();
      if (query) {
        loadSite(query);
      }
    });
  }
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
    // scheme がない場合は https:// を補完
    if (!/^[a-zA-Z][a-zA-Z0-9+\-.]*:/.test(url)) {
      target = "https://" + url;
    } else {
      target = url;
    }
  } else {
    // Google 検索（proxy経由）
    const q = encodeURIComponent(url);
    target = `https://www.google.com/search?q=${q}`;
  }

  // === fetch 実行 ===
  try {
    const res = await fetch(`/proxy?url=${encodeURIComponent(target)}`);
    if (!res.ok) throw new Error("HTTP error! status: " + res.status);
    const html = await res.text();

    // ページ内容を置き換え
    content.innerHTML = html;

    proxiedActive = true;

    // ✅ トップページを隠す
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
  return /\./.test(str); // 簡易判定（ドメインっぽければURL扱い）
}

// 小さいバーの表示/非表示
function setTopSmallVisible(visible) {
  const topSmall = document.getElementById("top-small");
  if (topSmall) {
    topSmall.style.display = visible ? "block" : "none";
  }
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
