const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

// 静的ファイル
app.use(express.static(path.join(__dirname, "public")));

// ビュー
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "index.html"));
});

// プロキシルート
app.use("/proxy", require("./proxy"));

app.listen(PORT, () => {
  console.log(`✅ yubikiri-proxy running at http://localhost:${PORT}`);
});
