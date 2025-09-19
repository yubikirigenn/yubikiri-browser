// --- 追加ヘルパー関数（proxy.js の上部に挿入） ---

/**
 * 指定スコープで CSS をラップする簡易スコーピング関数
 * - @media ブロックを再帰的に処理する
 * - @keyframes 等はそのままにする（完全対応は難しい）
 */
function scopeCss(cssText, scopeSelector) {
  if (!cssText) return cssText;

  // 再帰的に @media ブロックを処理する
  cssText = cssText.replace(/@media[^{]+\{([\s\S]+?}\s*)\}/g, (m) => {
    // m : 完全な @media { ... }
    // 内部の中身を抽出して再帰処理
    const inner = m.replace(/^(@media[^{]+\{)/, '').replace(/\}\s*$/, '');
    const prefix = m.match(/^(@media[^{]+\{)/)[1];
    const processedInner = scopeCss(inner, scopeSelector);
    return prefix + processedInner + '}';
  });

  // ルールの先頭セレクタ部分をスコープ化する（簡易）
  // 注意: すべての CSS 構文に完全には対応しないが、一般的なケースに効く
  cssText = cssText.replace(/(^|})(\s*)([^@{}\s][^{]*)\{/g, (full, br, ws, selectorPart) => {
    // selectorPart はカンマ区切りのセレクタ群
    const selectors = selectorPart.split(',').map(s => s.trim()).filter(Boolean).map(s => {
      // keyframes など特殊な @ 付きは避ける（ここには来ない想定）
      // 既に scopeSelector がついている場合はそのまま
      if (s.startsWith(scopeSelector)) return s;
      // html や :root を指定された scope に置き換える
      if (s === 'html' || s === ':root') return scopeSelector;
      // body 単体なら #scope
      if (s === 'body') return scopeSelector;
      // :root > .foo のような先頭疑似は scope を前に付ける
      return scopeSelector + ' ' + s;
    });
    return br + ws + selectors.join(', ') + ' {';
  });

  return cssText;
}

/**
 * inline style の中の url(...) をプロキシ化するユーティリティ
 * （あなたの既存 rewriteCssUrls と併用）
 */
function rewriteCssUrls(cssText, base) {
  if (!cssText) return cssText;
  return cssText.replace(/url\(([^)]+)\)/g, (m, urlStr) => {
    const cleaned = urlStr.replace(/^['"]|['"]$/g, "").trim();
    if (!cleaned || cleaned.startsWith("data:") || cleaned.startsWith("javascript:")) return m;
    try {
      const abs = new URL(cleaned, base).toString();
      return `url(/proxy?url=${encodeURIComponent(abs)})`;
    } catch {
      return m;
    }
  });
}

// --- HTML を返す処理内での手順（既存の HTML 分岐のところに差し替え） ---

// （既に cheerio で $ を得ている前提で）
//
// 変更点：
// 1) body の中身を #proxy-root で囲う
// 2) inline style タグの内容を rewriteCssUrls → scopeCss の順で処理
// 3) link 要素で読み込まれる CSS ファイル（外部）は proxy 経由で取得される際に scopeCss を実行（下に示す CSS ブロックで実装）
//

/* --- HTML ラップ --- */
// body の中身を #proxy-root で囲う
// (既に存在する body を壊さないように wrapInner を使用)
if ($('body').length) {
  // 既に proxy-root がある場合はスキップ
  if ($('#proxy-root').length === 0) {
    $('body').wrapInner('<div id="proxy-root"></div>');
  }
} else {
  // 万一 body が無ければ html 全体を wrapper にする
  if ($('#proxy-root').length === 0) {
    $.root().prepend('<div id="proxy-root"></div>');
    // move all children into proxy-root
    const children = $.root().children().not('#proxy-root').toArray();
    children.forEach(ch => $('#proxy-root').append(ch));
  }
}

/* --- inline <style> タグの処理 --- */
$('style').each((i, el) => {
  const $el = $(el);
  const rawCss = $el.html() || '';
  // url(...) を proxy 経由に書き換え
  const cssUrlsRewritten = rewriteCssUrls(rawCss, targetUrl);
  // セレクタを #proxy-root にスコープ
  const scoped = scopeCss(cssUrlsRewritten, '#proxy-root');
  $el.html(scoped);
});

/* --- inline style 属性を書き換え --- */
$('[style]').each((i, el) => {
  const $el = $(el);
  const raw = $el.attr('style') || '';
  const rewritten = rewriteCssUrls(raw, targetUrl);
  $el.attr('style', rewritten);
});

/* --- link rel="stylesheet" は既に /proxy?url=... に置換されている前提 ---
   外部 CSS が /proxy?url=... 経由でサーブされる際に、proxy 側で CSS に scopeCss を走らせます。
   つまり次の箇所（CSS を返す分岐）で scopeCss を呼びます。
*/
