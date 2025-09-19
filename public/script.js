document.addEventListener("DOMContentLoaded", () => {
  const topLargeInput = document.querySelector("#top-large input");
  const topLargeButton = document.querySelector("#top-large button");
  const topSmallInput = document.querySelector("#top-small input");
  const topSmallButton = document.querySelector("#top-small button");

  // URLかどうか判定する関数
  function isValidUrl(text) {
    try {
      new URL(text);
      return true;
    } catch {
      return false;
    }
  }

  // 入力を処理する共通関数
  function handleInput(value) {
    if (!value) return;

    let target;
    if (isValidUrl(value)) {
      target = `/proxy?url=${encodeURIComponent(value)}`;
    } else {
      target = `/proxy?url=${encodeURIComponent("https://www.google.com/search?q=" + value)}`;
    }

    window.location.href = target;
  }

  // Enter キーで送信
  [topLargeInput, topSmallInput].forEach((input) => {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        handleInput(input.value);
      }
    });
  });

  // ボタンで送信
  topLargeButton.addEventListener("click", () => handleInput(topLargeInput.value));
  topSmallButton.addEventListener("click", () => handleInput(topSmallInput.value));
});
