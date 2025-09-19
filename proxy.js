const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const router = express.Router();
const urlModule = require("url");

// URLをプロキシ経由に変換する関数
function toProxyUrl(src, base) {
  try {
    const absoluteUrl = new URL(src, base).toString();
    return `/proxy?url=${encodeURIComponent(absoluteUrl)}`;
  } catch (err) {
    return src; // URL解析できなければそのまま
  }
}

router.get("/", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send("Missing url parameter");

  try {
    const response = await axios.get(targetUrl, {
      responseType: "arraybuffer",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    const contentType = response.headers["content-type"] || "";

    if (contentType.includes("text/html")) {
      const html = response.data.toString("utf-8");
      const $ = cheerio.load(html);

      // img, link, scriptタグ
      $("img").each((_, el) => {
        const src = $(el).attr("src");
        if (src && !src.startsWith("data:")) {
          $(el).attr("src", toProxyUrl(src, targetUrl));
        }
      });

      $("link").each((_, el) => {
        const href = $(el).attr("href");
        if (href) $(el).attr("href", toProxyUrl(href, targetUrl));
      });

      $("script").each((_, el) => {
        const src = $(el).attr("src");
        if (src) $(el).attr("src", toProxyUrl(src, targetUrl));
      });

      // styleタグ内のurl(...)も書き換え
      $("style").each((_, el) => {
        const css = $(el).html();
        if (css) {
          const newCss = css.replace(/url\(([^)]+)\)/g, (match, urlStr) => {
            const cleaned = urlStr.replace(/['"]/g, "").trim();
            return `url(${toProxyUrl(cleaned, targetUrl)})`;
          });
          $(el).html(newCss);
        }
      });

      // inline style属性も書き換え
      $("[style]").each((_, el) => {
        const style = $(el).attr("style");
        if (style) {
          const newStyle = style.replace(/url\(([^)]+)\)/g, (match, urlStr) => {
            const cleaned = urlStr.replace(/['"]/g, "").trim();
            return `url(${toProxyUrl(cleaned, targetUrl)})`;
          });
          $(el).attr("style", newStyle);
        }
      });

      res.set("Content-Type", "text/html");
      res.send($.html());
    } else {
      res.set("Content-Type", contentType);
      res.send(response.data);
    }
  } catch (err) {
    console.error("Proxy error:", err.message);
    res.status(500).send("Proxy error: " + err.message);
  }
});

module.exports = router;
const input = document.querySelector("#top-large input");
const button = document.querySelector("#top-large button");

button.addEventListener("click", () => {
  let value = input.value.trim();
  let url;

  try {
    // URL としてパースできるか確認
    url = new URL(value);
  } catch {
    // URL でない場合は Google 検索に変換
    const query = encodeURIComponent(value);
    url = new URL(`https://www.google.com/search?q=${query}`);
  }

  // proxy 経由で開く
  window.location.href = `/proxy?url=${encodeURIComponent(url)}`;
});
