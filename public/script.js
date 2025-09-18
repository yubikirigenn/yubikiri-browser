const form = document.getElementById("proxy-form");
const input = document.getElementById("url-input");
const iframe = document.getElementById("proxy-frame");

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const url = input.value.trim();
  if (!url) return;

  iframe.style.display = "block";
  iframe.src = `/proxy?url=${encodeURIComponent(url)}`;
});
