import express from "express";
import fetch from "node-fetch";
import cookieParser from "cookie-parser";
import compression from "compression";
import * as cheerio from "cheerio";

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(compression());
app.use(express.static("public")); // /public 配下の静的ファイルを提供

// ルートページ
app.get("/", (req, res) => {
  res.sendFile(new URL("./views/index.html", import.meta.url));
});

// プロキシ処理
app.post("/proxy", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).send("URL required");

  try {
    // 制限回避用にヘッダを偽装
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": url,
      },
      redirect: "follow",
    });

    let text = await response.text();

    // cheerioでHTML操作（リンクの書き換えなど）
    const $ = cheerio.load(text);
    $("a").each((i, el) => {
      const href = $(el).attr("href");
      if (href && !href.startsWith("http")) {
        $(el).attr("href", url + href); // 相対リンクを絶対リンクに変換
      }
    });
    text = $.html();

    res.send(text);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching URL");
  }
});

app.listen(PORT, () => {
  console.log(`yubikiri-browser running on port ${PORT}`);
});
