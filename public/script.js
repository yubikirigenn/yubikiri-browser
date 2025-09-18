const form = document.getElementById("proxy-form");
const input = document.getElementById("url-input");
const iframe = document.getElementById("proxy-frame");
const message = document.getElementById("message");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const url = input.value.trim();
  if (!url) return;

  message.textContent = "";
  iframe.style.display = "block";
  iframe.srcdoc = "<p style='text-align:center'>読み込み中...</p>";

  try {
    const res = await fetch(`/proxy?url=${encodeURIComponent(url)}`);
    const contentType = res.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const data = await res.json();
      message.textContent = data.message || "コンテンツ取得できませんでした";
      iframe.style.display = "none";
    } else {
      const html = await res.text();
      iframe.srcdoc = html;
    }
  } catch (err) {
    message.textContent = "エラー: コンテンツを取得できませんでした。ネットワーク制限の可能性があります。";
    iframe.style.display = "none";
  }
});
