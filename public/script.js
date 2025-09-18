const input = document.getElementById("url-input");
const btn = document.getElementById("go-btn");
const iframe = document.getElementById("proxy-frame");

btn.addEventListener("click", () => {
  const url = input.value.trim();
  if (!url) return;
  iframe.src = `/proxy?url=${encodeURIComponent(url)}`;
});
