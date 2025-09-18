import express from "express";
import fetch from "node-fetch";
import cheerio from "cheerio";
import path from "path";
import { fileURLToPath } from "url";
import { URL } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// 静的ファイル
app.use(express.static(path.join(__dirname, "public")));

// index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "index.html"));
});

// プロキシ (HTML 書き換え付き)
app.get("/proxy", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).send("Missing url parameter");
  }

  try {
    const response = await fetch(targetUrl);
    const contentType = response.headers.get("content-type") || "";

    // HTML の場合だけ書き換え
    if (contentType.includes("text/html")) {
      const html = await response.text();
      const $ = cheerio.load(html);

      // 相対リンクを書き換える
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
    // CSS の場合 url(...) を書き換え
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
    // 画像・JS などはそのまま転送
    else {
      const buffer = Buffer.from(await response.arrayBuffer());
      res.setHeader("Content-Type", contentType);
      res.send(buffer);
    }
  } catch (err) {
    res.status(500).send("Proxy error: " + err.message);
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
