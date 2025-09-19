const content = document.getElementById('content');
const topLarge = document.getElementById('top-large');
const topSmall = document.getElementById('top-small');

const bigInput = document.getElementById('big-input');
const bigGo = document.getElementById('big-go');

const smallInput = document.getElementById('small-input');
const smallGo = document.getElementById('small-go');

// サイトを表示する関数
async function loadSite(url) {
  if (!url) return;

  try {
    const res = await fetch(`/proxy?url=${encodeURIComponent(url)}`);
    const html = await res.text();
    content.innerHTML = html;

    // トップページの大きなフォームを隠す
    topLarge.style.display = 'none';

    // 上部URLバーは画面外からスライドで表示される
    topSmall.style.top = '-60px'; // 初期は隠す
  } catch (err) {
    content.innerHTML = `<p style="color:red;">読み込みエラー: ${err.message}</p>`;
  }
}

// トップページの大きい検索バー
bigGo.addEventListener('click', () => loadSite(bigInput.value));
bigInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') loadSite(bigInput.value);
});

// 上部URLバー（サイト表示中）
smallGo.addEventListener('click', () => loadSite(smallInput.value));
smallInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') loadSite(smallInput.value);
});

// マウスカーソルが上に来たら小さなバーをスライドで表示
document.addEventListener('mousemove', e => {
  if (content.innerHTML !== '') {
    if (e.clientY < 50) {
      topSmall.style.top = '0';
    } else if (e.clientY > 80) {
      topSmall.style.top = '-60px';
    }
  }
});
