document.getElementById("goBtn").addEventListener("click", () => {
  const url = document.getElementById("urlInput").value.trim();
  if (!url) return alert("URLを入力してください");

  const target = encodeURIComponent(url);
  document.getElementById("proxyFrame").src = `/proxy?url=${target}`;
});
