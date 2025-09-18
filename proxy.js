// proxy.js
import express from "express";

const router = express.Router();

router.get("/", async (req, res) => {
  const targetUrl = req.query.url;

  if (!targetUrl) {
    return res.status(400).send("Missing url parameter");
  }

  try {
    // Node.js 22 なら fetch はグローバルに使える
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      },
    });

    res.set("Content-Type", response.headers.get("content-type"));
    const body = await response.text();

    // 制限回避: すべての URL を自分の proxy 経由に書き換え
    const proxied = body.replace(
      /(https?:\/\/[^\s"'<>]+)/g,
      (match) => `/proxy?url=${encodeURIComponent(match)}`
    );

    res.send(proxied);
  } catch (err) {
    console.error("Proxy error:", err);
    res.status(500).send("Proxy fetch failed: " + err.message);
  }
});

export default router;
