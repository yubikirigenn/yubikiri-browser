// ==========================
// script.js 修正版
// ==========================

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

// URLっぽいか判定（簡易）
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
  if (!content) return;
  proxiedActive = false;
  setTopSmallVisible(false);

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
    const res = await fetch(`/proxy?url=${encodeURIComponent(target)}`);
    if (!res.ok) throw new Error('HTTP error! status: ' + res.status);
    const html = await res.text();

    // HTML 内のすべてのリソースURLを proxy 経由に書き換える
    let parser = new DOMParser();
    let doc = parser.parseFromString(html, 'text/html');

    doc.querySelectorAll('link[href], script[src], img[src]').forEach(el => {
      const attr = el.tagName === 'LINK' ? 'href' : 'src';
      const originalUrl = el.getAttribute(attr);
      if (!originalUrl) return;
      try {
        const u = new URL(originalUrl, target);
        el.setAttribute(attr, window.location.origin + '/proxy?url=' + encodeURIComponent(u.href));
      } catch (e) {
        // 相対URLも proxy化
        el.setAttribute(attr, window.location.origin + '/proxy?url=' + encodeURIComponent(new URL(originalUrl, target).href));
      }
    });

    content.innerHTML = '';
    content.append(...doc.body.childNodes);

    proxiedActive = true;
    // 最初にバーを少し下げたままにしたい場合は false のまま
    // setTopSmallVisible(true);
  } catch (err) {
    console.error('Client fetch error:', err);
    content.innerHTML = `<div style="padding:24px;color:#900">読み込みに失敗しました：${String(err).replace(/</g,'&lt;')}</div>`;
    proxiedActive = false;
    setTopSmallVisible(false);
  }
}

// --- GO / Enter 処理 ---
function wireSearchBoxes() {
  const largeInput = document.querySelector('#top-large input');
  const largeButton = document.querySelector('#top-large button');
  const smallInput = document.querySelector('#top-small input');
  const smallButton = document.querySelector('#top-small button');

  if (largeButton) {
    largeButton.addEventListener('click', () => {
      const v = largeInput?.value.trim();
      if (v) loadSite(v);
    });
  }
  if (largeInput) {
    largeInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const v = largeInput.value.trim();
        if (v) loadSite(v);
      }
    });
  }

  if (smallButton) {
    smallButton.addEventListener('click', () => {
      const v = smallInput?.value.trim();
      if (v) loadSite(v);
    });
  }
  if (smallInput) {
    smallInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const v = smallInput.value.trim();
        if (v) loadSite(v);
      }
    });
  }
}

// --- 上部バーの自動表示／非表示 ---
function wireTopBarAutoShow() {
  document.addEventListener('mousemove', e => {
    if (!proxiedActive) return;
    if (e.clientY <= 40) {
      clearTimeout(hideTimer);
      setTopSmallVisible(true);
    } else {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => setTopSmallVisible(false), 700);
    }
  });

  document.addEventListener('touchstart', e => {
    if (!proxiedActive) return;
    const y = e.touches?.[0]?.clientY ?? 9999;
    if (y <= 40) setTopSmallVisible(true);
    else {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => setTopSmallVisible(false), 700);
    }
  });

  document.addEventListener('mouseleave', () => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => setTopSmallVisible(false), 300);
  });

  window.addEventListener('resize', () => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => setTopSmallVisible(false), 100);
  });
}

// 初期化
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => setTopSmallVisible(false), 10);
  wireSearchBoxes();
  wireTopBarAutoShow();

  // デフォルトで開きたいサイトがあればここに
  // loadSite('https://www.amazon.co.jp/');
});
