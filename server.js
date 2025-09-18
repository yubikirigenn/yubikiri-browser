import express from "express";
import fetch from "node-fetch";
import * as cheerio from "cheerio";
import path from "path";
import { fileURLToPath } from "url";
import { URL } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

// トップページ
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "index.html"));
});

// サーバーサイドプロキシ
app.get("/proxy", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send("Missing url parameter");

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7",
    "Referer": targetUrl
  };

  const MAX_RETRIES = 3;
  let attempt = 0;
  let response;

  while (attempt < MAX_RETRIES) {
    try {
      response = await fetch(targetUrl, { headers, redirect: "follow", timeout: 15000 });
      if (!response.ok) throw new Error("HTTP " + response.status);
      break;
    } catch (err) {
      attempt++;
      if (attempt >= MAX_RETRIES) return res.status(500).send("Proxy error: " + err.message);
    }
  }

  const contentType = response.headers.get("content-type") || "";

  try {
    if (contentType.includes("text/html")) {
      const html = await response.text();
      const $ = cheerio.load(html);

      // HTML 内リンク書き換え
      const rewriteAttr = (selector, attr) => {
        $(selector).each((_, el) => {
          const val = $(el).attr(attr);
          if (val && !val.startsWith("http") && !val.startsWith("data:")) {
            try {
              const absUrl = new URL(val, targetUrl).href;
              $(el).attr(attr, `/proxy?url=${encodeURIComponent(absUrl)}`);
            } catch {}
          } else if (val && val.startsWith("http")) {
            $(el).attr(attr, `/proxy?url=${encodeURIComponent(val)}`);
          }
        });
      };

      rewriteAttr("a", "href");
      rewriteAttr("link", "href");
      rewriteAttr("script", "src");
      rewriteAttr("img", "src");

      res.setHeader("Content-Type", "text/html");
      res.send($.html());
    } 
    else if (contentType.includes("text/css")) {
      let css = await response.text();
      css = css.replace(/url\((.*?)\)/g, (match, p1) => {
        let url = p1.replace(/['"]/g, "");
        if (!url.startsWith("http") && !url.startsWith("data:")) {
          url = new URL(url, targetUrl).href;
        }
        return `url(/proxy?url=${encodeURIComponent(url)})`;
      });
      res.setHeader("Content-Type", "text/css");
      res.send(css);
    } 
    else {
      const buffer = Buffer.from(await response.arrayBuffer());
      res.setHeader("Content-Type", contentType);
      res.send(buffer);
    }
  } catch (err) {
    res.status(500).send("Proxy processing error: " + err.message);
  }
});

app.listen(PORT, () => console.log(`yubikiri-proxy running at http://localhost:${PORT}`));
