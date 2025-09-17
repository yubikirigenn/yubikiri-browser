import express from "express";
import fetch from "node-fetch";
import cookieParser from "cookie-parser";
import compression from "compression";
import * as cheerio from "cheerio"; // ←ここを修正

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cookieParser());
app.use(compression());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("public"));

// フォーム
app.get("/", (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Yubikiri Browser</title>
      </head>
      <body>
        <h1>Yubikiri Browser</h1>
        <form id="proxyForm">
          <input type="text" id="urlInput" placeholder="Enter URL" />
          <button type="submit">GO</button>
        </form>
        <script>
          const form = document.getElementById("proxyForm");
          form.addEventListener("submit", e => {
            e.preventDefault();
            const url = document.getElementById("urlInput").value;
            window.location.href = '/fetch?url=' + encodeURIComponent(url);
          });
          document.getElementById("urlInput").addEventListener("keydown", e => {
            if(e.key === "Enter") form.dispatchEvent(new Event("submit", {cancelable: true}));
          });
        </script>
      </body>
    </html>
  `);
});

// プロキシ
app.get("/fetch", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send("URL required");

  try {
    const response = await fetch(targetUrl, { redirect: "follow" });
    let body = await response.text();
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("text/html")) {
      const $ = cheerio.load(body);

      $("meta[http-equiv]").each((i, el) => {
        const httpEquiv = $(el).attr("http-equiv")?.toLowerCase();
        if (httpEquiv === "content-security-policy" || httpEquiv === "x-frame-options") {
          $(el).remove();
        }
      });

      $("a, link, script, img, form").each((i, el) => {
        const attr = el.name === "form" ? "action" : el.name === "a" ? "href" : "src";
        const val = $(el).attr(attr);
        if (val && !val.startsWith("http") && !val.startsWith("data:")) {
          const newUrl = new URL(val, targetUrl).toString();
          $(el).attr(attr, `/fetch?url=${encodeURIComponent(newUrl)}`);
        }
      });

      body = $.html();
    }

    res.set("Content-Type", contentType);
    res.send(body);

  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching URL");
  }
});

app.listen(PORT, () => {
  console.log(`Yubikiri Browser running on port ${PORT}`);
});
