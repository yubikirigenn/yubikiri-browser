async function fetchPage() {
  const url = encodeURIComponent('https://www.amazon.co.jp/');
  try {
    const res = await fetch(`/proxy?url=${url}`);
    const html = await res.text();
    document.getElementById('content').textContent = html; // 安全に表示
  } catch(e) {
    document.getElementById('content').textContent = "Fetch failed: " + e;
  }
}

fetchPage();
