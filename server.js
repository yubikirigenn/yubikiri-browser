import express from "express";
import cloudscraper from "cloudscraper";

const app = express();
const PORT = process.env.PORT || 3000;

// 静的ファイル提供
app.use(express.static("public"));

// ホームページ
app.get("/", (req, res) => {
  res.sendFile("index.html", { root: "views" });
});

// サーバーサイドプロキシ
app.get("/proxy", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.send("<h2>URLを指定してください</h2>");
  }

  try {
    const html = await cloudscraper.get(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
        Accept: "*/*",
        "Accept-Language": "ja,en;q=0.9",
      },
      followAllRedirects: true,
      jar: true,
      // proxy: "http://user:pass@ip:port" // 必要なら設定
    });

    res.setHeader("X-Frame-Options", "ALLOWALL");
    res.setHeader("Content-Security-Policy", "frame-ancestors *");
    res.send(html);
  } catch (err) {
    console.error(err);
    res.send(`<h2>コンテンツ取得エラー</h2><p>${err.message}</p>`);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
