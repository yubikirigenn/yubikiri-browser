// proxy.js
const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const router = express.Router();

// helper: 絶対URLにして proxy の形にする
function toProxiedUrl(rawUrl, baseUrl) {
  try {
    // 既にプロキシ化されていたらそのまま返す
    if (!rawUrl) return rawUrl;
    if (rawUrl.startsWith("/proxy?url=")) return rawUrl;

    // data:, javascript:, mailto: 等は書き換えない
    const lower = rawUrl.trim().toLowerCase();
    if (lower.startsWith("data:") || lower.startsWith("javascript:") || lower.startsWith("mailto:") || lower.startsWith("#")) {
      return rawUrl;
    }

    // 絶対化（相対パスを baseUrl を基に解決）
    const abs = new URL(rawUrl, baseUrl).toString();
    return "/proxy?url=" + encodeURIComponent(abs);
  } catch (e) {
    // URL 生成に失敗したら元を返す（安全策）
    return rawUrl;
  }
}

// helper: CSS 内の url(...) を書き換える
function rewriteCssUrls(cssText, baseUrl) {
  // url(...) の内部をキャプチャして置換
  return cssText.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (m, quote, u) => {
    const prox = toProxiedUrl(u, baseUrl);
    return `url("${prox}")`;
  });
}

// helper: srcset 書き換え (複数候補をカンマ区切りで持つ)
function rewriteSrcsetRaw(srcsetRaw, baseUrl) {
  if (!srcsetRaw) return srcsetRaw;
  // 各候補は "url [descriptor]" の形式
  return srcsetRaw
    .split(",")
    .map(part => {
      const trimmed = part.trim();
      const spaceIndex = trimmed.search(/\s/);
      if (spaceIndex === -1) {
        // URL のみ
        return toProxiedUrl(trimmed, baseUrl);
      } else {
        const urlPart = trimmed.slice(0, spaceIndex);
        const descriptor = trimmed.slice(spaceIndex).trim();
        return `${toProxiedUrl(urlPart, baseUrl)} ${descriptor}`;
      }
    })
    .join(", ");
}

router.get("/", async (req, res) => {
  const targetUrl = req.query.url;

  if (!targetUrl) {
    return res.status(400).send("Missing url parameter");
  }

  try {
    // axiosで取得（バイナリで受け取る）
    const response = await axios.get(targetUrl, {
      responseType: "arraybuffer",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        // 任意でリファラを付けると動くサイトがある
        Referer: targetUrl
      },
      maxRedirects: 5
    });

    const contentType = (response.headers["content-type"] || "").toLowerCase();

    // --- HTML の場合: cheerio で書き換え ---
    if (contentType.includes("text/html")) {
      const html = response.data.toString("utf-8");
      const $ = cheerio.load(html, { decodeEntities: false });

      // 1) <base> を設定（相対パス解決の助け）
      // ただし既存の base があれば置き換えず、そのままにするのが安全だが
      // 相対パス問題を避けるため、ここでは head の先頭に base を挿入する（上書きは避ける）
      // 新しい base は元のページの URL を指定（相対リンクが targetUrl を基準に解決される）
      if ($("head").length) {
        const currentBase = $("head base[href]").attr("href");
        if (!currentBase) {
          $("head").prepend(`<base href="${targetUrl}">`);
        }
      }

      // 2) 画像系（img, source, picture）
      $("img").each((_, el) => {
        const $el = $(el);
        const src = $el.attr("src");
        if (src && !src.startsWith("data:") && !src.startsWith("/proxy?url=")) {
          $el.attr("src", toProxiedUrl(src, targetUrl));
        }
        // srcset
        const srcset = $el.attr("srcset");
        if (srcset) {
          $el.attr("srcset", rewriteSrcsetRaw(srcset, targetUrl));
        }
        // data-src / data-lazy を書き換えることも多い
        ["data-src", "data-lazy", "data-original", "data-srcset"].forEach(attr => {
          const v = $el.attr(attr);
          if (v) {
            if (attr.toLowerCase().includes("srcset")) {
              $el.attr(attr, rewriteSrcsetRaw(v, targetUrl));
            } else {
              $el.attr(attr, toProxiedUrl(v, targetUrl));
            }
          }
        });
      });

      // <source> inside <picture> or <video>
      $("source").each((_, el) => {
        const $el = $(el);
        const src = $el.attr("src");
        if (src) $el.attr("src", toProxiedUrl(src, targetUrl));
        const srcset = $el.attr("srcset");
        if (srcset) $el.attr("srcset", rewriteSrcsetRaw(srcset, targetUrl));
      });

      // 3) link[href] (css, icons, prefetch etc.)
      $("link").each((_, el) => {
        const $el = $(el);
        const href = $el.attr("href");
        if (!href) return;
        // stylesheet, preload, prefetch, icon など
        const rel = ($el.attr("rel") || "").toLowerCase();
        // css は proxy 経由で取得して、サーバ側で CSS 内の url(...) も書き換えるようにするため
        $el.attr("href", toProxiedUrl(href, targetUrl));
      });

      // 4) script[src]
      $("script").each((_, el) => {
        const $el = $(el);
        const src = $el.attr("src");
        if (src) {
          $el.attr("src", toProxiedUrl(src, targetUrl));
        }
        // inline scripts left unchanged
      });

      // 5) a[href]（ナビゲーションが proxy 経由で動くように）
      $("a").each((_, el) => {
        const $el = $(el);
        const href = $el.attr("href");
        if (!href) return;
        const lower = href.trim().toLowerCase();
        if (lower.startsWith("http://") || lower.startsWith("https://") || href.startsWith("/") || !href.startsWith("mailto:") && !href.startsWith("javascript:") && !href.startsWith("#")) {
          // 相対 or 絶対 の http(s) をプロキシ化
          $el.attr("href", toProxiedUrl(href, targetUrl));
          // リンクをクリックしたときに常にプロキシ経由で開くよう target を外す（任意）
          $el.attr("target", "_self");
        }
      });

      // 6) form[action] を書き換え（フォーム送信も proxy 経由）
      $("form").each((_, el) => {
        const $el = $(el);
        const action = $el.attr("action");
        if (action) {
          $el.attr("action", toProxiedUrl(action, targetUrl));
        }
      });

      // 7) meta refresh を書き換え（自動リダイレクト）
      $("meta[http-equiv='refresh']").each((_, el) => {
        const $el = $(el);
        const content = $el.attr("content"); // e.g. "3; url=/foo"
        if (!content) return;
        const parts = content.split(";");
        if (parts.length > 1) {
          const urlPart = parts.slice(1).join(";").replace(/^\s*url=/i, "").trim();
          if (urlPart) {
            $el.attr("content", parts[0] + "; url=" + toProxiedUrl(urlPart, targetUrl));
          }
        }
      });

      // 8) inline style 属性中の url(...) を書き換え
      $("[style]").each((_, el) => {
        const $el = $(el);
        const style = $el.attr("style");
        if (style && style.includes("url(")) {
          $el.attr("style", rewriteCssUrls(style, targetUrl));
        }
      });

      // 9) <style>...CSS...</style> の中の url(...) も書き換え
      $("style").each((_, el) => {
        const $el = $(el);
        const cssText = $el.html();
        if (cssText && cssText.includes("url(")) {
          $el.html(rewriteCssUrls(cssText, targetUrl));
        }
      });

      // 10) CSP や X-Frame-Options をいじっている meta があると表示に影響する場合がある。
      //     ここでは既存 meta は触らないが、必要なら削除や書き換えも可能。

      res.set("Content-Type", "text/html; charset=utf-8");
      return res.send($.html());
    }

    // --- CSS の場合: CSS 内の url(...) を書き換えて返す ---
    if (contentType.includes("text/css")) {
      const cssText = response.data.toString("utf-8");
      const rewritten = rewriteCssUrls(cssText, targetUrl);
      res.set("Content-Type", response.headers["content-type"] || "text/css");
      return res.send(rewritten);
    }

    // --- それ以外（画像、フォント、JS 等）はバイナリのまま返す ---
    // 重要: ブラウザは Content-Type を見て処理するのでヘッダをそのまま通す
    res.set("Content-Type", response.headers["content-type"] || "application/octet-stream");
    // 可能ならキャッシュヘッダなども伝搬する（省略可）
    if (response.headers["cache-control"]) {
      res.set("Cache-Control", response.headers["cache-control"]);
    }
    return res.send(response.data);
  } catch (err) {
    console.error("Proxy error:", err && err.stack ? err.stack : err);
    // より詳しいエラー情報も返す（開発中のみ）
    res.status(500).send("Proxy error: " + (err && err.message ? err.message : String(err)));
  }
});

module.exports = router;
