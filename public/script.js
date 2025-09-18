const form = document.getElementById('proxyForm');
const iframe = document.getElementById('resultFrame');

form.addEventListener('submit', (e) => {
  e.preventDefault();
  let url = document.getElementById('url').value.trim();

  if (!url) {
    alert('URLを入力してください');
    return;
  }

  // http/https が無ければ自動で付与
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }

  iframe.src = `/proxy?url=${encodeURIComponent(url)}`;
});
