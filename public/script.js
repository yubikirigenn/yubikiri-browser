// public/script.js

let proxiedActive = false;
let hideTimer = null;

function setTopSmallVisible(visible) {
  const bar = document.getElementById('top-small');
  if (!bar) return;
  const h = bar.offsetHeight || 80;
  if (visible) bar.style.top = '0';
  else bar.style.top = `-${h}px`;
}

function looksLikeUrl(s) {
  if (!s) return false;
  try {
    const u = new URL(s);
    return !!u.protocol;
  } catch (e) {
    return /\S+\.\S+/.test(s) && !/\s/.test(s);
  }
}

async function loadSite(inputValue) {
  const content = document.getElementById('content');
  const topLarge = document.getElementById('top-large');
  if (!content) return;

  proxiedActive = false;
  setTopSmallVisible(false);

  let target;
  if (looksLikeUrl(inputValue)) {
    if (!/^[a-zA-Z][a-zA-Z0-9+\-.]*:/.test(inputValue)) {
      target = 'https://' + inputValue;
    } else {
      target = inputValue;
    }
  } else {
    target = `https://www.google.com/search?q=${encodeURIComponent(inputValue)}`;
  }

  try {
    // hide top-large immediately to avoid overlaying
    if (topLarge) topLarge.style.display = 'none';

    content.innerHTML = '';

    const res = await fetch(`/proxy?url=${encodeURIComponent(target)}`);
    if (!res.ok) throw new Error('HTTP error! status: ' + res.status);
    const html = await res.text();

    // inject HTML
    content.innerHTML = html;

    proxiedActive = true;

    // put the small input value to reflect the loaded URL
    const smallInput = document.getElementById('small-input');
    if (smallInput) smallInput.value = target;
  } catch (err) {
    console.error('Client fetch error:', err);
    content.innerHTML = `<div style="padding:24px;color:#900">読み込みに失敗しました：${String(err).replace(/</g,'&lt;')}</div>`;
    proxiedActive = false;
    setTopSmallVisible(false);
    if (topLarge) topLarge.style.display = '';
  }
}

function wireSearchBoxes() {
  const largeInput = document.getElementById('large-input');
  const largeButton = document.getElementById('large-go');
  const smallInput = document.getElementById('small-input');
  const smallButton = document.getElementById('small-go');

  if (largeButton) largeButton.addEventListener('click', () => {
    const v = (largeInput && largeInput.value) ? largeInput.value.trim() : '';
    if (v) loadSite(v);
  });
  if (largeInput) largeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const v = largeInput.value.trim();
      if (v) loadSite(v);
    }
  });

  if (smallButton) smallButton.addEventListener('click', () => {
    const v = (smallInput && smallInput.value) ? smallInput.value.trim() : '';
    if (v) loadSite(v);
  });
  if (smallInput) smallInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const v = smallInput.value.trim();
      if (v) loadSite(v);
    }
  });
}

function wireTopBarAutoShow() {
  document.addEventListener('mousemove', (e) => {
    if (!proxiedActive) return;
    if (e.clientY <= 40) {
      clearTimeout(hideTimer);
      setTopSmallVisible(true);
    } else {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => setTopSmallVisible(false), 700);
    }
  });

  document.addEventListener('touchstart', (e) => {
    if (!proxiedActive) return;
    const y = e.touches && e.touches[0] ? e.touches[0].clientY : 9999;
    if (y <= 40) setTopSmallVisible(true);
    else {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => setTopSmallVisible(false), 700);
    }
  });

  document.addEventListener('mouseleave', () => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => setTopSmallVisible(false), 300);
  });

  window.addEventListener('resize', () => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => setTopSmallVisible(false), 100);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  // hide small bar initially
  setTimeout(() => setTopSmallVisible(false), 10);
  wireSearchBoxes();
  wireTopBarAutoShow();

  // optional: load default site (commented out if you want blank start)
  // loadSite('https://www.amazon.co.jp/');
});
