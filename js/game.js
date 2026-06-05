// ===================================================
// game.js - XENO ゲーム制御（完全版）
// ===================================================
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, onSnapshot, updateDoc, getDoc }
  from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
  playCard, initializeGame,
  resolveDiscard, resolveSageChoice, checkDeckEmpty
} from "./gameLogic.js";
import { getCardById, getGuessableCards } from "./deck.js";
import {
  updateTurnBanner, renderMyHand, renderOpponentHand,
  renderDeck, renderDiscardPile, renderLog, showResultOverlay
} from "./ui.js";

// ===== DOM =====
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

// ===== 状態 =====
const roomId     = localStorage.getItem("roomId");
const isHost     = localStorage.getItem("isHost") === "true";
const playerName = localStorage.getItem("playerName") || "プレイヤー";

let currentUser      = null;
let opponentUid      = null;
let selectedCardId   = null;
let currentGameState = null;
let unsubscribe      = null;
let isProcessing     = false;  // 二重操作防止

if (!roomId) window.location.href = "lobby.html";

// ===== 認証確認 =====
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "index.html"; return; }
  currentUser = user;

  const roomSnap = await getDoc(doc(db, "rooms", roomId));
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
  unsubscribe = onSnapshot(doc(db, "rooms", roomId), async (snap) => {
    if (!snap.exists()) { window.location.href = "lobby.html"; return; }
    const gs = snap.data().gameState;
    if (!gs) return;

    currentGameState = gs;
    const isMyTurn   = gs.currentTurn === currentUser.uid;
    const myHand     = gs.hands[currentUser.uid] || [];
    const oppHand    = gs.hands[opponentUid]     || [];

    // ===== UI 描画 =====
    updateTurnBanner(isMyTurn);
    renderMyHand(myHand, isMyTurn, selectedCardId);
    renderOpponentHand(oppHand);
    renderDeck(gs.deck.length);
    renderDiscardPile(gs.discardPile || []);
    renderLog(gs.log);

    // ===== ゲーム終了 =====
    if (gs.status === "finished") {
      closeAllModals();
      if (unsubscribe) unsubscribe();
      setTimeout(() => showResultOverlay(gs, currentUser.uid), 800);
      return;
    }

    // ===== 占師：手札確認モーダル =====
    if (gs.revealed && gs.revealed.forUid === currentUser.uid) {
      const rc = getCardById(gs.revealed.cardId);
      revealCardDisp.innerHTML = `
        <div class="card-display">
          <span class="card-emoji">${rc?.emoji}</span>
          <span class="card-name">${rc?.name}</span>
          <span class="card-value">${rc?.value}</span>
        </div>`;
      revealModal.classList.remove("hidden");
    }

        // ===== 賢者：自分のターン開始時に3枚引く =====
    if (isMyTurn && gs.sageActive?.[currentUser.uid]) {
      if (!gs.sageChoices) {
        // まだ3枚引いていない → 3枚引いてFirestoreに保存
        if (!isProcessing) await drawSageCards(gs);
      } else {
        // 3枚引き済み → 選択モーダルを表示
        showSageModal(gs.sageChoices);
        actionArea.classList.add("hidden");
      }
      return;
    }

    // ===== 死神：捨て札選択モーダル（自分が対象の場合）=====
    if (gs.deathPending?.targetUid === currentUser.uid) {
      showDiscardModal(myHand, false, gs.deathPending.nextTurnUid);
      actionArea.classList.add("hidden");
      return;
    }

    // ===== 皇帝・少年：捨て札選択モーダル（自分が対象の場合）=====
    if (gs.emperorPending?.targetUid === currentUser.uid) {
      showDiscardModal(myHand, true, gs.emperorPending.nextTurnUid);
      actionArea.classList.add("hidden");
      return;
    }

    // ===== 自分のターン処理 =====
    if (isMyTurn) {
      // 手札が1枚 → まず山札から1枚引く
      if (myHand.length === 1) {
        if (gs.deck.length > 0) {
          if (!isProcessing) await drawCard(gs);
        } else {
          // 山札なし → デッキ切れチェック
          const newGs = JSON.parse(JSON.stringify(gs));
          checkDeckEmpty(newGs);
          if (newGs.status === "finished") {
            await updateDoc(doc(db, "rooms", roomId), { gameState: newGs });
          }
        }
        return;
      }
      // 手札が2枚 → プレイ選択
      if (myHand.length === 2) {
        actionArea.classList.remove("hidden");
        updatePlayBtn();
      }
    } else {
      // 相手のターン
      actionArea.classList.add("hidden");
      selectedCardId = null;
      updatePlayBtn();
    }
  });
}

// ===== 山札から1枚引く =====
async function drawCard(gs) {
  isProcessing = true;
  const newGs = JSON.parse(JSON.stringify(gs));
  newGs.hands[currentUser.uid].push(newGs.deck.pop());
  await updateDoc(doc(db, "rooms", roomId), { gameState: newGs });
  isProcessing = false;
}
// ===== 賢者：山札から3枚引いてsageChoicesに保存 =====
async function drawSageCards(gs) {
  isProcessing = true;
  const newGs  = JSON.parse(JSON.stringify(gs));
  const count  = Math.min(3, newGs.deck.length);
  const choices = [];
  for (let i = 0; i < count; i++) {
    choices.push(newGs.deck.pop());
  }
  newGs.sageChoices = choices;
  await updateDoc(doc(db, "rooms", roomId), { gameState: newGs });
  isProcessing = false;
}

// ===== 手札カードをクリック =====
document.getElementById("myCards").addEventListener("click", (e) => {
  const cardEl = e.target.closest(".game-card");
  if (!cardEl || !currentGameState) return;

  const gs       = currentGameState;
  const isMyTurn = gs.currentTurn === currentUser.uid;
  const myHand   = gs.hands[currentUser.uid] || [];

  if (!isMyTurn || myHand.length < 2) return;

  const cid = Number(cardEl.dataset.cardId);
  if (cid === 10) {
    alert("🦸 英雄は自分からプレイできません！");
    return;
  }

  selectedCardId = cid;
  renderMyHand(myHand, true, selectedCardId);
  updatePlayBtn();
});

// ===== プレイボタン更新 =====
function updatePlayBtn() {
  if (selectedCardId) {
    const card            = getCardById(selectedCardId);
    playCardBtn.disabled  = false;
    playCardBtn.textContent = `「${card?.name}」をプレイする`;
  } else {
    playCardBtn.disabled  = true;
    playCardBtn.textContent = "カードを選択してください";
  }
}

// ===== プレイボタン =====
playCardBtn.addEventListener("click", () => {
  if (!selectedCardId || isProcessing) return;
  // 兵士（2）→ 宣言モーダル
  if (selectedCardId === 2) {
    showGuessModal();
  } else {
    executePlayCard(selectedCardId);
  }
});

// ===== カードをプレイ実行 =====
async function executePlayCard(cardId, guessId = null) {
  if (!currentUser || !opponentUid || !currentGameState || isProcessing) return;
  isProcessing = true;
  playCardBtn.disabled = true;
  actionArea.classList.add("hidden");
  selectedCardId = null;
  try {
    await playCard(
      roomId, currentGameState,
      currentUser.uid, opponentUid,
      cardId, guessId
    );
  } catch (err) {
    console.error("プレイエラー:", err);
    actionArea.classList.remove("hidden");
    playCardBtn.disabled = false;
  } finally {
    isProcessing = false;
  }
}

// ===== 兵士：宣言モーダル =====
function showGuessModal() {
  guessCardsEl.innerHTML = "";
  getGuessableCards().forEach(card => {
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
function showDiscardModal(handCardIds, isEmperorEffect, nextTurnUid) {
  discardTitle.textContent = isEmperorEffect
    ? "👑 手札を公開。1枚を選んで捨てる（英雄は転生不可）"
    : "💀 手札から1枚を選んで捨てる（英雄なら転生可）";

  discardCardsEl.innerHTML = "";
  // 既にモーダルが開いていたら再描画しない
  if (!discardModal.classList.contains("hidden")) return;

  handCardIds.forEach(id => {
    const card = getCardById(id);
    if (!card) return;
    const btn     = document.createElement("button");
    btn.className = "guess-card-btn";
    btn.innerHTML = `<span>${card.emoji}</span><span>${card.name}</span><span class="card-val">${card.value}</span>`;
    btn.addEventListener("click", async () => {
      if (isProcessing) return;
      isProcessing = true;
      discardModal.classList.add("hidden");
      try {
        await resolveDiscard(
          roomId, currentGameState,
          currentUser.uid,  // 捨てる人
          nextTurnUid,      // 次のターンのプレイヤー
          id,
          isEmperorEffect
        );
      } finally {
        isProcessing = false;
      }
    });
    discardCardsEl.appendChild(btn);
  });
  discardModal.classList.remove("hidden");
}

// ===== 賢者：選択モーダル =====
function showSageModal(choices) {
  // 既にモーダルが開いていたら再描画しない
  if (!sageModal.classList.contains("hidden")) return;
  sageCardsEl.innerHTML = "";
  choices.forEach(id => {
    const card = getCardById(id);
    if (!card) return;
    const btn     = document.createElement("button");
    btn.className = "guess-card-btn";
    btn.innerHTML = `<span>${card.emoji}</span><span>${card.name}</span><span class="card-val">${card.value}</span>`;
    btn.addEventListener("click", async () => {
      if (isProcessing) return;
      isProcessing = true;
      sageModal.classList.add("hidden");
      try {
        await resolveSageChoice(
        roomId, currentGameState,
        currentUser.uid, id  // opponentUid不要・削除
      );
      } finally {
        isProcessing = false;
      }
    });
    sageCardsEl.appendChild(btn);
  });
  sageModal.classList.remove("hidden");
}

// ===== 占師：閉じる =====
closeRevealBtn.addEventListener("click", async () => {
  revealModal.classList.add("hidden");
  await updateDoc(doc(db, "rooms", roomId), { "gameState.revealed": null });
});

// ===== 全モーダルを閉じる =====
function closeAllModals() {
  [guessModal, revealModal, discardModal, sageModal]
    .forEach(m => m.classList.add("hidden"));
}

// ===== ロビーに戻る =====
returnLobbyBtn.addEventListener("click", () => {
  if (unsubscribe) unsubscribe();
  localStorage.removeItem("roomId");
  localStorage.removeItem("isHost");
  window.location.href = "lobby.html";
});
