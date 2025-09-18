const form = document.getElementById('proxyForm');
const shadowContent = document.querySelector('#result').shadowRoot.querySelector('#shadowContent');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  let url = document.getElementById('url').value.trim();

  if (!url) url = 'https://' + url;
  else if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

  shadowContent.innerHTML = "読み込み中...";

  try {
    const res = await fetch(`/proxy?url=${encodeURIComponent(url)}`);
    const html = await res.text();
    shadowContent.innerHTML = html;
  } catch (err) {
    shadowContent.innerHTML = "エラー: " + err.message;
  }
});
