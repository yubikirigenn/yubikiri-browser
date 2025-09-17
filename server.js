import express from "express";
import axios from "axios";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 10000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "index.html"));
});

// サーバーサイドでページを取得
app.post("/go", async (req, res) => {
  const url = req.body.url;
  if (!url) return res.send("Not found: url parameter is missing");

  try {
    const response = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0" // 基本ブラウザっぽく
      },
      timeout: 10000
    });
    res.send(response.data);
  } catch (err) {
    res.send("Error fetching page: " + err.message);
  }
});

app.listen(PORT, () => {
  console.log(`Yubikiri Browser running on port ${PORT}`);
});
