import express from "express";
import fetch from "node-fetch";
import * as cheerio from "cheerio";
import compression from "compression";

const app = express();
app.use(compression());

// === ホーム画面 ===
app.get("/", (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Yubikiri Browser</title>
        <style>
          body { font-family: sans-serif; text-align: center; margin-top: 100px; }
          input { width: 400px; padding: 10px; font-size: 16px; }
          button { padding: 10px 20px; font-size: 16px; margin-left: 5px; }
        </style>
      </head>
      <body>
        <h1>🌐 Yubikiri Browser</h1>
        <form action="/proxy" method="get">
          <input type="text" name="url" placeholder="https://example.com" required>
          <button type="submit">Go</button>
        </form>
        <script>
          document.querySelector("input").addEventListener("keydown", e => {
            if (e.key === "Enter") e.target.form.submit();
          });
        </script>
      </body>
    </html>
  `);
});

// === プロキシ ===
app.get("/proxy", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.send("No URL provided");

  try {
    const response = await fetch(targetUrl, {
      headers: { "User-Agent": "Mozilla/5.0 YubikiriBrowser" }
    });

    let body = await response.text();
    const contentType = response.headers.get("content-type") || "";

    res.set("Content-Type", contentType);

    // HTML のときだけリンクを書き換え
    if (contentType.includes("text/html")) {
      const $ = cheerio.load(body);

      const rewrite = (el, attr) => {
        let val = $(el).attr(attr);
        if (val) {
          try {
            let abs = new URL(val, targetUrl).href;
            $(el).attr(attr, "/proxy?url=" + encodeURIComponent(abs));
          } catch {}
        }
      };

      $("a").each((_, el) => rewrite(el, "href"));
      $("img").each((_, el) => rewrite(el, "src"));
      $("script").each((_, el) => rewrite(el, "src"));
      $("link").each((_, el) => rewrite(el, "href"));
      $("iframe").each((_, el) => rewrite(el, "src"));
      $("form").each((_, el) => rewrite(el, "action"));

      // セキュリティ系ヘッダーを無効化
      res.removeHeader("Content-Security-Policy");
      res.removeHeader("X-Frame-Options");

      body = $.html();
    }

    res.send(body);
  } catch (err) {
    res.status(500).send("Error: " + err.message);
  }
});

// === 起動 ===
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("🚀 Yubikiri Browser running on port " + PORT));
