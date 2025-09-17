const form = document.getElementById("urlForm");
const input = document.getElementById("urlInput");
const iframe = document.getElementById("browserFrame");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const url = input.value;

  if (!url) return alert("URLを入力してください");

  try {
    const res = await fetch(`/fetch?url=${encodeURIComponent(url)}`);
    const html = await res.text();
    iframe.srcdoc = html;
  } catch (err) {
    iframe.srcdoc = `<h1>Failed to load</h1>`;
  }
});
