import express from "express";
import https from "https";
import http from "http";

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("public"));

// URLを受け取り、サーバー経由で取得して返す
app.get("/fetch", (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send("Not found: url parameter is missing");

  const target = url.startsWith("https") ? https : http;

  target.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (resp) => {
    let data = "";
    resp.on("data", chunk => data += chunk);
    resp.on("end", () => res.send(data));
  }).on("error", () => {
    res.status(500).send("Failed to fetch the URL");
  });
});

app.listen(PORT, () => console.log(`Hello Browser running on port ${PORT}`));
