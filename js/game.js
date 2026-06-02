// ===================================================
// game.js - ゲーム画面のメイン制御
// ===================================================
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  doc,
  onSnapshot,
  updateDoc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { playCard, initializeGame } from "./gameLogic.js";
import { getCardById, getGuessableCards } from "./deck.js";
import {
  updateTurnBanner,
  renderMyHand,
  renderOpponentHand,
  renderDeck,
  renderOpenCards,
  renderLog,
  showResultOverlay
} from "./ui.js";

// ===== DOM要素 =====
const actionArea      = document.getElementById("actionArea");
const playCardBtn     = document.getElementById("playCardBtn");
const guessModal      = document.getElementById("guessModal");
const guessCardsEl    = document.getElementById("guessCards");
const cancelGuessBtn  = document.getElementById("cancelGuessBtn");
const revealModal     = document.getElementById("revealModal");
const revealCardDisp  = document.getElementById("revealCardDisplay");
const closeRevealBtn  = document.getElementById("closeRevealBtn");
const returnLobbyBtn  = document.getElementById("returnLobbyBtn");
const myLabel         = document.getElementById("myLabel");
const opponentLabel   = document.getElementById("opponentLabel");

// ===== 状態管理 =====
const roomId     = localStorage.getItem("roomId");
const isHost     = localStorage.getItem("isHost") === "true";
const playerName = localStorage.getItem("playerName") || "プレイヤー";

let currentUser      = null;
let opponentUid      = null;
let selectedCardId   = null;
let currentGameState = null;
let unsubscribe      = null;

// ルームIDがなければロビーへ
if (!roomId) window.location.href = "lobby.html";

// ===== 認証確認 =====
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  currentUser = user;

  // ルームデータを取得
  const roomRef  = doc(db, "rooms", roomId);
  const roomSnap = await getDoc(roomRef);

  if (!roomSnap.exists()) {
    window.location.href = "lobby.html";
    return;
  }

  const roomData   = roomSnap.data();
  const playerUids = Object.keys(roomData.players);

  // 相手のUIDを特定
  opponentUid = playerUids.find(uid => uid !== currentUser.uid);

  // プレイヤーラベルを設定
  myLabel.textContent       = `あなた（${playerName}）`;
  const opponentName        = roomData.players[opponentUid]?.name || "相手";
  opponentLabel.textContent = `相手（${opponentName}）`;

  // ホストがゲームを初期化（未初期化の場合のみ）
  if (isHost && !roomData.gameState) {
    await initializeGame(roomId, playerUids);
  }

  // ゲーム状態をリアルタイム監視
  listenGame();
});

// ===== Firestoreリアルタイム監視 =====
function listenGame() {
  const roomRef = doc(db, "rooms", roomId);

  unsubscribe = onSnapshot(roomRef, async (snap) => {
    if (!snap.exists()) {
      window.location.href = "lobby.html";
      return;
    }

    const data = snap.data();
    const gs   = data.gameState;
    if (!gs) return;

    currentGameState  = gs;
    const isMyTurn    = gs.currentTurn === currentUser.uid;
    const myHand      = gs.hands[currentUser.uid] || [];
    const oppHand     = gs.hands[opponentUid]     || [];

    // ===== UI更新 =====
    updateTurnBanner(isMyTurn);
    renderMyHand(myHand, isMyTurn, selectedCardId);
    renderOpponentHand(oppHand);
    renderDeck(gs.deck.length);
    renderOpenCards(gs.openCards);
    renderLog(gs.log);

    // 占師で相手の手札が見えた場合
    if (gs.revealed && gs.revealed.uid === currentUser.uid) {
      const revCard = getCardById(gs.revealed.cardId);
      revealCardDisp.innerHTML = `
        <div class="card-display">
          <span class="card-emoji">${revCard.emoji}</span>
          <span class="card-name">${revCard.name}</span>
          <span class="card-value">${revCard.value}</span>
        </div>
      `;
      revealModal.classList.remove("hidden");
    }

    // ===== ゲーム終了 =====
    if (gs.status === "finished") {
      if (unsubscribe) unsubscribe();
      setTimeout(() => showResultOverlay(gs, currentUser.uid), 600);
      return;
    }

    // ===== 自分のターン処理 =====
    if (isMyTurn) {
      // 手札が1枚ならカードを引く
      if (myHand.length === 1 && gs.deck.length > 0) {
        await drawCard(gs);
        return;
      }
      // 手札が2枚ならアクションボタンを表示
      if (myHand.length === 2) {
        actionArea.classList.remove("hidden");
      }
    } else {
      // 相手のターンはアクションボタンを隠す
      actionArea.classList.add("hidden");
      selectedCardId = null;
    }

    updatePlayBtn();
  });
}

// ===== カードを1枚引く =====
async function drawCard(gs) {
  const newGs               = JSON.parse(JSON.stringify(gs));
  const drawnCardId         = newGs.deck.pop();
  newGs.hands[currentUser.uid].push(drawnCardId);

  const roomRef = doc(db, "rooms", roomId);
  await updateDoc(roomRef, { gameState: newGs });
}

// ===== 手札カードをクリック（選択） =====
document.getElementById("myCards").addEventListener("click", (e) => {
  const cardEl = e.target.closest(".game-card");
  if (!cardEl) return;
  if (!currentGameState) return;

  const isMyTurn = currentGameState.currentTurn === currentUser.uid;
  const myHand   = currentGameState.hands[currentUser.uid] || [];

  if (!isMyTurn || myHand.length < 2) return;

  selectedCardId = Number(cardEl.dataset.cardId);
  renderMyHand(myHand, true, selectedCardId);
  updatePlayBtn();
});

// ===== プレイボタンの状態を更新 =====
function updatePlayBtn() {
  if (selectedCardId) {
    const card            = getCardById(selectedCardId);
    playCardBtn.disabled  = false;
    playCardBtn.textContent = `「${card.name}」をプレイする`;
  } else {
    playCardBtn.disabled  = true;
    playCardBtn.textContent = "カードを選択してください";
  }
}

// ===== プレイボタン押下 =====
playCardBtn.addEventListener("click", () => {
  if (!selectedCardId) return;

  // 兵士（1）の場合はカード宣言モーダルを表示
  if (selectedCardId === 1) {
    showGuessModal();
  } else {
    executePlayCard(selectedCardId);
  }
});

// ===== カードをプレイ（Firestoreに反映） =====
async function executePlayCard(cardId, guessId = null) {
  if (!currentUser || !opponentUid || !currentGameState) return;

  // ボタン・エリアを無効化（二重操作防止）
  playCardBtn.disabled = true;
  actionArea.classList.add("hidden");
  selectedCardId = null;

  try {
    await playCard(
      roomId,
      currentGameState,
      currentUser.uid,
      opponentUid,
      cardId,
      guessId
    );
  } catch (error) {
    console.error("カードプレイエラー:", error);
    playCardBtn.disabled = false;
    actionArea.classList.remove("hidden");
  }
}

// ===== 兵士：宣言モーダルを表示 =====
function showGuessModal() {
  const cards           = getGuessableCards();
  guessCardsEl.innerHTML = "";

  cards.forEach(card => {
    const btn       = document.createElement("button");
    btn.className   = "guess-card-btn";
    btn.innerHTML   = `
      <span>${card.emoji}</span>
      <span>${card.name}</span>
      <span class="card-val">${card.value}</span>
    `;
    btn.addEventListener("click", () => {
      guessModal.classList.add("hidden");
      executePlayCard(selectedCardId, card.id);
    });
    guessCardsEl.appendChild(btn);
  });

  guessModal.classList.remove("hidden");
}

// ===== 宣言キャンセル =====
cancelGuessBtn.addEventListener("click", () => {
  guessModal.classList.add("hidden");
});

// ===== 占師モーダルを閉じる =====
closeRevealBtn.addEventListener("click", async () => {
  revealModal.classList.add("hidden");

  // Firestoreのrevealed状態をクリア
  const roomRef = doc(db, "rooms", roomId);
  await updateDoc(roomRef, { "gameState.revealed": null });
});

// ===== ロビーに戻る =====
returnLobbyBtn.addEventListener("click", () => {
  if (unsubscribe) unsubscribe();
  localStorage.removeItem("roomId");
  localStorage.removeItem("isHost");
  window.location.href = "lobby.html";
});