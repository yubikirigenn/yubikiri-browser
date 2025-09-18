const form = document.getElementById("proxyForm");
const input = document.getElementById("urlInput");
const iframe = document.getElementById("proxyFrame");

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const url = input.value.trim();
  if (!url) return;

  iframe.src = "/proxy?url=" + encodeURIComponent(url);
});
