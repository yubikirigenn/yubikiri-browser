const fetch = require("node-fetch"); // v2でCommonJS対応
const { URL } = require("url");

module.exports = function (app) {
  // メインプロキシ
  app.get("/proxy", async (req, res) => {
    try {
      const targetUrl = req.query.url;
      if (!targetUrl) {
        return res.status(400).send("Missing url parameter");
      }

      const response = await fetch(targetUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        },
      });

      const contentType = response.headers.get("content-type") || "";
      res.setHeader("content-type", contentType);

      // HTML の場合 → 相対リンクをプロキシ経由に書き換え
      if (contentType.includes("text/html")) {
        let text = await response.text();
        text = text.replace(
          /((href|src)=["'])(?!http)([^"']+)/g,
          (_, prefix, _attr, link) => {
            const abs = new URL(link, targetUrl).toString();
            return `${prefix}/r?url=${encodeURIComponent(abs)}`;
          }
        );
        return res.send(text);
      }

      // その他（CSS, JS, 画像など）
      const buffer = await response.buffer();
      return res.send(buffer);
    } catch (err) {
      console.error("Proxy error:", err);
      res.status(500).send("Proxy error: " + err.message);
    }
  });

  // リソース用
  app.get("/r", async (req, res) => {
    try {
      const targetUrl = req.query.url;
      if (!targetUrl) {
        return res.status(400).send("Missing url parameter");
      }

      const response = await fetch(targetUrl);
      const contentType = response.headers.get("content-type") || "";
      res.setHeader("content-type", contentType);

      const buffer = await response.buffer();
      return res.send(buffer);
    } catch (err) {
      console.error("Resource proxy error:", err);
      res.status(500).send("Resource proxy error: " + err.message);
    }
  });
};
