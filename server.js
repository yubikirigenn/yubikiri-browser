import express from "express";
import fetch from "node-fetch";
import cookieParser from "cookie-parser";
import compression from "compression";

const app = express();
app.use(cookieParser());
app.use(compression());
app.use(express.static("public")); // /public フォルダの静的ファイルを配信

function rewriteHtml(html, baseUrl) {
  // リンク・画像・スクリプト・スタイル・iframe・動画などのURLを書き換え
  return html
    .replace(/(href|src|action|data-[^=]+)=["'](.*?)["']/g, (m, attr, url) => {
      if (!url.startsWith("http") && !url.startsWith("//")) return m;
      const fullUrl = url.startsWith("//") ? "https:" + url : url;
      return `${attr}="/proxy?url=${encodeURIComponent(fullUrl)}"`;
    })
    .replace(/url\((['"]?)(.*?)\1\)/g, (m, quote, url) => {
      if (!url.startsWith("http") && !url.startsWith("//")) return m;
      const fullUrl = url.startsWith("//") ? "https:" + url : url;
      return `url(${quote}/proxy?url=${encodeURIComponent(fullUrl)}${quote})`;
    })
    .replace(/fetch\((['"`])(.*?)\1/g, (m, quote, url) => {
      if (!url.startsWith("http") && !url.startsWith("//")) return m;
      const fullUrl = url.startsWith("//") ? "https:" + url : url;
      return `fetch("/proxy?url=${encodeURIComponent(fullUrl)}`;
    });
}

app.get("/proxy", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send("URL required");

  try {
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0",
        "Referer": targetUrl,
        "Origin": targetUrl,
      },
    });

    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("text/html")) {
      let body = await response.text();
      body = rewriteHtml(body, targetUrl);
      res.send(body);
    } else {
      response.body.pipe(res);
    }
  } catch (err) {
    res.status(500).send("Fetch error: " + err.message);
  }
});

app.get("/", (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Yubikiri Browser</title>
        <style>
          body { font-family: sans-serif; margin: 50px; }
          input { width: 300px; padding: 5px; }
          button { padding: 5px 10px; }
        </style>
      </head>
      <body>
        <h1>Yubikiri Browser</h1>
        <form id="proxyForm">
          <input type="text" id="urlInput" placeholder="Enter URL" />
          <button type="submit">GO</button>
        </form>
        <script>
          const form = document.getElementById("proxyForm");
          form.addEventListener("submit", e => {
            e.preventDefault();
            const url = document.getElementById("urlInput").value;
            window.location.href = '/proxy?url=' + encodeURIComponent(url);
          });
          document.getElementById("urlInput").addEventListener("keydown", e => {
            if(e.key === "Enter") form.dispatchEvent(new Event("submit", {cancelable: true}));
          });
        </script>
      </body>
    </html>
  `);
});

app.listen(10000, () => {
  console.log("Yubikiri Browser running on port 10000");
});
