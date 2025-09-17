import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const port = 10000;

// 規制回避用の簡易プロキシ
const PROXY_BASE = "https://corsproxy.io/?";

// Node.js ESM用のパス解決
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));

// ホーム
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "views/index.html"));
});

// プロキシ処理
app.post("/proxy", async (req, res) => {
  let { url } = req.body;

  // URLでなければDuckDuckGo検索
  if (!/^https?:\/\//i.test(url)) {
    const query = encodeURIComponent(url);
    url = `https://duckduckgo.com/html/?q=${query}`;
  }

  try {
    // プロキシ経由で取得
    const response = await fetch(PROXY_BASE + encodeURIComponent(url));
    const text = await response.text();
    res.send(text);
  } catch (err) {
    res.status(500).send("Error: " + err.message);
  }
});

app.listen(port, () => {
  console.log(`Yubikiri Browser running on port ${port}`);
});
