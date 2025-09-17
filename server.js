// server.js
import express from "express";
import fetch from "node-fetch";
import cookieParser from "cookie-parser";
import compression from "compression";
import cheerio from "cheerio";
import { URL } from "url";

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(compression());
app.use(express.static("public"));

// ユーザーが入力するトップページ
app.get("/", (req, res) => {
  res.send(`
    <html>
      <head>
        <meta charset="UTF-8">
        <title>yubikiri-browser</title>
        <style>
          body { font-family: sans-serif; margin: 2em; }
          input[type="text"] { width: 60%; padding: 0.5em; }
          input[type="submit"] { padding: 0.5em 1em; }
        </style>
      </head>
      <body>
        <h1>yubikiri-browser</h1>
        <form action="/proxy" method="get">
          <input type="text" name="url" placeholder="https://example.com" />
          <input type="submit" value="GO" />
        </form>
        <p>Enter でも GO できます。</p>
      </body>
    </html>
  `);
});

// プロキシ処理
app.get("/proxy", async (req, res) => {
  let targetUrl = req.query.url;
  if (!targetUrl) return res.redirect("/");

  // URLを正規化
  if (!/^https?:\/\//i.test(targetUrl)) targetUrl = "https://" + targetUrl;

  try {
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36",
        Referer: targetUrl,
        Origin: targetUrl,
      },
      redirect: "follow",
    });

    let contentType = response.headers.get("content-type");
    let body = await response.text();

    // HTMLならリンク書き換え
    if (contentType && contentType.includes("text/html")) {
      const $ = cheerio.load(body);

      $("a, link, script, img, form").each((i, el) => {
        let attr = $(el).attr("href") ? "href" : $(el).attr("src") ? "src" : $(el).attr("action") ? "action" : null;
        if (attr) {
          let original = $(el).attr(attr);
          if (original && !original.startsWith("data:") && !original.startsWith("#")) {
            try {
              const newUrl = new URL(original, targetUrl).href;
              if (attr === "action") $(el).attr(attr, "/proxy?url=" + encodeURIComponent(newUrl));
              else $(el).attr(attr, "/proxy?url=" + encodeURIComponent(newUrl));
            } catch {}
          }
        }
      });

      body = $.html();
    }

    res.set("Content-Type", contentType);
    res.set("Access-Control-Allow-Origin", "*");
    res.send(body);
  } catch (err) {
    res.status(500).send("Error fetching: " + err.message);
  }
});

app.listen(PORT, () => console.log(`yubikiri-browser running on port ${PORT}`));
