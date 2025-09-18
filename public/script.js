// public/script.js
const form = document.getElementById('proxyForm');
const result = document.getElementById('result');

let currentBlobUrl = null;

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  let url = document.getElementById('url').value.trim();
  if (!url) { alert('URLを入力してください'); return; }
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

  result.innerHTML = '読み込み中...';

  try {
    const res = await fetch(`/proxy?url=${encodeURIComponent(url)}`);
    if (!res.ok) throw new Error('proxy error: ' + res.statusText);
    const html = await res.text();

    // clean previous blob
    if (currentBlobUrl) {
      URL.revokeObjectURL(currentBlobUrl);
      currentBlobUrl = null;
    }

    const blob = new Blob([html], { type: 'text/html' });
    currentBlobUrl = URL.createObjectURL(blob);

    // create iframe and set src to blob
    result.innerHTML = '';
    const iframe = document.createElement('iframe');
    iframe.style.width = '100%';
    iframe.style.height = '80vh';
    iframe.style.border = '0';
    iframe.src = currentBlobUrl;

    // optional: sandbox attribute if you want to restrict (omit if full functionality required)
    // iframe.setAttribute('sandbox', 'allow-scripts allow-forms allow-same-origin'); 
    // note: allow-same-origin will cause blob to inherit origin? be careful with sandbox flags.

    result.appendChild(iframe);
  } catch (err) {
    result.innerHTML = 'エラー: ' + err.message;
  }
});
