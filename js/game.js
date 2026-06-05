// ===================================================
// game.js - 公式XENO対応 ゲーム制御
// ===================================================
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  doc, onSnapshot, updateDoc, getDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { playCard, initializeGame, resolveDiscard, resolveSageChoice } from "./gameLogic.js";
import { getCardById, getGuessableCards } from "./deck.js";
import {
  updateTurnBanner, renderMyHand, renderOpponentHand,
  renderDeck, renderDiscardPile, renderLog, showResultOverlay
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
const discardModal    = document.getElementById("discardModal");
const discardCardsEl  = document.getElementById("discardCards");
const discardTitle    = document.getElementById("discardTitle");
const sageModal       = document.getElementById("sageModal");
const sageCardsEl     = document.getElementById("sageCards");
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

if (!roomId) window.location.href = "lobby.html";

// ===== 認証確認 =====
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "index.html"; return; }
  currentUser = user;

  const roomRef  = doc(db, "rooms", roomId);
  const roomSnap = await getDoc(roomRef);
  if (!roomSnap.exists()) { window.location.href = "lobby.html"; return; }

  const roomData   = roomSnap.data();
  const playerUids = Object.keys(roomData.players);
  opponentUid      = playerUids.find(uid => uid !== currentUser.uid);

  myLabel.textContent       = `あなた（${playerName}）`;
  opponentLabel.textContent = `相手（${roomData.players[opponentUid]?.name || "相手"}）`;

  if (isHost && !roomData.gameState) {
    await initializeGame(roomId, playerUids);
  }
  listenGame();
});

// ===== Firestoreリアルタイム監視 =====
function listenGame() {
  const roomRef = doc(db, "rooms", roomId);
  unsubscribe = onSnapshot(roomRef, async (snap) => {
    if (!snap.exists()) { window.location.href = "lobby.html"; return; }

    const gs      = snap.data().gameState;
    if (!gs) return;
    currentGameState = gs;

    const isMyTurn = gs.currentTurn === currentUser.uid;
    const myHand   = gs.hands[currentUser.uid] || [];
    const oppHand  = gs.hands[opponentUid]     || [];

    // UI更新
    updateTurnBanner(isMyTurn);
    renderMyHand(myHand, isMyTurn, selectedCardId);
    renderOpponentHand(oppHand);
    renderDeck(gs.deck.length);
    renderDiscardPile(gs.discardPile || []);
    renderLog(gs.log);

    // 占師モーダル
    if (gs.revealed && gs.revealed.uid === currentUser.uid) {
      const revCard = getCardById(gs.revealed.cardId);
      revealCardDisp.innerHTML = `
        <div class="card-display">
          <span class="card-emoji">${revCard.emoji}</span>
          <span class="card-name">${revCard.name}</span>
          <span class="card-value">${revCard.value}</span>
        </div>`;
      revealModal.classList.remove("hidden");
    }

    // ゲーム終了
    if (gs.status === "finished") {
      if (unsubscribe) unsubscribe();
      setTimeout(() => showResultOverlay(gs, currentUser.uid), 600);
      return;
    }

    // 死神の待機（自分が対象の場合）
    if (gs.deathPending && gs.deathPending.targetUid === currentUser.uid) {
      showDiscardModal(gs.hands[currentUser.uid], false);
      return;
    }

    // 皇帝・少年の待機（自分が対象の場合）
    if (gs.emperorPending && gs.emperorPending.targetUid === currentUser.uid) {
      showDiscardModal(gs.hands[currentUser.uid], true);
      return;
    }

       // 賢者の選択（即時発動・ターン関係なく自分が使った場合）
    if (gs.sagePending && gs.sagePending.actingUid === currentUser.uid && gs.sageChoices) {
      showSageModal(gs.sageChoices);
      return;
    }

    // 自分のターン処理
    if (isMyTurn) {
      if (myHand.length === 1 && gs.deck.length > 0 && !gs.sageActive[currentUser.uid]) {
        await drawCard(gs);
        return;
      }
      if (myHand.length === 2) {
        actionArea.classList.remove("hidden");
      }
    } else {
      actionArea.classList.add("hidden");
      selectedCardId = null;
    }
    updatePlayBtn();
  });
}

// ===== カードを1枚引く =====
async function drawCard(gs) {
  const newGs = JSON.parse(JSON.stringify(gs));
  const drawnCardId = newGs.deck.pop();
  newGs.hands[currentUser.uid].push(drawnCardId);
  const roomRef = doc(db, "rooms", roomId);
  await updateDoc(roomRef, { gameState: newGs });
}



// ===== 手札カードクリック =====
document.getElementById("myCards").addEventListener("click", (e) => {
  const cardEl = e.target.closest(".game-card");
  if (!cardEl || !currentGameState) return;

  const isMyTurn = currentGameState.currentTurn === currentUser.uid;
  const myHand   = currentGameState.hands[currentUser.uid] || [];
  if (!isMyTurn || myHand.length < 2) return;

  const clickedId = Number(cardEl.dataset.cardId);
  // 英雄（10）は選択不可
  if (clickedId === 10) {
    alert("英雄は自分から出すことができません！");
    return;
  }

  selectedCardId = clickedId;
  renderMyHand(myHand, true, selectedCardId);
  updatePlayBtn();
});

// ===== プレイボタン更新 =====
function updatePlayBtn() {
  if (selectedCardId) {
    const card = getCardById(selectedCardId);
    playCardBtn.disabled    = false;
    playCardBtn.textContent = `「${card.name}」をプレイする`;
  } else {
    playCardBtn.disabled    = true;
    playCardBtn.textContent = "カードを選択してください";
  }
}

// ===== プレイボタン押下 =====
playCardBtn.addEventListener("click", () => {
  if (!selectedCardId) return;
  if (selectedCardId === 2) {
    showGuessModal();
  } else {
    executePlayCard(selectedCardId);
  }
});

// ===== カードをプレイ =====
async function executePlayCard(cardId, guessId = null) {
  if (!currentUser || !opponentUid || !currentGameState) return;
  playCardBtn.disabled = true;
  actionArea.classList.add("hidden");
  selectedCardId = null;
  try {
    await playCard(roomId, currentGameState, currentUser.uid, opponentUid, cardId, guessId);
  } catch (error) {
    console.error("カードプレイエラー:", error);
    playCardBtn.disabled = false;
    actionArea.classList.remove("hidden");
  }
}

// ===== 兵士：宣言モーダル =====
function showGuessModal() {
  const cards = getGuessableCards();
  guessCardsEl.innerHTML = "";
  cards.forEach(card => {
    const btn     = document.createElement("button");
    btn.className = "guess-card-btn";
    btn.innerHTML = `<span>${card.emoji}</span><span>${card.name}</span><span class="card-val">${card.value}</span>`;
    btn.addEventListener("click", () => {
      guessModal.classList.add("hidden");
      executePlayCard(selectedCardId, card.id);
    });
    guessCardsEl.appendChild(btn);
  });
  guessModal.classList.remove("hidden");
}
cancelGuessBtn.addEventListener("click", () => guessModal.classList.add("hidden"));

// ===== 死神・皇帝：捨て札選択モーダル =====
function showDiscardModal(handCardIds, isEmperorEffect) {
  discardTitle.textContent  = isEmperorEffect
    ? "👑 手札を全て公開して1枚を選んで捨てる"
    : "💀 手札から1枚を選んで捨てる";
  discardCardsEl.innerHTML = "";

  handCardIds.forEach(id => {
    const card  = getCardById(id);
    if (!card) return;

    // 皇帝効果では英雄も捨てられる（転生なし）
    const btn     = document.createElement("button");
    btn.className = "guess-card-btn";
    btn.innerHTML = `<span>${card.emoji}</span><span>${card.name}</span><span class="card-val">${card.value}</span>`;
    btn.addEventListener("click", async () => {
      discardModal.classList.add("hidden");
      const actingUid   = currentUser.uid;
      const opponentId  = opponentUid;
      await resolveDiscard(
        roomId,
        currentGameState,
        actingUid,
        opponentId,
        id,
        isEmperorEffect
      );
    });
    discardCardsEl.appendChild(btn);
  });

  discardModal.classList.remove("hidden");
}

// ===== 賢者：カード選択モーダル =====
function showSageModal(choices) {
  sageCardsEl.innerHTML = "";
  choices.forEach(id => {
    const card  = getCardById(id);
    if (!card) return;
    const btn     = document.createElement("button");
    btn.className = "guess-card-btn";
    btn.innerHTML = `<span>${card.emoji}</span><span>${card.name}</span><span class="card-val">${card.value}</span>`;
    btn.addEventListener("click", async () => {
      sageModal.classList.add("hidden");
      await resolveSageChoice(roomId, currentGameState, currentUser.uid, opponentUid, id);
    });
    sageCardsEl.appendChild(btn);
  });
  sageModal.classList.remove("hidden");
}

// ===== 占師モーダルを閉じる =====
closeRevealBtn.addEventListener("click", async () => {
  revealModal.classList.add("hidden");
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
