// Firebase関連の読み込み
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  doc,
  onSnapshot,
  updateDoc,
  deleteDoc,
  deleteField
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// HTML要素の取得
const roomIdDisplay = document.getElementById("roomIdDisplay");
const copyBtn       = document.getElementById("copyBtn");
const player1Name   = document.getElementById("player1Name");
const player2Name   = document.getElementById("player2Name");
const player1Ready  = document.getElementById("player1Ready");
const player2Ready  = document.getElementById("player2Ready");
const hostBadge1    = document.getElementById("hostBadge1");
const hostBadge2    = document.getElementById("hostBadge2");
const readyBtn      = document.getElementById("readyBtn");
const startGameBtn  = document.getElementById("startGameBtn");
const leaveBtn      = document.getElementById("leaveBtn");

// localStorageから情報取得
const roomId     = localStorage.getItem("roomId");
const isHost     = localStorage.getItem("isHost") === "true";
const playerName = localStorage.getItem("playerName") || "プレイヤー";

// ルームIDが無ければロビーへ
if (!roomId) window.location.href = "lobby.html";

// ルームIDを表示
roomIdDisplay.textContent = roomId;

// 現在のユーザー
let currentUser  = null;
let isReady      = false;
let unsubscribe  = null;

// 認証確認
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    listenRoom();
  } else {
    window.location.href = "index.html";
  }
});

// ===== Firestoreをリアルタイム監視 =====
function listenRoom() {
  const roomRef = doc(db, "rooms", roomId);

  unsubscribe = onSnapshot(roomRef, (snap) => {
    if (!snap.exists()) {
      // ルームが削除された場合
      alert("ルームが解散されました");
      localStorage.removeItem("roomId");
      localStorage.removeItem("isHost");
      window.location.href = "lobby.html";
      return;
    }

    const data    = roomData(snap);
    const players = data.players;
    const uids    = Object.keys(players);

    // ゲームが始まったらgame.htmlへ
    if (data.status === "playing") {
      if (unsubscribe) unsubscribe();
      window.location.href = "game.html";
      return;
    }

    updatePlayerUI(players, uids, data.hostId);
    updateActionButtons(players, uids);
  });
}

// Firestoreのデータを取得
function roomData(snap) {
  return snap.data();
}

// ===== プレイヤーUIを更新 =====
function updatePlayerUI(players, uids, hostId) {
  uids.forEach((uid, index) => {
    const player  = players[uid];
    const nameEl  = index === 0 ? player1Name  : player2Name;
    const readyEl = index === 0 ? player1Ready : player2Ready;
    const badgeEl = index === 0 ? hostBadge1   : hostBadge2;

    nameEl.textContent = player.name;

    // ホストバッジ
    if (uid === hostId) {
      badgeEl.classList.remove("hidden");
    }

    // 準備状況バッジ
    if (player.isReady) {
      readyEl.textContent = "✅ 準備完了";
      readyEl.className   = "status-badge ready";
    } else {
      readyEl.textContent = "待機中";
      readyEl.className   = "status-badge waiting";
    }
  });

  // 2人未満の場合は2人目を「参加待ち」に
  if (uids.length < 2) {
    player2Name.textContent  = "参加待ち...";
    player2Ready.textContent = "待機中";
    player2Ready.className   = "status-badge waiting";
    hostBadge2.classList.add("hidden");
  }
}

// ===== アクションボタンを更新 =====
function updateActionButtons(players, uids) {
  const allReady = uids.length === 2 &&
    Object.values(players).every(p => p.isReady);

  // 2人揃ったら準備完了ボタンを有効化
  if (uids.length === 2) {
    readyBtn.disabled = false;
    if (!isReady) {
      readyBtn.textContent = "準備完了！";
    } else {
      readyBtn.textContent = "✅ 準備完了済み";
      readyBtn.disabled    = true;
    }
  }

  // ホストかつ全員準備完了ならゲーム開始ボタンを表示
  if (isHost && allReady) {
    startGameBtn.classList.remove("hidden");
    readyBtn.classList.add("hidden");
  } else {
    startGameBtn.classList.add("hidden");
  }
}

// ===== 準備完了ボタン =====
readyBtn.addEventListener("click", async () => {
  if (!currentUser || isReady) return;

  isReady          = true;
  readyBtn.disabled = true;
  readyBtn.textContent = "✅ 準備完了済み";

  const roomRef = doc(db, "rooms", roomId);
  await updateDoc(roomRef, {
    [`players.${currentUser.uid}.isReady`]: true
  });
});

// ===== ゲーム開始ボタン（ホストのみ） =====
startGameBtn.addEventListener("click", async () => {
  if (!isHost) return;

  startGameBtn.disabled     = true;
  startGameBtn.textContent  = "開始中...";

  const roomRef = doc(db, "rooms", roomId);
  await updateDoc(roomRef, {
    status: "playing"
  });
});

// ===== ルームIDコピーボタン =====
copyBtn.addEventListener("click", () => {
  navigator.clipboard.writeText(roomId).then(() => {
    copyBtn.textContent = "✅ コピーしました！";
    setTimeout(() => {
      copyBtn.textContent = "IDをコピー";
    }, 2000);
  });
});

// ===== ロビーに戻るボタン =====
leaveBtn.addEventListener("click", async () => {
  if (!currentUser) return;

  if (unsubscribe) unsubscribe();

  const roomRef = doc(db, "rooms", roomId);

  if (isHost) {
    // ホストが抜けたらルームを削除
    await deleteDoc(roomRef);
  } else {
    // ゲストが抜けたらプレイヤー情報を削除
    await updateDoc(roomRef, {
      [`players.${currentUser.uid}`]: deleteField()
    });
  }

  localStorage.removeItem("roomId");
  localStorage.removeItem("isHost");
  window.location.href = "lobby.html";
});