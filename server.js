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

// -------------------
// 外部プロキシ設定
const proxies = [
  null,
  // "http://proxy1.example.com:8080",
  // "http://proxy2.example.com:8080"
];

// Cookie 管理
const cookieJar = {};

// HTTP/HTTPS リクエスト
function fetchWithNode(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname;
    const isHttps = parsedUrl.protocol === "https:";
    const lib = isHttps ? https : http;

    const headers = options.headers || {};
    if (cookieJar[hostname]) headers["Cookie"] = cookieJar[hostname];

    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || "GET",
      headers,
      timeout: options.timeout || 15000,
    };

    if (options.proxy) {
      const proxyUrl = new URL(options.proxy);
      reqOptions.hostname = proxyUrl.hostname;
      reqOptions.port = proxyUrl.port;
      reqOptions.path = url;
      reqOptions.headers.Host = parsedUrl.hostname;
    }

    const req = lib.request(reqOptions, (res) => {
      let chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const buffer = Buffer.concat(chunks);
        if (res.headers["set-cookie"])
          cookieJar[hostname] = res.headers["set-cookie"].join("; ");
        resolve({ status: res.statusCode, headers: res.headers, body: buffer });
      });
    });

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });

    if (options.body) req.write(options.body);
    req.end();
  });
}

// 複数プロキシ自動切替
async function fetchWithProxy(url, options = {}) {
  for (let proxy of proxies) {
    try {
      const res = await fetchWithNode(url, { ...options, proxy });
      if (res.status < 400) return res;
    } catch (err) {
      console.log(`Proxy ${proxy || "direct"} failed: ${err.message}`);
    }
  }
  throw new Error("全てのプロキシで取得失敗");
}

// -------------------
// フルサーバーサイドプロキシ
app.get("/proxy", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl)
    return res
      .status(400)
      .json({ success: false, message: "Missing url parameter" });

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    Accept: "*/*",
    "Accept-Language": "ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7",
    Referer: targetUrl,
    Connection: "keep-alive",
  };

  try {
    const response = await fetchWithProxy(targetUrl, { headers, timeout: 15000 });
    const contentType = response.headers["content-type"] || "";

    if (contentType.includes("text/html")) {
      const html = response.body.toString("utf-8");
      const $ = cheerio.load(html);

      const rewriteAttr = (selector, attr) => {
        $(selector).each((_, el) => {
          const val = $(el).attr(attr);
          if (!val) return;
          try {
            const absUrl = new URL(val, targetUrl).href;
            $(el).attr(attr, `/proxy?url=${encodeURIComponent(absUrl)}`);
          } catch {}
        });
      };

      rewriteAttr("a", "href");
      rewriteAttr("link", "href");
      rewriteAttr("script", "src");
      rewriteAttr("img", "src");
      rewriteAttr("form", "action");

      $("script").each((_, el) => {
        if ($(el).attr("src")) return;
        const jsContent = $(el).html();
        if (!jsContent) return;
        const rewritten = jsContent.replace(
          /(fetch|XMLHttpRequest)\((['"`]?)(.*?)\2/g,
          (m, p1, q, p3) => {
            try {
              const absUrl = new URL(p3, targetUrl).href;
              return `${p1}("/proxy?url=${encodeURIComponent(absUrl)}"`;
            } catch {
              return m;
            }
          }
        );
        $(el).html(rewritten);
      });

      res.setHeader("Content-Type", "text/html");
      res.send($.html());
    } else if (contentType.includes("text/css")) {
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
    } else {
      res.setHeader("Content-Type", contentType);
      res.send(response.body);
    }
  } catch (err) {
    res
      .status(500)
      .json({
        success: false,
        message: "コンテンツ取得エラー: " + err.message,
      });
  }
});

// -------------------
app.listen(PORT, () =>
  console.log(`yubikiri-proxy running at http://localhost:${PORT}`)
);
