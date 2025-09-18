const form = document.getElementById('proxyForm');
const result = document.getElementById('result');

form.addEventListener('submit', (e) => {
  e.preventDefault();
  let url = document.getElementById('url').value.trim();

  if (!url) {
    alert('URLを入力してください');
    return;
  }

  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }

  result.innerHTML = `<iframe src="/proxy?url=${encodeURIComponent(url)}" width="100%" height="600" frameborder="0"></iframe>`;
});
