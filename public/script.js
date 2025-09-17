const urlInput = document.getElementById("urlInput");
const goBtn = document.getElementById("goBtn");
const proxyFrame = document.getElementById("proxyFrame");

function go() {
  let url = urlInput.value.trim();
  if (!url.startsWith("http")) url = "https://" + url;
  proxyFrame.src = `/proxy?url=${encodeURIComponent(url)}`;
}

goBtn.addEventListener("click", go);
urlInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") go();
});
