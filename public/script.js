// === script.js 完全版（Loading対応） ===

let proxiedActive = false;
let hideTimer = null;

// --- トップバー表示／非表示 ---
function setTopSmallVisible(visible) {
  const bar = document.getElementById('top-small');
  if (!bar) return;
  const h = bar.offsetHeight || 60;
  bar.style.top = visible ? '0' : `-${h}px`;
}

// --- Loading表示 ---
function showLoading(show) {
  const content = document.getElementById('content');
  if (!content) return;
  if (show) {
    content.innerHTML = `<div style="padding:24px;font-size:18px;color:#555">Loading…</div>`;
    setTopSmallVisible(true);
  }
}

// --- URL判定 ---
function looksLikeUrl(s) {
  if (!s) return false;
  try {
    const u = new URL(s);
    return !!u.protocol;
  } catch (e) {
    return /\S+\.\S+/.test(s) && !/\s/.test(s);
  }
}

// --- ページ読み込み ---
async function loadSite(url) {
  if (!url) return;
  showLoading(true);
  proxiedActive = false;

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
    const content = document.getElementById('content');
    content.innerHTML = html;
    proxiedActive = true;
    setTopSmallVisible(false); // 読み込み完了後はバー非表示
  } catch (err) {
    const content = document.getElementById('content');
    content.innerHTML = `<div style="padding:24px;color:#900">読み込みに失敗しました：${String(err).replace(/</g,'&lt;')}</div>`;
    proxiedActive = false;
    setTopSmallVisible(false);
  }
}

// --- 検索ボックス GO / Enter ---
function wireSearchBoxes() {
  const largeInput = document.querySelector('#top-large input');
  const largeButton = document.querySelector('#top-large button');
  const smallInput = document.querySelector('#top-small input');
  const smallButton = document.querySelector('#top-small button');

  if (largeButton) largeButton.addEventListener('click', () => loadSite(largeInput?.value.trim()));
  if (largeInput) largeInput.addEventListener('keydown', e => { if (e.key === 'Enter') loadSite(largeInput.value.trim()); });

  if (smallButton) smallButton.addEventListener('click', () => loadSite(smallInput?.value.trim()));
  if (smallInput) smallInput.addEventListener('keydown', e => { if (e.key === 'Enter') loadSite(smallInput.value.trim()); });
}

// --- バー自動表示 ---
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

// --- 初期化 ---
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => setTopSmallVisible(false), 10);
  wireSearchBoxes();
  wireTopBarAutoShow();
});
