import express from "express";
import fetch from "node-fetch";
import { JSDOM } from "jsdom";

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.static("public"));
app.set("views", "./views");
app.set("view engine", "ejs");

// ホームページ
app.get("/", (req, res) => {
  res.render("index");
});

// プロキシ処理
app.get("/proxy", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.send("URLが指定されていません");

  try {
    const response = await fetch(targetUrl);
    let contentType = response.headers.get("content-type");

    if (contentType && contentType.includes("text/html")) {
      let html = await response.text();
      const dom = new JSDOM(html);
      const document = dom.window.document;

      // <a> のリンクを全部 proxy 経由に書き換える
      document.querySelectorAll("a").forEach(a => {
        let href = a.getAttribute("href");
        if (href && !href.startsWith("javascript:") && !href.startsWith("#")) {
          try {
            const absolute = new URL(href, targetUrl).href;
            a.setAttribute("href", `/proxy?url=${encodeURIComponent(absolute)}`);
          } catch {}
        }
      });

      // CSS, JS, 画像など相対パスを絶対URLに修正
      ["link", "script", "img"].forEach(tag => {
        document.querySelectorAll(tag).forEach(el => {
          let attr = tag === "link" ? "href" : "src";
          let val = el.getAttribute(attr);
          if (val) {
            try {
              const absolute = new URL(val, targetUrl).href;
              el.setAttribute(attr, absolute);
            } catch {}
          }
        });
      });

      res.send(dom.serialize());
    } else {
      // HTML以外（画像やCSSなど）はそのまま転送
      res.set("Content-Type", contentType || "application/octet-stream");
      response.body.pipe(res);
    }
  } catch (err) {
    console.error(err);
    res.status(500).send("プロキシエラー");
  }
});

app.listen(PORT, () => {
  console.log(`Yubikiri Browser running on port ${PORT}`);
});
