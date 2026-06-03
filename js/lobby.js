// Firebase関連の読み込み
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// HTML要素の取得
const playerNameDisplay = document.getElementById("playerNameDisplay");
const createRoomBtn     = document.getElementById("createRoomBtn");
const joinRoomBtn       = document.getElementById("joinRoomBtn");
const roomIdInput       = document.getElementById("roomIdInput");
const joinErrorMsg      = document.getElementById("joinErrorMsg");
const logoutBtn         = document.getElementById("logoutBtn");

// プレイヤー名を表示
const playerName = localStorage.getItem("playerName") || "プレイヤー";
playerNameDisplay.textContent = `プレイヤー：${playerName}`;

// 現在のユーザー
let currentUser = null;

// 認証状態の確認（未ログインならトップへ）
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
  } else {
    window.location.href = "index.html";
  }
});

// ランダムなルームIDを生成（6文字）
// ランダムな3桁の数字ルームIDを生成（100〜999）
function generateRoomId() {
  return String(Math.floor(Math.random() * 900) + 100);
}

// ===== ルームを作成する =====
createRoomBtn.addEventListener("click", async () => {
  if (!currentUser) return;

  createRoomBtn.disabled = true;
  createRoomBtn.textContent = "作成中...";

  try {
    const roomId  = generateRoomId();
    const roomRef = doc(db, "rooms", roomId);

    // Firestoreにルームデータを保存
    await setDoc(roomRef, {
      roomId     : roomId,
      hostId     : currentUser.uid,
      status     : "waiting",
      createdAt  : serverTimestamp(),
      players    : {
        [currentUser.uid]: {
          name    : playerName,
          isReady : false
        }
      }
    });

    // ルームIDとホスト情報を保存してWaiting画面へ
    localStorage.setItem("roomId", roomId);
    localStorage.setItem("isHost", "true");
    window.location.href = "waiting.html";

  } catch (error) {
    console.error("ルーム作成エラー:", error);
    createRoomBtn.disabled = false;
    createRoomBtn.textContent = "ルームを作成";
    alert("ルームの作成に失敗しました。もう一度お試しください。");
  }
});

// ===== ルームに参加する =====
joinRoomBtn.addEventListener("click", async () => {
  if (!currentUser) return;

  const roomId = roomIdInput.value.trim().toUpperCase();

  // ルームIDが空の場合
  if (roomId === "") {
    showError("ルームIDを入力してください");
    return;
  }

  joinRoomBtn.disabled = true;
  joinRoomBtn.textContent = "参加中...";

  try {
    const roomRef  = doc(db, "rooms", roomId);
    const roomSnap = await getDoc(roomRef);

    // ルームが存在しない場合
    if (!roomSnap.exists()) {
      showError("ルームが見つかりません");
      resetJoinBtn();
      return;
    }

    const roomData = roomSnap.data();

    // ゲームがすでに始まっている場合
    if (roomData.status !== "waiting") {
      showError("このルームはすでにゲームが始まっています");
      resetJoinBtn();
      return;
    }

    // ルームが満員の場合
    if (Object.keys(roomData.players).length >= 2) {
      showError("このルームは満員です");
      resetJoinBtn();
      return;
    }

    // プレイヤーをルームに追加
    await updateDoc(roomRef, {
      [`players.${currentUser.uid}`]: {
        name    : playerName,
        isReady : false
      }
    });

    // ルームIDを保存してWaiting画面へ
    localStorage.setItem("roomId", roomId);
    localStorage.setItem("isHost", "false");
    window.location.href = "waiting.html";

  } catch (error) {
    console.error("ルーム参加エラー:", error);
    resetJoinBtn();
    alert("ルームへの参加に失敗しました。もう一度お試しください。");
  }
});

// エラーメッセージを表示
function showError(message) {
  joinErrorMsg.textContent = message;
  joinErrorMsg.classList.remove("hidden");
}

// 参加ボタンをリセット
function resetJoinBtn() {
  joinRoomBtn.disabled = false;
  joinRoomBtn.textContent = "参加する";
}

// ===== 戻るボタン（ログアウト） =====
logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  localStorage.clear();
  window.location.href = "index.html";
});
