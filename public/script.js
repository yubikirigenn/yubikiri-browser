document.getElementById("goForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const url = document.getElementById("url").value;

  if (!url) return alert("URLを入力してください");

  const formData = new URLSearchParams();
  formData.append("url", url);

  const res = await fetch("/go", {
    method: "POST",
    body: formData
  });

  const html = await res.text();
  const iframe = document.getElementById("result");
  iframe.srcdoc = html; // iframe内に取得したHTMLを表示
});
