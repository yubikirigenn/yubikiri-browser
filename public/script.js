document.getElementById("loadBtn").addEventListener("click", async () => {
  const url = document.getElementById("urlInput").value.trim();
  if (!url) return alert("URL を入力してください");

  try {
    const res = await fetch(`/proxy?url=${encodeURIComponent(url)}`);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const html = await res.text();
    document.getElementById("content").innerHTML = html;
  } catch (err) {
    document.getElementById("content").innerHTML = "読み込みに失敗しました: " + err.message;
    console.error(err);
  }
});
