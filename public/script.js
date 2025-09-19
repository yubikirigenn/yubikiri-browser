」async function fetchPage() {
  const url = encodeURIComponent("https://www.amazon.co.jp/");
  try {
    const res = await fetch(`/proxy?url=${url}`);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const html = await res.text();
    document.getElementById("content").innerHTML = html;
  } catch (err) {
    console.error("Client fetch error:", err);
    document.getElementById("content").innerText = "Failed to load page";
  }
}

fetchPage();
