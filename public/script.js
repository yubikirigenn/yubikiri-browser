async function fetchPage() {
  const url = encodeURIComponent('https://www.amazon.co.jp/');
  const res = await fetch(`/proxy?url=${url}`);
  const html = await res.text();
  document.getElementById('content').innerHTML = html;
}

fetchPage();
