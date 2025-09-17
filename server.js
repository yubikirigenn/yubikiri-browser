import http from "http";
import https from "https";
import url from "url";
import fs from "fs";
import path from "path";

const PORT = process.env.PORT || 10000;

// index.html 読み込み
const indexHtml = fs.readFileSync(path.join("views", "index.html"), "utf8");

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const query = parsedUrl.query;

  // ルートアクセスはindex.html
  if (parsedUrl.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(indexHtml);
    return;
  }

  // /proxy?url= で1ページだけ取得
  if (parsedUrl.pathname === "/proxy") {
    const targetUrl = query.url;
    if (!targetUrl) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Not found: url parameter is missing");
      return;
    }

    const client = targetUrl.startsWith("https") ? https : http;

    const options = {
      headers: {
        // ここでブラウザっぽく見せる
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    };

    client
      .get(targetUrl, options, (resp) => {
        let data = "";
        resp.on("data", (chunk) => (data += chunk));
        resp.on("end", () => {
          // HTMLそのまま返す（iframeで表示）
          res.writeHead(resp.statusCode, { "Content-Type": "text/html" });
          res.end(data);
        });
      })
      .on("error", (err) => {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Error fetching URL: " + err.message);
      });

    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`Yubikiri Browser running on port ${PORT}`);
});
