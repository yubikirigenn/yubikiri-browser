// === script.js ===

let proxiedActive = false; // プロキシで外部サイト表示中か
let hideTimer = null;

// --- トップバー表示/非表示 ---
function setTopSmallVisible(visible) {
  const bar = document.getElementById('top-small');
  if (!bar) return;
  const h = bar.offsetHeight || 60;
  bar.style.transition = 'top 0.3s ease';
  bar.style.top = visible ? '0' : `-${h}px`;
}

// --- URLっぽいか判定 ---
function looksLikeUrl(s) {
  if (!s) return false;
  try {
    const u = new URL(s);
    return !!u.protocol;
  } catch {
    return /\S+\.\S+/.test(s) && !/\s/.test(s);
  }
}

// --- サイト読み込み ---
async function loadSite(url) {
  const content = document.getElementById('content');
  if (!content) return;

  proxiedActive = false;
  setTopSmallVisible(false);

  let target;
  if (looksLikeUrl(url)) {
    target = /^[a-zA-Z][a-zA-Z0-9+\-.]*:/.test(url) ? url : 'https://' + url;
  } else {
    target = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
  }

  try {
    const res = await fetch(`/proxy?url=${encodeURIComponent(target)}`);
    if (!res.ok) throw new Error('HTTP status ' + res.status);
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

// --- 入力ボックスのイベント設定 ---
function wireSearchBoxes() {
  const largeInput = document.querySelector('#top-large input');
  const largeButton = document.querySelector('#top-large button');
  const smallInput = document.querySelector('#top-small input');
  const smallButton = document.querySelector('#top-small button');

  if (largeButton && largeInput) {
    largeButton.addEventListener('click', () => {
      const v = largeInput.value.trim();
      if (v) loadSite(v);
    });
    largeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const v = largeInput.value.trim();
        if (v) loadSite(v);
      }
    });
  }

  if (smallButton && smallInput) {
    smallButton.addEventListener('click', () => {
      const v = smallInput.value.trim();
      if (v) loadSite(v);
    });
    smallInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const v = smallInput.value.trim();
        if (v) loadSite(v);
      }
    });
  }
}

// --- 上部バー自動表示 ---
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

  document.addEventListener('touchstart', (e) => {
    if (!proxiedActive) return;
    const y = e.touches?.[0]?.clientY || 9999;
    if (y <= 40) {
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

  window.addEventListener('resize', () => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => setTopSmallVisible(false), 100);
  });
}

// --- 初期化 ---
document.addEventListener('DOMContentLoaded', () => {
  setTopSmallVisible(false);
  wireSearchBoxes();
  wireTopBarAutoShow();
});
