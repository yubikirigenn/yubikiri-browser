import express from "express";
import puppeteer from "puppeteer";
import cookieParser from "cookie-parser";
import compression from "compression";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cookieParser());
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 10000;

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "index.html"));
});

app.post("/proxy", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).send("URL required");

  let browser;
  try {
    browser = await puppeteer.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      headless: true
    });
    const page = await browser.newPage();

    // 制限回避用: User-Agent と viewport を偽装
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    await page.setViewport({ width: 1920, height: 1080 });

    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
    const content = await page.content();
    res.send(content);
  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to fetch page");
  } finally {
    if (browser) await browser.close();
  }
});

app.listen(PORT, () => {
  console.log(`Yubikiri Browser running on port ${PORT}`);
});
