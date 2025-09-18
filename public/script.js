document.getElementById("goBtn").addEventListener("click", () => {
  const url = document.getElementById("urlInput").value.trim();
  if (!url) return;

  const frame = document.getElementById("browserFrame");
  frame.src = "/proxy?url=" + encodeURIComponent(url);
});
