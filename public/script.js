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
    // URLをエンコードしてプロキシ経由で取得
    const res = await fetch(`/proxy?url=${encodeURIComponent(url)}`);
    const html = await res.text();
    content.innerHTML = html;

    // トップページの大きいフォームを隠す
    topLarge.style.display = 'none';

    // 上部URLバーを有効に
    topSmall.style.display = 'none'; // 初期は非表示
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

// マウスカーソルが上に来たら小さなバーを表示
document.addEventListener('mousemove', e => {
  if (content.innerHTML !== '' && e.clientY < 50) {
    topSmall.style.display = 'flex';
  } else if (content.innerHTML !== '' && e.clientY > 80) {
    topSmall.style.display = 'none';
  }
});
