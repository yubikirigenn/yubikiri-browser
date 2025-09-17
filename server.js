import express from "express";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import { URL } from "url";

const app = express();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "index.html"));
});

// 規制回避＆プロキシ
app.get("/proxy", async (req, res) => {
  let target = req.query.url;
  if (!target) return res.send("URLまたは検索語句を入力してください。");

  // URLでない場合はDuckDuckGo検索
  if (!/^https?:\/\//i.test(target)) {
    target = `https://duckduckgo.com/html/?q=${encodeURIComponent(target)}`;
  }

  try {
    const response = await fetch(target, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
                      "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
      }
    });
    let body = await response.text();

    // 相対リンク・画像・CSS・JSもプロキシ経由
    const baseUrl = new URL(target);
    body = body.replace(/(href|src|action)=["']([^"']+)["']/gi, (match, attr, value) => {
      try {
        const absoluteUrl = new URL(value, baseUrl).href;
        return `${attr}="/proxy?url=${encodeURIComponent(absoluteUrl)}"`;
      } catch {
        return match;
      }
    });

    // Note等で CSP/TrustedScript エラーが出る場合、scriptタグ削除 or 書き換え
    body = body.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");

    res.send(body);
  } catch (err) {
    res.status(500).send("エラー: " + err.message);
  }
});

app.listen(PORT, () => {
  console.log(`Yubikiri Browser running on http://localhost:${PORT}`);
});
