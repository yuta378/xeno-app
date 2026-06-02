// ===================================================
// ui.js - 画面描画・UI更新処理
// ===================================================
import { getCardById } from "./deck.js";

// ===== DOM要素 =====
const turnBannerEl    = document.getElementById("turnBanner");
const myCardsEl       = document.getElementById("myCards");
const opponentCardsEl = document.getElementById("opponentCards");
const deckCountEl     = document.getElementById("deckCount");
const openCardsEl     = document.getElementById("openCards");
const gameLogEl       = document.getElementById("gameLog");
const resultOverlay   = document.getElementById("resultOverlay");
const resultIcon      = document.getElementById("resultIcon");
const resultTitle     = document.getElementById("resultTitle");
const resultReason    = document.getElementById("resultReason");
const resultCardsEl   = document.getElementById("resultCards");

// ===== ターンバナーを更新 =====
export function updateTurnBanner(isMyTurn) {
  turnBannerEl.textContent = isMyTurn ? "⚡ あなたのターン" : "⏳ 相手のターン";
  turnBannerEl.className   = `turn-banner ${isMyTurn ? "my-turn" : "opponent-turn"}`;
}

// ===== 自分の手札を描画 =====
export function renderMyHand(cardIds, isMyTurn, selectedCardId) {
  myCardsEl.innerHTML = "";

  cardIds.forEach(id => {
    const card = getCardById(id);
    if (!card) return;

    const el        = document.createElement("div");
    const isSelected = selectedCardId === id;

    el.className    = [
      "game-card",
      "mine",
      isMyTurn   ? "playable"  : "",
      isSelected ? "selected" : ""
    ].join(" ");
    el.dataset.cardId = id;

    el.innerHTML = `
      <div class="card-inner">
        <div class="card-top-value">${card.value}</div>
        <div class="card-emoji-large">${card.emoji}</div>
        <div class="card-name-display">${card.name}</div>
        <div class="card-desc">${card.description}</div>
      </div>
    `;
    myCardsEl.appendChild(el);
  });
}

// ===== 相手の手札を描画（裏面） =====
export function renderOpponentHand(cardIds) {
  opponentCardsEl.innerHTML = "";

  cardIds.forEach(() => {
    const el      = document.createElement("div");
    el.className  = "game-card opponent";
    el.innerHTML  = `
      <div class="card-inner back">
        <div class="card-back-pattern">X<br>E<br>N<br>O</div>
      </div>
    `;
    opponentCardsEl.appendChild(el);
  });

  // 手札がない場合（脱落など）
  if (cardIds.length === 0) {
    const el      = document.createElement("div");
    el.className  = "area-label";
    el.textContent = "（手札なし）";
    opponentCardsEl.appendChild(el);
  }
}

// ===== デッキ枚数を更新 =====
export function renderDeck(count) {
  deckCountEl.textContent = count;
}

// ===== 公開カードを描画 =====
export function renderOpenCards(cardIds) {
  openCardsEl.innerHTML = "";

  cardIds.forEach(id => {
    const card = getCardById(id);
    if (!card) return;

    const el      = document.createElement("div");
    el.className  = "game-card-small";
    el.innerHTML  = `
      <span>${card.emoji}</span>
      <span>${card.name}</span>
      <span class="small-val">${card.value}</span>
    `;
    openCardsEl.appendChild(el);
  });
}

// ===== ゲームログを描画 =====
export function renderLog(logs) {
  gameLogEl.innerHTML = "";

  // 最新のログを上に表示
  [...logs].reverse().forEach(entry => {
    const el      = document.createElement("div");
    el.className  = "log-entry";
    el.innerHTML  = `
      <span class="log-turn">T${entry.turn}</span>
      <span>${entry.text}</span>
    `;
    gameLogEl.appendChild(el);
  });
}

// ===== 結果オーバーレイを表示 =====
export function showResultOverlay(gs, myUid) {
  const isWin  = gs.winner === myUid;
  const isDraw = gs.winner === "draw";

  // アイコン・タイトル
  resultIcon.textContent  = isDraw ? "🤝" : isWin ? "🎉" : "💔";
  resultTitle.textContent = isDraw ? "引き分け！" : isWin ? "あなたの勝ち！" : "あなたの負け...";
  resultTitle.className   = `result-title ${isDraw ? "" : isWin ? "win" : "lose"}`;

  // 終了理由
  if (gs.endReason === "eliminated") {
    resultReason.textContent = "💥 脱落による決着";
  } else if (gs.endReason === "deckEmpty") {
    resultReason.textContent = "📦 デッキ切れ → 手札比較による決着";
  }

  // 最終手札を表示
  resultCardsEl.innerHTML = `<div class="result-cards-label">最終手札</div>`;

  const uids = Object.keys(gs.hands);
  uids.forEach(uid => {
    const handArr = gs.hands[uid];
    if (!handArr || handArr.length === 0) return;

    const card  = getCardById(handArr[0]);
    if (!card) return;

    const isMe  = uid === myUid;
    const el    = document.createElement("div");
    el.className = `result-hand ${isMe ? "mine" : ""}`;
    el.innerHTML = `
      <div class="result-hand-label">${isMe ? "あなた" : "相手"}</div>
      <div class="result-card-show">
        <span class="card-emoji">${card.emoji}</span>
        <span class="card-name">${card.name}</span>
        <span class="card-value">${card.value}</span>
      </div>
    `;
    resultCardsEl.appendChild(el);
  });

  resultOverlay.classList.remove("hidden");
}