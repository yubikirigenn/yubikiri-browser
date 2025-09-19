const content = document.getElementById('content');
const topLarge = document.getElementById('top-large');
const topSmall = document.getElementById('top-small');

const bigInput = document.getElementById('big-input');
const bigGo = document.getElementById('big-go');
const smallInput = document.getElementById('small-input');
const smallGo = document.getElementById('small-go');

// URLを表示する関数
async function loadURL(url) {
  try {
    content.innerHTML = "読み込み中...";
    const res = await fetch(`/proxy?url=${encodeURIComponent(url)}`);
    const html = await res.text();
    content.innerHTML = html;

    // 大きな検索ボックスは非表示
    topLarge.style.display = 'none';
  } catch (err) {
    content.innerHTML = "読み込みに失敗しました";
    console.error(err);
  }
}

// 大きな検索ボックスから開く
bigGo.addEventListener('click', () => loadURL(bigInput.value));
bigInput.addEventListener('keydown', e => { if(e.key==='Enter') loadURL(bigInput.value); });

// 小さなURLバーから開く
smallGo.addEventListener('click', () => loadURL(smallInput.value));
smallInput.addEventListener('keydown', e => { if(e.key==='Enter') loadURL(smallInput.value); });

// マウスが上に来たら小さいURLバーを表示
document.addEventListener('mousemove', e => {
  if(e.clientY < 50) {
    topSmall.style.display = 'flex';
  } else {
    topSmall.style.display = 'none';
  }
});
