// #result を Shadow DOM に置き換える
const result = document.getElementById('result');
const shadowRoot = result.attachShadow({ mode: 'open' });
shadowRoot.innerHTML = '<div id="shadowContent"></div>';
