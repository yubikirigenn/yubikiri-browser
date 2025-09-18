const express = require("express");
const path = require("path");
const proxy = require("./proxy");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.static(path.join(__dirname, "public")));
app.set("views", path.join(__dirname, "views"));

// ルート
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "views/index.html"));
});

// プロキシ本体
proxy(app);

app.listen(PORT, () => {
  console.log(`✅ Proxy running at http://localhost:${PORT}`);
});
