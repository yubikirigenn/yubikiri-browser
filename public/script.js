async function fetchPage() {
  const url = encodeURIComponent('https://www.amazon.co.jp/');
  try {
    const res = await fetch(`/proxy?url=${url}`);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const html = await res.text();
    document.getElementById('content').innerHTML = html;
  } catch (err) {
    document.getElementById('content').innerText = 'Client fetch error: ' + err;
    console.error('Client fetch error:', err);
  }
}

fetchPage();
