// public/script.js
// 既存の UI 構造（#top-large, #top-small, #content, button）はそのまま使います。

let proxiedActive = false;
let hideTimer = null;

// 小バーの高さを確実に隠す/表示する
function setTopSmallVisible(visible) {
  const bar = document.getElementById('top-small');
  if (!bar) return;
  const h = bar.offsetHeight || 60;
  bar.style.transition = 'top 0.28s ease';
  bar.style.top = visible ? '0' : `-${h + 2}px`;
}

// URL っぽいかどうかの簡易判定
function looksLikeUrl(s) {
  if (!s) return false;
  try {
    const u = new URL(s);
    return !!u.protocol;
  } catch (e) {
    return /\S+\.\S+/.test(s) && !/\s/.test(s);
  }
}

// script の強制実行：innerHTMLで入れた後に呼び出す
function runInsertedScripts(container) {
  // すべての script 要素を取得（NodeList はライブではないのでOK）
  const scripts = Array.from(container.querySelectorAll('script'));
  for (const old of scripts) {
    const script = document.createElement('script');
    // copy attributes except src handled below
    for (const attr of old.attributes) {
      if (attr.name === 'src') continue; // srcは別で設定
      script.setAttribute(attr.name, attr.value);
    }
    if (old.src) {
      // 外部スクリプト。src は proxy 経由に既に書き換わっているはず。
      script.src = old.src;
      // 古い script を置き換えることで確実に実行させる
      old.parentNode.replaceChild(script, old);
    } else {
      // inline script の場合、テキストをコピーして実行
      script.textContent = old.textContent || old.innerText || '';
      old.parentNode.replaceChild(script, old);
    }
  }
}

// link rel=stylesheet が innerHTML で入った場合でも、ブラウザは読み込むことが多いが
// 安全のために link を再作成して確実に読み込ませる
function refreshInsertedLinks(container) {
  const links = Array.from(container.querySelectorAll('link[rel="stylesheet"]'));
  for (const old of links) {
    const href = old.href;
    if (!href) continue;
    const nl = document.createElement('link');
    nl.rel = 'stylesheet';
    nl.href = href;
    // copy other attrs if any
    for (const attr of old.attributes) {
      if (attr.name === 'href' || attr.name === 'rel') continue;
      nl.setAttribute(attr.name, attr.value);
    }
    old.parentNode.replaceChild(nl, old);
  }
}

// ページをプロキシ経由で取得して #content に差し替える
async function loadSite(inputValue) {
  const content = document.getElementById('content');
  if (!content) return;
  setTopSmallVisible(false);
  proxiedActive = false;

  // 入力がURLぽければ補完、そうでなければ Google 検索ページを target にする
  let target = inputValue.trim();
  if (!looksLikeUrl(target)) {
    const q = encodeURIComponent(target);
    target = `https://www.google.com/search?q=${q}`;
  } else {
    // スキームが無ければ https を付ける
    if (!/^[a-zA-Z][a-zA-Z0-9+\-.]*:/.test(target)) target = 'https://' + target;
  }

  try {
    content.innerHTML = '<div style="padding:20px">読み込み中…</div>';
    const res = await fetch(`/proxy?url=${encodeURIComponent(target)}`);
    if (!res.ok) throw new Error('HTTP error! status: ' + res.status);
    const html = await res.text();

    // 差し替え（innerHTML -> script と link を再インサートして実行）
    content.innerHTML = html;

    // 外部スクリプトや inline スクリプトを確実に実行
    refreshInsertedLinks(content);
    runInsertedScripts(content);

    // 成功したのでプロキシモード ON（バーの自動動作許可）
    proxiedActive = true;
    // 小バーは最初は隠す（マウスを上に持っていくと出る）
    setTopSmallVisible(false);

    // トップページ（大きい見た目）を隠す（もし必要なら）
    // ここは UI に合わせて有効/無効を切替えてください。今はトップページの #top-large は残しておくので変更なし。

  } catch (err) {
    console.error("Client fetch error:", err);
    content.innerHTML = `<div style="padding:24px;color:#900">読み込みに失敗しました：${String(err).replace(/</g,'&lt;')}</div>`;
    proxiedActive = false;
    setTopSmallVisible(false);
  }
}

// UI バインド（既存の要素ID / 構造を使う）
function wireUI() {
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

// マウスが上端に来たら小バーを出し、離れたら自動で隠す（プロキシ表示時のみ）
function wireAutoTopBar() {
  document.addEventListener('mousemove', (e) => {
    if (!proxiedActive) return;
    if (e.clientY <= 36) {
      clearTimeout(hideTimer);
      setTopSmallVisible(true);
    } else {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => setTopSmallVisible(false), 600);
    }
  });

  document.addEventListener('mouseleave', () => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => setTopSmallVisible(false), 200);
  });

  window.addEventListener('resize', () => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => setTopSmallVisible(false), 200);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  // 初期では top-small を確実に隠す
  setTimeout(() => setTopSmallVisible(false), 10);
  wireUI();
  wireAutoTopBar();

  // 必要なら既定で開くサイトをここで loadSite() すれば OK
  // loadSite('https://www.amazon.co.jp/');
});
