// public/script.js
const form = document.getElementById('proxyForm');
const goBtn = document.getElementById('goBtn') || document.getElementById('go');
const urlInput = document.getElementById('url');
const result = document.getElementById('result');

function showError(msg) {
  result.innerHTML = `<div style="color:#b00;padding:12px;background:#fee;border-radius:4px;">${msg}</div>`;
}

// Try sequence:
// 1) Fetch proxied HTML (our /proxy) and set iframe.srcdoc (best chance to preserve layout)
// 2) If srcdoc leads to issues (e.g. resources failing), fallback to iframe.src = /proxy?url=... (let browser request the endpoint directly)
let tryCount = 0;
async function loadUrl(rawUrl) {
  tryCount++;
  let url = rawUrl.trim();
  if (!url) { showError('URLを入力してください'); return; }
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

  result.innerHTML = '<div style="padding:12px">読み込み中…</div>';
  if (goBtn) goBtn.disabled = true;

  try {
    // fetch proxied HTML first
    const res = await fetch(`/proxy?url=${encodeURIComponent(url)}`);
    if (!res.ok) throw new Error(`proxy error ${res.status}`);
    const html = await res.text();

    // Build an iframe and set srcdoc (srcdoc uses our HTML string)
    result.innerHTML = '';
    const iframe = document.createElement('iframe');
    iframe.style.width = '100%';
    iframe.style.height = '80vh';
    iframe.style.border = '0';
    // Add base tag if not present so relative paths resolve to /r proxies (server already inserted base)
    // set srcdoc
    iframe.srcdoc = html;

    // If the iframe loads but resources fail (network errors), we fallback after a short delay
    let fallbackTimer = setTimeout(() => {
      // If after 2.5s images/styles still not loaded (heuristic), fallback to direct /proxy iframe
      // We check iframe.contentWindow only if same-origin allowed — srcdoc is same-origin so okay
      try {
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        // Count number of images in doc and whether any have naturalWidth > 0
        const imgs = doc.getElementsByTagName('img');
        let haveLoadedImg = false;
        for (let i=0;i<imgs.length;i++){
          if (imgs[i].naturalWidth && imgs[i].naturalWidth>0) { haveLoadedImg = true; break; }
        }
        // If no images loaded and there are images expected, fallback
        if (imgs.length > 0 && !haveLoadedImg) {
          // fallback to direct /proxy iframe
          iframe.remove();
          result.innerHTML = '';
          const f2 = document.createElement('iframe');
          f2.style.width='100%'; f2.style.height='80vh'; f2.style.border='0';
          f2.src = `/proxy?url=${encodeURIComponent(url)}&_=${Date.now()}`;
          result.appendChild(f2);
        }
      } catch (e) {
        // cross-origin or other; attempt fallback anyway
        iframe.remove();
        result.innerHTML = '';
        const f2 = document.createElement('iframe');
        f2.style.width='100%'; f2.style.height='80vh'; f2.style.border='0';
        f2.src = `/proxy?url=${encodeURIComponent(url)}&_=${Date.now()}`;
        result.appendChild(f2);
      }
    }, 2500); // 2.5s heuristic

    iframe.addEventListener('load', () => {
      clearTimeout(fallbackTimer);
      if (goBtn) goBtn.disabled = false;
    });

    result.appendChild(iframe);
  } catch (err) {
    console.error('loadUrl error', err);
    showError('読み込みに失敗しました: ' + (err.message || err));
    if (goBtn) goBtn.disabled = false;
  }
}

const btn = document.getElementById('goBtn') || document.getElementById('go');
if (btn) {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    loadUrl(urlInput.value);
  });
} else {
  const formEl = document.getElementById('proxyForm');
  if (formEl) {
    formEl.addEventListener('submit', (e) => {
      e.preventDefault();
      loadUrl(urlInput.value);
    });
  }
}
