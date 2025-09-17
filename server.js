import express from 'express';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import puppeteer from 'puppeteer';

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cookieParser());
app.use(compression());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

// トップページ
app.get('/', (req, res) => {
  res.sendFile(`${process.cwd()}/views/index.html`);
});

// Proxy
app.post('/proxy', async (req, res) => {
  const targetUrl = req.body.url;
  if (!targetUrl) return res.status(400).send('URL is required');

  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    // Cookie保持
    const cookies = req.cookies.pbc || [];
    if (cookies.length) await page.setCookie(...cookies);

    // JS-heavyサイト対応
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    // ページ内の動的要素や制限回避
    await page.addScriptTag({ content: `
      // 必要に応じて CSP・広告ブロック回避などの処理
      console.log('Yubikiri Browser active');
    `});

    // Cookie更新
    const newCookies = await page.cookies();
    res.cookie('pbc', newCookies, { httpOnly: true });

    // HTML取得
    const content = await page.content();
    await browser.close();
    res.send(content);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading page');
  }
});

app.listen(PORT, () => {
  console.log(`Yubikiri Browser running on port ${PORT}`);
});
