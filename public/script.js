async function loadSite(url) {
  const content = document.getElementById('content');
  const topLarge = document.getElementById('top-large'); // トップ画面
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
    // トップ画面を確実に隠す
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

    // エラー時もトップ画面を隠す
    if (topLarge) {
      topLarge.style.display = "none";
    }
    setTopSmallVisible(false);
  }
}
