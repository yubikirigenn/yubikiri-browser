// public/script.js
(() => {
  const bigInput = document.getElementById('big-input');
  const bigGo = document.getElementById('big-go');
  const thinBar = document.getElementById('thin-bar');
  const thinInput = document.getElementById('thin-input');
  const thinGo = document.getElementById('thin-go');
  const content = document.getElementById('content');
  const loading = document.getElementById('loading');
  const topLarge = document.getElementById('top-large');

  let currentUrl = null;
  let collapseTimer = null;

  // Helper: show/hide loading
  function showLoading() { loading.classList.remove('hidden'); }
  function hideLoading() { loading.classList.add('hidden'); }

  // Safely set innerHTML and execute scripts
  async function setContentHtml(html, baseUrl) {
    // put HTML
    content.innerHTML = html;

    // run scripts: find script tags and re-insert them to execute
    const scripts = Array.from(content.querySelectorAll('script'));
    for (const s of scripts) {
      try {
        const ns = document.createElement('script');
        // copy type / async / defer
        if (s.type) ns.type = s.type;
        if (s.async) ns.async = true;
        if (s.defer) ns.defer = true;

        if (s.src) {
          // preserve absolute/rewritten src (proxy should have rewritten to /proxy?url=...)
          ns.src = s.src;
          // keep crossorigin if present
          if (s.crossOrigin) ns.crossOrigin = s.crossOrigin;
          content.appendChild(ns);
        } else {
          // inline script: use textContent
          ns.textContent = s.textContent;
          s.parentNode.replaceChild(ns, s);
        }
      } catch (e) {
        console.warn('script exec error', e);
      }
    }

    // intercept links and forms inside loaded page
    attachInterceptors(baseUrl);
  }

  // Intercept clicks on <a> so navigation stays inside proxy
  function attachInterceptors(baseUrl) {
    // delegate for links
    content.addEventListener('click', linkClickHandler);
    // form submit handler
    content.addEventListener('submit', formSubmitHandler);
  }

  function linkClickHandler(ev) {
    const a = ev.target.closest && ev.target.closest('a');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href) return;
    // ignore same-page anchors and javascript:
    if (href.startsWith('#') || href.trim().toLowerCase().startsWith('javascript:')) return;
    ev.preventDefault();
    // resolve absolute relative to currentUrl
    try {
      const resolved = new URL(href, currentUrl).toString();
      loadUrl(resolved);
    } catch (e) {
      console.warn('Bad URL clicked:', href, e);
    }
  }

  // Support simple GET forms: submit via querystring and load result
  async function formSubmitHandler(ev) {
    const form = ev.target;
    if (!form || form.tagName.toLowerCase() !== 'form') return;
    ev.preventDefault();
    const method = (form.method || 'GET').toUpperCase();
    const action = form.action || currentUrl;
    if (method === 'GET') {
      const fd = new FormData(form);
      const params = new URLSearchParams();
      for (const [k, v] of fd.entries()) params.append(k, v);
      const target = new URL(action, currentUrl);
      target.search = params.toString();
      loadUrl(target.toString());
    } else {
      // POST not supported by this simple UI unless backend supports /proxy/post
      alert('このフォームは POST です。現在のプロキシは GET フォームのみ自動処理します。POST をサポートしたい場合はサーバーに /proxy/post エンドポイントを追加してください。');
    }
  }

  // Main: load URL via proxy
  async function loadUrl(url) {
    // normalize: ensure protocol
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    currentUrl = url;
    // update thin input value
    thinInput.value = url;
    bigInput.value = url;

    showLoading();
    try {
      const res = await fetch(`/proxy?url=${encodeURIComponent(url)}`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('text/html')) {
        const html = await res.text();

        // mark that "site is open" (collapse big header)
        content.classList.add('site-open');
        topLarge.style.display = 'none';

        // show thin bar in compact mode (but hidden initially)
        thinBar.classList.add('visible');

        // inject and run scripts
        await setContentHtml(html, url);

        // collapse thin bar shortly after load
        setTimeout(() => {
          thinBar.classList.remove('visible');
        }, 1600);
      } else {
        // non-html (binary): attempt to open in new tab via blob
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, '_blank');
      }
    } catch (err) {
      content.innerHTML = `<div style="padding:24px;color:#900;">読み込みに失敗しました: ${err.message}</div>`;
      console.error('loadUrl error', err);
    } finally {
      hideLoading();
    }
  }

  // UI wiring
  bigGo.addEventListener('click', () => loadUrl(bigInput.value.trim()));
  thinGo.addEventListener('click', () => loadUrl(thinInput.value.trim()));
  bigInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadUrl(bigInput.value.trim()); });
  thinInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadUrl(thinInput.value.trim()); });

  // mouse near top => show thin bar; otherwise hide after pause
  document.addEventListener('mousemove', (ev) => {
    if (ev.clientY <= 60) {
      thinBar.classList.add('visible');
      // clear collapse timer
      if (collapseTimer) { clearTimeout(collapseTimer); collapseTimer = null; }
    } else {
      // schedule hide
      if (!collapseTimer) {
        collapseTimer = setTimeout(() => {
          thinBar.classList.remove('visible');
          collapseTimer = null;
        }, 1200);
      }
    }
  });

  // keyboard shortcut: Ctrl+L focuses thin input
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      thinBar.classList.add('visible');
      thinInput.focus();
      thinInput.select();
    }
  });

  // Initial focus in big input
  window.addEventListener('load', () => bigInput.focus());
})();
