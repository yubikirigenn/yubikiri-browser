// public/script.js (変更)
const form = document.getElementById('proxyForm');
const goBtn = document.getElementById('goBtn') || document.getElementById('go'); // もし id 名が違えば対応
const urlInput = document.getElementById('url');
const result = document.getElementById('result');

function showError(msg) {
  result.innerHTML = `<div style="color:#b00;padding:12px;background:#fee;border-radius:4px;">${msg}</div>`;
}

function createIframeForProxy(targetUrl) {
  // create iframe which points to our server-side /proxy endpoint directly
  const iframe = document.createElement('iframe');
  iframe.style.width = '100%';
  iframe.style.height = '80vh';
  iframe.style.border = '0';
  iframe.src = `/proxy?url=${encodeURIComponent(targetUrl)}&_=${Date.now()}`; // cache-bust
  return iframe;
}

async function loadUrl(rawUrl) {
  let url = rawUrl.trim();
  if (!url) {
    showError('URLを入力してください');
    return;
  }
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

  result.innerHTML = '<div style="padding:12px">読み込み中…</div>';
  if (goBtn) goBtn.disabled = true;

  try {
    // Instead of fetching HTML in client, we set iframe.src to /proxy so browser will request our server endpoint
    // This reduces origin mismatches and lets the browser handle resource loading naturally.
    result.innerHTML = '';
    const iframe = createIframeForProxy(url);
    result.appendChild(iframe);

    // optional: detect load or errors
    iframe.addEventListener('load', () => {
      // loaded (note: errors inside iframe won't trigger 'error' in many cases)
      if (goBtn) goBtn.disabled = false;
    });
    // set a timeout fallback in case load never fires
    setTimeout(() => { if (goBtn) goBtn.disabled = false; }, 20000);
  } catch (err) {
    console.error('loadUrl error:', err);
    showError('読み込み中にエラーが発生しました: ' + (err.message || err));
    if (goBtn) goBtn.disabled = false;
  }
}

// attach to button or form
const btn = document.getElementById('goBtn') || document.getElementById('go');
if (btn) {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    loadUrl(urlInput.value);
  });
} else {
  // fallback: form submit
  const formEl = document.getElementById('proxyForm');
  if (formEl) {
    formEl.addEventListener('submit', (e) => {
      e.preventDefault();
      loadUrl(urlInput.value);
    });
  }
}
