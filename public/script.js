// public/script.js - 上部バーの表示を安定化する修正版
// ※HTML/CSS は変更しない前提（index.html はそのまま）
// ※既存の loadSite() ロジックをベースにしている場合は関数名を合わせてください。
//    ここではあなたが渡してくれた loadSite 関数をそのまま使う前提で wire をつなぎます。

let proxiedActive = false;
let hideTimer = null;
let showDebounce = null;
const SHOW_THRESHOLD = 40; // 上端からのピクセル閾値
const HIDE_DELAY = 700; // ms

function ensureBarInit() {
  const bar = document.getElementById('top-small');
  if (!bar) return;
  // ここで transform ベースのアニメーションを強制セット（CSS変更不要）
  bar.style.willChange = 'transform';
  bar.style.transition = bar.style.transition || 'transform 260ms ease, opacity 200ms ease';
  bar.style.transform = 'translateY(-120%)';
  bar.style.opacity = '0';
  bar.dataset.visible = 'false';
  // もう一度確実に画面外へ（初期化タイミングのズレ対策）
  setTimeout(() => {
    bar.style.transform = 'translateY(-120%)';
    bar.style.opacity = '0';
    bar.dataset.visible = 'false';
  }, 10);
}

function setTopSmallVisible(visible) {
  const bar = document.getElementById('top-small');
  if (!bar) return;
  if (visible) {
    bar.style.transform = 'translateY(0)';
    bar.style.opacity = '1';
    bar.dataset.visible = 'true';
  } else {
    bar.style.transform = 'translateY(-120%)';
    bar.style.opacity = '0';
    bar.dataset.visible = 'false';
  }
}

// URL 判定は元の looksLikeUrl を尊重（あればそちらを使ってください）
function looksLikeUrl(s) {
  if (!s) return false;
  try {
    const u = new URL(s);
    return !!u.protocol;
  } catch (e) {
    return /\S+\.\S+/.test(s) && !/\s/.test(s);
  }
}

// loadSite は既存のものをそのまま使っている想定。
// loadSite 完了時に proxiedActive = true に必ずする修正をここでラップしても良いです。
// もしあなたの loadSite を上書きできるなら、下の wrapper を使ってください。

async function wrappedLoadSite(url) {
  // hide bar until load finished
  proxiedActive = false;
  setTopSmallVisible(false);

  // call your existing loadSite implementation (assumed present).
  // If your original function is named loadSite, call it; otherwise adapt.
  if (typeof loadSiteOriginal === 'function') {
    try {
      await loadSiteOriginal(url); // ← あなたの既存 loadSite を別名で保持しておく想定
      // 読み込み成功
      proxiedActive = true;
      // 小バーの入力欄に現在の URL を入れておく（ユーザビリティ向上）
      try {
        const smallInput = document.querySelector('#top-small input');
        let resolved = url;
        if (!/^[a-zA-Z][a-zA-Z0-9+\-.]*:/.test(url) && looksLikeUrl(url)) resolved = 'https://' + url;
        if (!looksLikeUrl(url)) {
          // 検索クエリだった場合は Google 検索の URL を入れる（任意）
          resolved = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
        }
        if (smallInput) smallInput.value = resolved;
      } catch (e) {}
    } catch (e) {
      proxiedActive = false;
      throw e;
    }
  } else {
    // fallback: if original not present, call your loadSite directly
    if (typeof loadSite === 'function') {
      await loadSite(url);
      proxiedActive = true;
    } else {
      console.error('wrappedLoadSite: no loadSiteOriginal or loadSite function found.');
    }
  }
}

// --- イベントワイヤリング（セレクタは index.html に合わせてあります） ---
function wireSearchBoxes() {
  const largeInput = document.querySelector('#top-large input');
  const largeButton = document.querySelector('#top-large button');
  const smallInput = document.querySelector('#top-small input');
  const smallButton = document.querySelector('#top-small button');

  // GO ボタンは必ず右横で高さを揃えることは HTML/CSS 側で担保されています。
  if (largeButton) {
    largeButton.addEventListener('click', () => {
      const v = (largeInput && largeInput.value) ? largeInput.value.trim() : '';
      if (!v) return;
      // use wrappedLoadSite so proxiedActive is handled
      wrappedLoadSite(v).catch(err => {
        console.error('load error', err);
        const content = document.getElementById('content');
        if (content) content.innerHTML = `<div style="padding:24px;color:#900">読み込みに失敗しました：${String(err).replace(/</g,'&lt;')}</div>`;
      });
    });
  }
  if (largeInput) {
    largeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const v = largeInput.value.trim();
        if (v) {
          wrappedLoadSite(v).catch(err => console.error(err));
        }
      }
    });
  }

  if (smallButton) {
    smallButton.addEventListener('click', () => {
      const v = (smallInput && smallInput.value) ? smallInput.value.trim() : '';
      if (v) wrappedLoadSite(v).catch(err => console.error(err));
    });
  }
  if (smallInput) {
    smallInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const v = smallInput.value.trim();
        if (v) wrappedLoadSite(v).catch(err => console.error(err));
      }
    });
  }
}

// 上部での自動表示（proxiedActive === true のときのみ反応）
function wireTopBarAutoShow() {
  const pointerHandler = (clientY) => {
    if (!proxiedActive) return;
    if (clientY <= SHOW_THRESHOLD) {
      clearTimeout(hideTimer);
      clearTimeout(showDebounce);
      // 少しデバウンスして表示（急な誤検出を抑える）
      showDebounce = setTimeout(() => setTopSmallVisible(true), 10);
    } else {
      clearTimeout(showDebounce);
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => setTopSmallVisible(false), HIDE_DELAY);
    }
  };

  document.addEventListener('mousemove', (e) => {
    pointerHandler(e.clientY);
  });

  document.addEventListener('touchstart', (e) => {
    const y = (e.touches && e.touches[0]) ? e.touches[0].clientY : 9999;
    pointerHandler(y);
  });

  // mouseleave: 画面外へ出たら隠す
  document.addEventListener('mouseleave', () => {
    clearTimeout(showDebounce);
    hideTimer = setTimeout(() => setTopSmallVisible(false), 200);
  });

  // リサイズ・スクロール時は一旦隠す（安定化）
  window.addEventListener('resize', () => {
    clearTimeout(showDebounce);
    hideTimer = setTimeout(() => setTopSmallVisible(false), 100);
  });
  window.addEventListener('scroll', () => {
    // ユーザがスクロールしたら誤検知防止で一旦隠す
    clearTimeout(showDebounce);
    hideTimer = setTimeout(() => setTopSmallVisible(false), 150);
  });
}

// 初期化
document.addEventListener('DOMContentLoaded', () => {
  ensureBarInit();
  wireSearchBoxes();
  wireTopBarAutoShow();

  // 初回はトップページなので小バーは隠す（必ず）
  setTimeout(() => setTopSmallVisible(false), 20);
});
