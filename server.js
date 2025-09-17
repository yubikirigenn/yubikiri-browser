import express from "express";
import fetch from "node-fetch";
import cookieParser from "cookie-parser";
import compression from "compression";
import path from "path";
import { fileURLToPath } from "url";
import { JSDOM } from "jsdom"; // DOM操作用

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

// ミドルウェア
app.use(compression());
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// トップページ
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "index.html"));
});

// プロキシ処理
app.all("/proxy", async (req, res) => {
  try {
    const targetUrl = req.query.url || req.body.url;
    if (!targetUrl) return res.status(400).send("URLが指定されていません");

    // GET も POST も対応
    const method = req.method;
    const options = {
      method,
      headers: {
        "User-Agent": req.headers["user-agent"] || "",
        "Accept": "*/*",
      },
    };

    if (method === "POST") options.body = JSON.stringify(req.body);

    const response = await fetch(targetUrl, options);

    let contentType = response.headers.get("content-type") || "";

    // HTMLなら簡易置換してリンクを書き換える
    if (contentType.includes("text/html")) {
      let html = await response.text();

      // 制限回避簡易処理：baseタグを修正
      const dom = new JSDOM(html);
      const document = dom.window.document;

      // すべてのリンクを /proxy?url= に書き換え
      document.querySelectorAll("a").forEach(a => {
        const href = a.getAttribute("href");
        if (href && !href.startsWith("#") && !href.startsWith("mailto:")) {
          try {
            const newUrl = new URL(href, targetUrl).href;
            a.setAttribute("href", `/proxy?url=${encodeURIComponent(newUrl)}`);
          } catch(e) {}
        }
      });

      html = dom.serialize();
      res.send(html);
    } else {
      // HTML以外はそのまま返す
      response.body.pipe(res);
    }

  } catch (err) {
    console.error(err);
    res.status(500).send("プロキシ処理中にエラーが発生しました");
  }
});

app.listen(PORT, () => {
  console.log(`yubikiri-browser running on port ${PORT}`);
});
