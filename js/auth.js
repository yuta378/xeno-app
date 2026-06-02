// Firebase認証の処理
import { auth, signInAnonymously } from "./firebase-config.js";

// HTML要素の取得
const startBtn = document.getElementById("startBtn");
const playerNameInput = document.getElementById("playerName");
const errorMsg = document.getElementById("errorMsg");

// 「ゲームを始める」ボタンを押したとき
startBtn.addEventListener("click", async () => {

  const playerName = playerNameInput.value.trim();

  // 名前が空の場合はエラーを表示
  if (playerName === "") {
    errorMsg.classList.remove("hidden");
    return;
  }

  errorMsg.classList.add("hidden");

  // ボタンを無効化（二重クリック防止）
  startBtn.disabled = true;
  startBtn.textContent = "接続中...";

  try {
    // Firebaseに匿名ログイン
    await signInAnonymously(auth);

    // プレイヤー名をlocalStorageに保存
    localStorage.setItem("playerName", playerName);

    // ロビー画面へ移動
    window.location.href = "lobby.html";

  } catch (error) {
    console.error("ログインエラー:", error);
    startBtn.disabled = false;
    startBtn.textContent = "ゲームを始める";
    alert("接続に失敗しました。もう一度お試しください。");
  }

});

// Enterキーでもスタートできるようにする
playerNameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    startBtn.click();
  }
});