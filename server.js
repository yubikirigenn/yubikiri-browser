import express from "express";
import fetch from "node-fetch";
import cookieParser from "cookie-parser";
import compression from "compression";
import cheerio from "cheerio";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cookieParser());
app.use(compression());
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 10000;

// フロントページ
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "index.html"));
});

// プロキシ
app.get("/proxy", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send("URL is required");

  try {
    const response = await fetch(targetUrl, { redirect: "follow" });
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("text/html")) {
      let html = await response.text();
      const $ = cheerio.load(html);

      // ページ内リンク書き換え
      $("a,link,script,iframe,img").each((_, el) => {
        const attribs = ["href", "src"];
        attribs.forEach((attr) => {
          if ($(el).attr(attr)) {
            const val = $(el).attr(attr);
            if (val.startsWith("http")) {
              $(el).attr(attr, `/proxy?url=${encodeURIComponent(val)}`);
            }
          }
        });
      });

      res.send($.html());
    } else {
      // HTML以外はバイナリ転送
      const buffer = await response.arrayBuffer();
      res.set("Content-Type", contentType);
      res.send(Buffer.from(buffer));
    }
  } catch (err) {
    res.status(500).send("Error fetching URL: " + err.message);
  }
});

app.listen(PORT, () => {
  console.log(`Yubikiri Browser running on port ${PORT}`);
});
