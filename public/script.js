const form = document.getElementById('proxyForm');
const result = document.getElementById('result');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  let url = document.getElementById('url').value.trim();

  if (!url) {
    alert('URLを入力してください');
    return;
  }

  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }

  result.innerHTML = "読み込み中...";

  try {
    const res = await fetch(`/proxy?url=${encodeURIComponent(url)}`);
    const html = await res.text();
    result.innerHTML = html;
  } catch (err) {
    result.innerHTML = "エラー: " + err.message;
  }
});
