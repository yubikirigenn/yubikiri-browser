let proxiedActive = false; // プロキシで外部サイトを表示中か
let hideTimer = null;

// utility: 表示/非表示（高さを取得して確実に隠す）
function setTopSmallVisible(visible) {
  const bar = document.getElementById('top-small');
  if (!bar) return;
  const h = bar.offsetHeight || 60; // fallback
  if (visible) {
    bar.style.top = '0';
  } else {
    bar.style.top = `-${h}px`;
  }
}

// 入力値がURLぽいか判定（簡易）
function looksLikeUrl(s) {
  if (!s) return false;
  try {
    const u = new URL(s);
    return !!u.protocol;
  } catch (e) {
    return /\S+\.\S+/.test(s) && !/\s/.test(s);
  }
}

// 実際にプロキシ経由でページを読み込む
async function loadSite(url) {
  const content = document.getElementById('content');
  const topLarge = document.getElementById('top-large'); // ←トップ画面
  if (!content) return;

  proxiedActive = false;
  setTopSmallVisible(false);

  // 非URLなら Google 検索にする
  let target;
  if (looksLikeUrl(url)) {
    if (!/^[a-zA-Z][a-zA-Z0-9+\-.]*:/.test(url)) {
      target = 'https://' + url;
    } else {
      target = url;
    }
  } else {
    const q = encodeURIComponent(url);
    target = `https://www.google.com/search?q=${q}`;
  }

  try {
    // トップ画面を隠す（ここが重要！）
    if (topLarge) {
      topLarge.style.display = "none";
    }

    content.innerHTML = `<div style="padding:24px;font-size:18px;color:#555">Loading…</div>`;

    const res = await fetch(`/proxy?url=${encodeURIComponent(target)}`);
    if (!res.ok) throw new Error('HTTP error! status: ' + res.status);
    const html = await res.text();

    content.innerHTML = html;
    proxiedActive = true;
  } catch (err) {
    console.error('Client fetch error:', err);
    content.innerHTML = `<div style="padding:24px;color:#900">読み込みに失敗しました：${String(err).replace(/</g,'&lt;')}</div>`;
    proxiedActive = false;
    setTopSmallVisible(false);
  }
}

// --- 検索ボックスをバインド ---
function wireSearchBoxes() {
  const largeInput = document.querySelector('#top-large input');
  const largeButton = document.querySelector('#top-large button');
  const smallInput = document.querySelector('#top-small input');
  const smallButton = document.querySelector('#top-small button');

  if (largeButton) {
    largeButton.addEventListener('click', () => {
      const v = (largeInput && largeInput.value) ? largeInput.value.trim() : '';
      if (v) loadSite(v);
    });
  }
  if (largeInput) {
    largeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const v = largeInput.value.trim();
        if (v) loadSite(v);
      }
    });
  }

  if (smallButton) {
    smallButton.addEventListener('click', () => {
      const v = (smallInput && smallInput.value) ? smallInput.value.trim() : '';
      if (v) loadSite(v);
    });
  }
  if (smallInput) {
    smallInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const v = smallInput.value.trim();
        if (v) loadSite(v);
      }
    });
  }
}

// --- バーの自動表示 ---
function wireTopBarAutoShow() {
  document.addEventListener('mousemove', (e) => {
    if (!proxiedActive) return;
    if (e.clientY <= 40) {
      clearTimeout(hideTimer);
      setTopSmallVisible(true);
    } else {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => setTopSmallVisible(false), 700);
    }
  });

  document.addEventListener('mouseleave', () => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => setTopSmallVisible(false), 300);
  });
}

// 初期化
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => setTopSmallVisible(false), 10);
  wireSearchBoxes();
  wireTopBarAutoShow();
});
