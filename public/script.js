// public/script.js
const form = document.getElementById('proxyForm');
const goBtn = document.getElementById('goBtn');
const urlInput = document.getElementById('url');
const result = document.getElementById('result');

let currentBlobUrl = null;

function showError(msg) {
  result.innerHTML = `<div style="color:#b00;padding:12px;background:#fee;border-radius:4px;">${msg}</div>`;
}

async function loadUrl(rawUrl) {
  let url = rawUrl.trim();
  if (!url) {
    showError('URLを入力してください');
    return;
  }
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

  result.innerHTML = '<div style="padding:12px">読み込み中…</div>';
  goBtn.disabled = true;

  try {
    const res = await fetch(`/proxy?url=${encodeURIComponent(url)}`, { method: 'GET' });
    if (!res.ok) throw new Error(`proxy error ${res.status} ${res.statusText}`);

    const html = await res.text();

    // 既存 blob を解放
    if (currentBlobUrl) {
      try { URL.revokeObjectURL(currentBlobUrl); } catch (e) {}
      currentBlobUrl = null;
    }

    const blob = new Blob([html], { type: 'text/html' });
    currentBlobUrl = URL.createObjectURL(blob);

    // iframe を作って blob を読み込ませる（これで X-Frame-Options の回避が期待できます）
    result.innerHTML = '';
    const iframe = document.createElement('iframe');
    iframe.src = currentBlobUrl;
    iframe.style.width = '100%';
    iframe.style.height = '80vh';
    iframe.style.border = '0';
    // 必要なら sandbox 属性を調整してください（ここは自由）
    // iframe.setAttribute('sandbox', 'allow-scripts allow-forms');

    // iframe の読み込み失敗をある程度検知（404のようなレスポンスは blob内のHTMLなので onload は呼ばれる）
    iframe.addEventListener('error', () => {
      showError('iframe の読み込みに失敗しました');
    });

    result.appendChild(iframe);
  } catch (err) {
    console.error('loadUrl error:', err);
    showError('読み込み中にエラーが発生しました: ' + (err.message || err));
  } finally {
    goBtn.disabled = false;
  }
}

// ボタンで明示的に起動（フォームのデフォルト送信を避ける）
goBtn.addEventListener('click', (e) => {
  e.preventDefault();
  loadUrl(urlInput.value);
});

// もし Enter キーでの送信を有効にしたければ、input でキー検出して呼ぶ（下のコードをコメント解除）
// urlInput.addEventListener('keydown', (e) => {
//   if (e.key === 'Enter') {
//     e.preventDefault();
//     loadUrl(urlInput.value);
//   }
//});
