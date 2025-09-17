import express from "express";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

// 静的ファイル
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));

// プロキシ経由でURL取得
app.get("/proxy", async (req, res) => {
  const target = req.query.url;
  if (!target) return res.status(400).send("URL required");

  try {
    const response = await fetch(target);
    let html = await response.text();

    // 簡易規制回避：全リンクを書き換え（自分のプロキシ経由で開く）
    html = html.replace(/href="(http[s]?:\/\/[^"]+)"/g, (m, url) => {
      return `href="/proxy?url=${encodeURIComponent(url)}"`;
    });

    html = html.replace(/src="(http[s]?:\/\/[^"]+)"/g, (m, url) => {
      return `src="/proxy?url=${encodeURIComponent(url)}"`;
    });

    res.send(html);
  } catch (err) {
    res.status(500).send("Error fetching URL: " + err.message);
  }
});

// 検索語句入力 → DuckDuckGo
app.get("/search", (req, res) => {
  const q = req.query.q;
  if (!q) return res.redirect("/");

  const ddgUrl = "https://duckduckgo.com/?q=" + encodeURIComponent(q);
  res.redirect(`/proxy?url=${encodeURIComponent(ddgUrl)}`);
});

// ルートページ
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "views/index.html"));
});

app.listen(PORT, () => {
  console.log(`Yubikiri Browser running on port ${PORT}`);
});
