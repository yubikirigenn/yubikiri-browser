import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import proxyRouter from "./proxy.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// 静的ファイル (public フォルダ)
app.use(express.static(path.join(__dirname, "public")));

// プロキシ API
app.use("/proxy", proxyRouter);

// index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
