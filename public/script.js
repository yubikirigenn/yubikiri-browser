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

  try {
    const response = await fetch(`/proxy?url=${encodeURIComponent(url)}`);
    if (!response.ok) throw new Error("取得失敗");
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      const json = await response.json();
      throw new Error(json.message || "取得失敗");
    }
    const html = await response.text();
    iframe.srcdoc = html;
  } catch (err) {
    iframe.style.display = "none";
    message.textContent = "コンテンツ取得エラー: " + err.message;
  }
});
