const form = document.getElementById('urlForm');
const input = document.getElementById('urlInput');
const content = document.getElementById('content');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = input.value.trim();
  if (!url) return;

  content.innerHTML = "読み込み中...";

  try {
    const res = await fetch(`/proxy?url=${encodeURIComponent(url)}`);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const html = await res.text();
    content.innerHTML = html;
  } catch (err) {
    content.innerHTML = `<p style="color:red;">読み込みに失敗しました: ${err.message}</p>`;
    console.error("Client fetch error:", err);
  }
});
