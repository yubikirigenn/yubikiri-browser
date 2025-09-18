const form = document.getElementById('proxyForm');
const iframe = document.getElementById('resultFrame');

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const url = document.getElementById('url').value;

  if (!url.startsWith('https://github.com')) {
    alert('GitHubのURLを入力してください');
    return;
  }

  iframe.src = `/proxy?url=${encodeURIComponent(url)}`;
});
