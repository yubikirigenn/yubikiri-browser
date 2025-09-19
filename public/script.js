// === 変更 / 追加するコード（public/script.js） ===

// 既存の簡易 fetchPage を置き換える形で下記を使ってください。
// 変更なしの部分は省略しています（あなたの既存UIに合わせる想定）。

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
    // if it parses as URL with protocol, accept
    const u = new URL(s);
    return !!u.protocol;
  } catch (e) {
    // no protocol: if it contains a dot and no spaces, treat as URL (e.g. example.com)
    return /\S+\.\S+/.test(s) && !/\s/.test(s);
  }
}

// 実際にプロキシ経由でページを読み込む（#content に HTML を入れる）
// url は文字列（完全URLまたはホスト名など）
async function loadSite(url) {
  const content = document.getElementById('content');
  if (!content) return;
  proxiedActive = false; // 読み込み前は false（失敗時にトップバーが出ないよう）
  setTopSmallVisible(false);

  // 非URLなら Google 検索クエリに変換（proxy 経由で検索ページを開く）
  let target;
  if (looksLikeUrl(url)) {
    // 補完：スキームがないなら https:// を付ける
    if (!/^[a-zA-Z][a-zA-Z0-9+\-.]*:/.test(url)) {
      target = 'https://' + url;
    } else {
      target = url;
    }
  } else {
    // Google 検索（プロキシ経由）
    const q = encodeURIComponent(url);
    target = `https://www.google.com/search?q=${q}`;
  }

  try {
    const res = await fetch(`/proxy?url=${encodeURIComponent(target)}`);
    if (!res.ok) throw new Error('HTTP error! status: ' + res.status);
    const html = await res.text();

    // 中身を差し替え
    content.innerHTML = html;

    // 読み込み成功 → プロキシ表示モードに切替
    proxiedActive = true;

    // 最初はカーソル待ち（すぐ表示させたくなければ false のまま）
    // setTopSmallVisible(true); // 即表示したければ有効化
  } catch (err) {
    console.error('Client fetch error:', err);
    content.innerHTML = `<div style="padding:24px;color:#900">読み込みに失敗しました：${String(err).replace(/</g,'&lt;')}</div>`;
    proxiedActive = false;
    setTopSmallVisible(false);
  }
}

// --- トップ（大）と小バーの GO / Enter 処理をバインド ---
// 既存のUIに合わせて input 要素のセレクタを変えてください。
// (#top-large input) はトップページの大きい検索、 (#top-small input) は小バーの入力。

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

// --- マウス / タッチで上部に来たら表示、離れたら隠す ---
// proxiedActive が true のときだけ反応（トップページでは出ない）
function wireTopBarAutoShow() {
  document.addEventListener('mousemove', (e) => {
    if (!proxiedActive) return;
    if (e.clientY <= 40) {
      // すぐ表示
      clearTimeout(hideTimer);
      setTopSmallVisible(true);
    } else {
      // 少し時間を置いて隠す（誤検知を防ぐ）
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => setTopSmallVisible(false), 700);
    }
  });

  // タッチ端末向け（画面上端タップで表示）
  document.addEventListener('touchstart', (e) => {
    if (!proxiedActive) return;
    const y = e.touches && e.touches[0] ? e.touches[0].clientY : 9999;
    if (y <= 40) {
      setTopSmallVisible(true);
    } else {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => setTopSmallVisible(false), 700);
    }
  });

  // マウスがウィンドウ外に行ったら隠す
  document.addEventListener('mouseleave', () => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => setTopSmallVisible(false), 300);
  });

  // ウィンドウリサイズ時に隠す（高さ再計算）
  window.addEventListener('resize', () => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => setTopSmallVisible(false), 100);
  });
}

// 初期化（ページ読み込み時）
document.addEventListener('DOMContentLoaded', () => {
  // 最初は小バーを確実に隠す
  setTimeout(() => setTopSmallVisible(false), 10);

  // ボタン系と自動表示をワイヤー
  wireSearchBoxes();
  wireTopBarAutoShow();

  // 既定で何かを読み込む場合はここを呼ぶ（例：前は Amazon を開いていた）
  // loadSite('https://www.amazon.co.jp/');
});
