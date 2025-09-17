import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import * as cheerio from "cheerio"; // ← 修正版インポート

const app = express();
const PORT = process.env.PORT || 3000;

// 現在のファイルパスを取得
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ミドルウェア
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// ホーム画面
app.get("/", (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Yubikiri Browser</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 20px;
            background: #f4f4f4;
          }
          h1 {
            color: #333;
          }
          form {
            margin-top: 20px;
          }
          input[type="text"] {
            width: 80%;
            padding: 10px;
            border-radius: 6px;
            border: 1px solid #ccc;
          }
          button {
            padding: 10px 20px;
            background: #007bff;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
          }
          button:hover {
            background: #0056b3;
          }
        </style>
      </head>
      <body>
        <h1>Yubikiri Browser</h1>
        <form action="/proxy" method="get">
          <input type="text" name="url" id="urlInput" placeholder="Enter URL (https://...)" required>
          <button type="submit">Go</button>
        </form>
        <script>
          document.getElementById("urlInput").addEventListener("keypress", function(e) {
            if (e.key === "Enter") {
              e.preventDefault();
              this.form.submit();
            }
          });
        </script>
      </body>
    </html>
  `);
});

// プロキシ処理
app.get("/proxy", async (req, res) => {
  let targetUrl = req.query.url;

  if (!targetUrl) {
    return res.send("URL is required!");
  }

  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = "http://" + targetUrl;
  }

  try {
    const response = await fetch(targetUrl);
    let body = await response.text();
    const contentType = response.headers.get("content-type");

    if (contentType && contentType.includes("text/html")) {
      const $ = cheerio.load(body);

      // 相対リンクを絶対リンクに変換
      $("a").each((_, el) => {
        let href = $(el).attr("href");
        if (href && !href.startsWith("http")) {
          $(el).attr("href", new URL(href, targetUrl).href);
        }
      });

      $("img").each((_, el) => {
        let src = $(el).attr("src");
        if (src && !src.startsWith("http")) {
          $(el).attr("src", new URL(src, targetUrl).href);
        }
      });

      body = $.html();
    }

    res.send(body);
  } catch (err) {
    res.status(500).send("Error: " + err.message);
  }
});

// サーバー起動
app.listen(PORT, () => {
  console.log(`Yubikiri Browser running on port ${PORT}`);
});
