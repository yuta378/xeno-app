// ===================================================
// gameLogic.js - ゲームの状態管理とカード効果処理
// ===================================================

import { db } from "./firebase-config.js";
import {
  doc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { createDeck, shuffleDeck, getCardById } from "./deck.js";

// ===================================================
// ゲームを初期化する（ホストのみ実行）
// ===================================================
export async function initializeGame(roomId, playerUids) {

  // デッキ生成・シャッフル
  const deck = shuffleDeck(createDeck());

  // 各プレイヤーに1枚ずつ配る
  const hand0 = deck.pop();
  const hand1 = deck.pop();

  // 3枚を表向きで除外（公開カード）
  const openCards = [deck.pop().id, deck.pop().id, deck.pop().id];

  // 1枚を裏向きで除外（非公開カード）
  const hiddenCard = deck.pop().id;

  const gameState = {
    // デッキ（残りのカードIDの配列）
    deck         : deck.map(c => c.id),

    // 公開・非公開カード
    openCards    : openCards,
    hiddenCard   : hiddenCard,

    // 各プレイヤーの手札（カードIDの配列）
    hands        : {
      [playerUids[0]] : [hand0.id],
      [playerUids[1]] : [hand1.id]
    },

    // 現在のターンのプレイヤーUID（ホストが先攻）
    currentTurn  : playerUids[0],

    // ターン数
    turnNumber   : 1,

    // ゲームの状態（playing / finished）
    status       : "playing",

    // 勝者のUID（finishedになったら設定）
    winner       : null,

    // 終了理由（eliminated / deckEmpty）
    endReason    : null,

    // 法王の保護状態
    protected    : {
      [playerUids[0]] : false,
      [playerUids[1]] : false
    },

    // 脱落状態
    eliminated   : {
      [playerUids[0]] : false,
      [playerUids[1]] : false
    },

    // ゲームログ
    log          : [],

    // 占師で見た相手の手札（一時的に表示するため）
    revealed     : null
  };

  const roomRef = doc(db, "rooms", roomId);
  await updateDoc(roomRef, { gameState, status: "playing" });
}

// ===================================================
// カードをプレイする（カード効果を処理してFirestoreを更新）
// ===================================================
export async function playCard(
  roomId,
  gameState,
  actingUid,
  opponentUid,
  playedCardId,
  guessCardId = null
) {
  // ゲーム状態をコピー（直接変更しない）
  const gs = JSON.parse(JSON.stringify(gameState));

  const playedCard    = getCardById(playedCardId);
  const opponentCardId = gs.hands[opponentUid][0];
  const opponentCard  = getCardById(opponentCardId);

  // プレイしたカードを手札から除く
  gs.hands[actingUid] = gs.hands[actingUid].filter(id => id !== playedCardId);

  // 残った手札の先頭カード（効果比較用）
  const actingCardId  = gs.hands[actingUid][0];
  const actingCard    = getCardById(actingCardId);

  const opponentProtected = gs.protected[opponentUid];

  let logText   = "";
  let gameOver  = false;

  // ===== カード効果の処理 =====
  switch (Number(playedCardId)) {

    // ── 1: 兵士 ──────────────────────────────
    case 1:
      if (opponentProtected) {
        logText = `⚔️ 兵士：相手は法王に守られています。効果なし。`;
      } else if (Number(guessCardId) === Number(opponentCardId)) {
        gs.eliminated[opponentUid] = true;
        gameOver = true;
        logText  = `⚔️ 兵士：大正解！相手の手札は「${opponentCard.name}」。相手が脱落！`;
      } else {
        const guessedCard = getCardById(guessCardId);
        logText = `⚔️ 兵士：はずれ。（宣言：${guessedCard?.name}）効果なし。`;
      }
      break;

    // ── 2: 占師 ──────────────────────────────
    case 2:
      if (opponentProtected) {
        logText = `🔮 占師：相手は法王に守られています。効果なし。`;
        gs.revealed = null;
      } else {
        gs.revealed = {
          uid    : actingUid,
          cardId : opponentCardId
        };
        logText = `🔮 占師：相手の手札を確認した。`;
      }
      break;

    // ── 3: 乙女 ──────────────────────────────
    case 3:
      // 乙女は持っている間に効果があるカードなので
      // プレイしてしまうと効果なし
      logText = `👸 乙女：手札から出したため効果なし。`;
      break;

    // ── 4: 死神 ──────────────────────────────
    case 4: {
      const actVal = actingCard?.value ?? 0;
      const oppVal = opponentCard?.value ?? 0;
      if (actVal < oppVal) {
        gs.eliminated[actingUid] = true;
        gameOver = true;
        logText = `💀 死神：自分(${actingCard?.name} ${actVal}) < 相手(${opponentCard?.name} ${oppVal})。自分が脱落！`;
      } else if (actVal > oppVal) {
        gs.eliminated[opponentUid] = true;
        gameOver = true;
        logText = `💀 死神：自分(${actingCard?.name} ${actVal}) > 相手(${opponentCard?.name} ${oppVal})。相手が脱落！`;
      } else {
        logText = `💀 死神：同値(${actVal})。引き分け。効果なし。`;
      }
      break;
    }

    // ── 5: 貴族 ──────────────────────────────
    case 5:
      if (opponentProtected) {
        logText = `🏅 貴族：相手は法王に守られています。効果なし。`;
      } else {
        const actV = actingCard?.value ?? 0;
        const oppV = opponentCard?.value ?? 0;
        if (actV > oppV) {
          gs.eliminated[opponentUid] = true;
          gameOver = true;
          logText = `🏅 貴族：自分(${actingCard?.name} ${actV}) > 相手(${opponentCard?.name} ${oppV})。相手が脱落！`;
        } else if (actV < oppV) {
          gs.eliminated[actingUid] = true;
          gameOver = true;
          logText = `🏅 貴族：自分(${actingCard?.name} ${actV}) < 相手(${opponentCard?.name} ${oppV})。自分が脱落！`;
        } else {
          logText = `🏅 貴族：同値(${actV})。引き分け。効果なし。`;
        }
      }
      break;

    // ── 6: 英雄 ──────────────────────────────
    case 6:
      if (opponentProtected) {
        logText = `🦸 英雄：相手は法王に守られています。効果なし。`;
      } else if (gs.deck.length > 0) {
        const newCardId = gs.deck.pop();
        gs.hands[opponentUid] = [newCardId];
        logText = `🦸 英雄：相手の手札を捨てさせ、新しいカードを引かせた。`;
      } else {
        logText = `🦸 英雄：デッキが空のため新しいカードを引けない。効果なし。`;
      }
      break;

    // ── 7: 法王 ──────────────────────────────
    case 7:
      gs.protected[actingUid] = true;
      logText = `⛪ 法王：自分の手札をこのターン守った。`;
      break;

    // ── 8: 皇帝 ──────────────────────────────
    case 8:
      if (opponentProtected) {
        logText = `👑 皇帝：相手は法王に守られています。効果なし。`;
      } else {
        const tmpHand            = gs.hands[actingUid];
        gs.hands[actingUid]      = gs.hands[opponentUid];
        gs.hands[opponentUid]    = tmpHand;
        logText = `👑 皇帝：相手と手札を交換した！`;
      }
      break;

    default:
      logText = `不明なカードが使われました。`;
  }

  // ===== ゲームログに追加 =====
  gs.log.push({
    turn : gs.turnNumber,
    text : logText
  });

  // ===== ゲーム終了チェック =====
  if (gameOver) {
    // 脱落による終了
    const winner = Object.keys(gs.eliminated).find(uid => !gs.eliminated[uid]);
    gs.status    = "finished";
    gs.winner    = winner;
    gs.endReason = "eliminated";

  } else if (gs.deck.length === 0) {
    // デッキ切れによる終了 → 手札の数字が高い方が勝ち
    const uids = Object.keys(gs.hands);
    const val0 = getCardById(gs.hands[uids[0]][0])?.value ?? 0;
    const val1 = getCardById(gs.hands[uids[1]][0])?.value ?? 0;

    if (val0 > val1) {
      gs.winner = uids[0];
    } else if (val1 > val0) {
      gs.winner = uids[1];
    } else {
      gs.winner = "draw";
    }
    gs.status    = "finished";
    gs.endReason = "deckEmpty";

    gs.log.push({
      turn : gs.turnNumber,
      text : `📦 デッキが空になりました。手札比較で勝敗を決定！`
    });

  } else {
    // ===== ターン交代 =====
    gs.turnNumber++;
    gs.currentTurn = opponentUid;

    // 法王の保護を解除（プレイヤー自身の保護は次のターンに引き継がない）
    gs.protected[actingUid] = false;

    // 次のプレイヤーがカードを1枚引く
    if (gs.deck.length > 0) {
      const drawnCardId = gs.deck.pop();
      gs.hands[opponentUid].push(drawnCardId);
    }
  }

  // ===== Firestoreを更新 =====
  const roomRef = doc(db, "rooms", roomId);
  await updateDoc(roomRef, { gameState: gs });

  return gs;
}

// ===================================================
// 乙女を手札に持っているか判定（相手の効果を受けるか）
// ===================================================
export function hasMaiden(hands, uid) {
  return (hands[uid] || []).includes(3);
}