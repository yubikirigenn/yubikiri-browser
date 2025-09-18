document.getElementById("proxyForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const url = document.getElementById("urlInput").value;
  if (url) {
    document.getElementById("proxyFrame").src = "/proxy?url=" + encodeURIComponent(url);
    document.querySelector(".iframe-container").style.display = "block";
  }
});
