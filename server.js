import express from "express";
import * as cheerio from "cheerio";
import http from "http";
import https from "https";
import { URL } from "url";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "index.html"));
});

// 簡易 HTTP/HTTPS リクエスト関数
function fetchWithNode(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === "https:";
    const lib = isHttps ? https : http;

    const requestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || "GET",
      headers: options.headers || {},
      timeout: options.timeout || 15000
    };

    // 外部プロキシ指定（オプション）
    if (options.proxy) {
      const proxyUrl = new URL(options.proxy);
      requestOptions.hostname = proxyUrl.hostname;
      requestOptions.port = proxyUrl.port;
      requestOptions.path = url;
      requestOptions.headers.Host = parsedUrl.hostname;
    }

    const req = lib.request(requestOptions, (res) => {
      let chunks = [];
      res.on("data", chunk => chunks.push(chunk));
      res.on("end", () => {
        const buffer = Buffer.concat(chunks);
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: buffer
        });
      });
    });

    req.on("error", (err) => reject(err));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });

    if (options.body) req.write(options.body);
    req.end();
  });
}

// プロキシルート
app.get("/proxy", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send("Missing url parameter");

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7",
    "Referer": targetUrl,
    "Connection": "keep-alive"
  };

  const MAX_RETRIES = 3;
  let attempt = 0;
  let response;

  while (attempt < MAX_RETRIES) {
    try {
      response = await fetchWithNode(targetUrl, { headers, timeout: 15000 });
      if (response.status >= 400) throw new Error("HTTP " + response.status);
      break;
    } catch (err) {
      attempt++;
      if (attempt >= MAX_RETRIES) return res.status(500).send("Proxy error: " + err.message);
    }
  }

  const contentType = response.headers["content-type"] || "";

  try {
    if (contentType.includes("text/html")) {
      const html = response.body.toString("utf-8");
      const $ = cheerio.load(html);

      // HTML 内リンク書き換え
      const rewriteAttr = (selector, attr) => {
        $(selector).each((_, el) => {
          const val = $(el).attr(attr);
          if (!val) return;
          if (!val.startsWith("http") && !val.startsWith("data:")) {
            try {
              const absUrl = new URL(val, targetUrl).href;
              $(el).attr(attr, `/proxy?url=${encodeURIComponent(absUrl)}`);
            } catch {}
          } else if (val.startsWith("http")) {
            $(el).attr(attr, `/proxy?url=${encodeURIComponent(val)}`);
          }
        });
      };

      rewriteAttr("a", "href");
      rewriteAttr("link", "href");
      rewriteAttr("script", "src");
      rewriteAttr("img", "src");
      rewriteAttr("form", "action");

      res.setHeader("Content-Type", "text/html");
      res.send($.html());
    } 
    else if (contentType.includes("text/css")) {
      let css = response.body.toString("utf-8");
      css = css.replace(/url\((.*?)\)/g, (match, p1) => {
        let url = p1.replace(/['"]/g, "");
        if (!url.startsWith("http") && !url.startsWith("data:")) {
          url = new URL(url, targetUrl).href;
        }
        return `url(/proxy?url=${encodeURIComponent(url)})`;
      });
      res.setHeader("Content-Type", "text/css");
      res.send(css);
    } 
    else {
      res.setHeader("Content-Type", contentType);
      res.send(response.body);
    }
  } catch (err) {
    res.status(500).send("Proxy processing error: " + err.message);
  }
});

app.listen(PORT, () => console.log(`yubikiri-proxy running at http://localhost:${PORT}`));
