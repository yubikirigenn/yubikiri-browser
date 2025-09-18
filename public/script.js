document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("proxy-form");
  const input = document.getElementById("url-input");
  const frame = document.getElementById("proxy-frame");

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const url = input.value.trim();
    if (!url) return;

    let target = url.startsWith("http") ? url : "https://" + url;
    frame.src = `/proxy?url=${encodeURIComponent(target)}`;
  });

  // 動的DOM監視（JSで追加されるリソースも書き換え対象）
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      m.addedNodes.forEach((node) => {
        if (node.tagName === "IMG" && node.src) {
          node.src = `/proxy?url=${encodeURIComponent(node.src)}`;
        }
      });
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });
});
