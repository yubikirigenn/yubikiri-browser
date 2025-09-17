import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import cheerio from "cheerio";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/proxy", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send("URLが指定されていません");

  try {
    const r = await fetch(targetUrl, {
      headers: { "user-agent": req.headers["user-agent"] || "Mozilla/5.0" }
    });

    let contentType = r.headers.get("content-type") || "";
    res.set("content-type", contentType);

    // セキュリティヘッダーを除去してiframe許可
    res.removeHeader("content-security-policy");
    res.removeHeader("x-frame-options");

    if (contentType.includes("text/html")) {
      let html = await r.text();
      const $ = cheerio.load(html);

      // リンク類をプロキシ化
      $("a, link, script, img, iframe, source, video").each((_, el) => {
        const attr = el.name === "a" || el.name === "link" ? "href" : "src";
        const val = $(el).attr(attr);
        if (val && !/^https?:\/\//.test(val)) {
          const absUrl = new URL(val, targetUrl).href;
          $(el).attr(attr, `/proxy?url=${encodeURIComponent(absUrl)}`);
        } else if (val && /^https?:\/\//.test(val)) {
          $(el).attr(attr, `/proxy?url=${encodeURIComponent(val)}`);
        }
      });

      res.send($.html());
    } else {
      // 画像や動画などバイナリはそのまま返す
      r.body.pipe(res);
    }
  } catch (err) {
    res.status(500).send("取得エラー: " + err.message);
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () =>
  console.log(`✅ yubikiri-browser (CSP回避版) running at http://localhost:${PORT}`)
);
