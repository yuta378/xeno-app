// ===================================================
// gameLogic.js - 公式XENOゲームロジック
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

  const deck = shuffleDeck(createDeck());

  // 各プレイヤーに1枚ずつ配る
  const hand0 = deck.pop();
  const hand1 = deck.pop();

  // 転生札（裏向きで1枚除外）
  const reincarnationCard = deck.pop().id;

  const gameState = {
    deck               : deck.map(c => c.id),

    // 転生札（英雄の転生時に使用）
    reincarnationCard  : reincarnationCard,

    // 各プレイヤーの手札
    hands : {
      [playerUids[0]] : [hand0.id],
      [playerUids[1]] : [hand1.id]
    },

    // 捨て札（公開）
    discardPile : [],

    // 現在のターンのUID（ホストが先攻）
    currentTurn  : playerUids[0],
    turnNumber   : 1,
    status       : "playing",
    winner       : null,
    endReason    : null,

    // 乙女の保護状態
    protected : {
      [playerUids[0]] : false,
      [playerUids[1]] : false
    },

    // 脱落状態
    eliminated : {
      [playerUids[0]] : false,
      [playerUids[1]] : false
    },

    // 少年の革命フラグ（1枚目が捨て札にあるか）
    boyPlayed : false,

    // 賢者フラグ（次ターンに3枚引く）
    sageActive : {
      [playerUids[0]] : false,
      [playerUids[1]] : false
    },

    // 賢者の待機状態（即時発動用）
    sagePending : null,

    // 賢者の選択肢（一時保存）
    sageChoices : null,

    // 英雄の転生フラグ（1回のみ）
    heroRevived : {
      [playerUids[0]] : false,
      [playerUids[1]] : false
    },

    // 死神フラグ（相手が捨て札を選ぶ待機中）
    deathPending : null,

    // 皇帝・少年フラグ（相手が捨て札を選ぶ待機中）
    emperorPending : null,

    // 占師で見た手札（一時的に表示）
    revealed : null,

    // ゲームログ
    log : []
  };

  const roomRef = doc(db, "rooms", roomId);
  await updateDoc(roomRef, { gameState, status: "playing" });
}

// ===================================================
// カードをプレイする
// ===================================================
export async function playCard(
  roomId,
  gameState,
  actingUid,
  opponentUid,
  playedCardId,
  guessCardId = null
) {
  const gs         = JSON.parse(JSON.stringify(gameState));
  const playedCard = getCardById(playedCardId);

  // 手札からプレイしたカードを除く
  gs.hands[actingUid] = gs.hands[actingUid].filter(id => id !== Number(playedCardId));

  // 捨て札に追加
  gs.discardPile.push(Number(playedCardId));

  const actingCardId      = gs.hands[actingUid][0];
  const actingCard        = getCardById(actingCardId);
  const opponentCardId    = gs.hands[opponentUid]?.[0];
  const opponentCard      = getCardById(opponentCardId);
  const opponentProtected = gs.protected[opponentUid];

  let logText  = "";
  let gameOver = false;

  switch (Number(playedCardId)) {

    // ── 1: 少年（革命）─────────────────────────────
    case 1: {
      const prevBoyPlayed = gs.boyPlayed;
      if (!prevBoyPlayed) {
        // 1枚目：効果なし・フラグON
        gs.boyPlayed = true;
        logText = `👦 少年：1枚目。効果なし。次に少年が出ると革命発動！`;
      } else {
        // 2枚目：公開処刑（皇帝と同じ効果）
        gs.boyPlayed = false;
        if (opponentProtected) {
          logText = `👦 少年（革命）：相手は乙女に守られています。効果なし。`;
        } else if (gs.deck.length > 0) {
          // 相手に1枚引かせる
          const drawnId = gs.deck.pop();
          gs.hands[opponentUid].push(drawnId);
          // 皇帝と同じ：emperorPendingをセット
          gs.emperorPending = {
            targetUid  : opponentUid,
            actingUid  : actingUid,
            isBoy      : true
          };
          logText = `👦 少年（革命）：相手に1枚引かせた。相手は手札から1枚を捨てる。`;
        } else {
          logText = `👦 少年（革命）：山札が空のため効果なし。`;
        }
      }
      break;
    }

    // ── 2: 兵士（捜査）─────────────────────────────
    case 2: {
      if (opponentProtected) {
        logText = `⚔️ 兵士：相手は乙女に守られています。効果なし。`;
      } else if (Number(guessCardId) === Number(opponentCardId)) {
        // 英雄を持っている場合→転生チェック
        if (Number(opponentCardId) === 10 && !gs.heroRevived[opponentUid]) {
          // 転生発動
          gs.heroRevived[opponentUid] = true;
          const reviveCardId          = gs.reincarnationCard;
          gs.hands[opponentUid]       = [reviveCardId];
          gs.reincarnationCard        = null;
          logText = `⚔️ 兵士：大正解！しかし相手の英雄が転生！転生札(${getCardById(reviveCardId)?.name})で復活！`;
        } else {
          gs.eliminated[opponentUid] = true;
          gameOver = true;
          logText  = `⚔️ 兵士：大正解！相手の手札は「${opponentCard?.name}」。相手が脱落！`;
        }
      } else {
        const guessedCard = getCardById(guessCardId);
        logText = `⚔️ 兵士：はずれ。（宣言：${guessedCard?.name ?? "不明"}）効果なし。`;
      }
      break;
    }

    // ── 3: 占師（透視）─────────────────────────────
    case 3: {
      if (opponentProtected) {
        logText    = `🔮 占師：相手は乙女に守られています。効果なし。`;
        gs.revealed = null;
      } else {
        gs.revealed = { uid: actingUid, cardId: opponentCardId };
        logText     = `🔮 占師：相手の手札を確認した。`;
      }
      break;
    }

    // ── 4: 乙女（守護）─────────────────────────────
    case 4: {
      gs.protected[actingUid] = true;
      logText = `👸 乙女：次の自分のターンまで効果を無効化！`;
      break;
    }

    // ── 5: 死神（疫病）─────────────────────────────
    case 5: {
      if (opponentProtected) {
        logText = `💀 死神：相手は乙女に守られています。効果なし。`;
      } else if (gs.deck.length > 0) {
        // 相手に1枚引かせる
        const drawnId = gs.deck.pop();
        gs.hands[opponentUid].push(drawnId);
        // deathPendingをセット（相手が2枚から1枚捨てる）
        gs.deathPending = {
          targetUid : opponentUid,
          actingUid : actingUid
        };
        logText = `💀 死神：相手に1枚引かせた。相手は2枚の手札から1枚を捨てる。`;
      } else {
        logText = `💀 死神：山札が空のため効果なし。`;
      }
      break;
    }

    // ── 6: 貴族（対決）─────────────────────────────
    case 6: {
      if (opponentProtected) {
        logText = `🏅 貴族：相手は乙女に守られています。効果なし。`;
      } else {
        const actV = actingCard?.value  ?? 0;
        const oppV = opponentCard?.value ?? 0;
        if (actV > oppV) {
          // 英雄転生チェック
          if (Number(opponentCardId) === 10 && !gs.heroRevived[opponentUid]) {
            gs.heroRevived[opponentUid] = true;
            const revId                 = gs.reincarnationCard;
            gs.hands[opponentUid]       = [revId];
            gs.reincarnationCard        = null;
            logText = `🏅 貴族：自分(${actingCard?.name} ${actV}) > 相手(${opponentCard?.name} ${oppV})。相手の英雄が転生！`;
          } else {
            gs.eliminated[opponentUid] = true;
            gameOver = true;
            logText  = `🏅 貴族：自分(${actingCard?.name} ${actV}) > 相手(${opponentCard?.name} ${oppV})。相手が脱落！`;
          }
        } else if (actV < oppV) {
          // 自分の英雄転生チェック
          if (Number(actingCardId) === 10 && !gs.heroRevived[actingUid]) {
            gs.heroRevived[actingUid] = true;
            const revId               = gs.reincarnationCard;
            gs.hands[actingUid]       = [revId];
            gs.reincarnationCard      = null;
            logText = `🏅 貴族：自分(${actingCard?.name} ${actV}) < 相手(${opponentCard?.name} ${oppV})。自分の英雄が転生！`;
          } else {
            gs.eliminated[actingUid] = true;
            gameOver = true;
            logText  = `🏅 貴族：自分(${actingCard?.name} ${actV}) < 相手(${opponentCard?.name} ${oppV})。自分が脱落！`;
          }
        } else {
          logText = `🏅 貴族：同値(${actV})。引き分け。効果なし。`;
        }
      }
      break;
    }

    // ── 7: 賢者（選択）─────────────────────────────
      // ── 7: 賢者（選択）─────────────────────────────
    case 7: {
      const drawCount = Math.min(3, gs.deck.length);
      if (drawCount > 0) {
        const choices = [];
        for (let i = 0; i < drawCount; i++) {
          choices.push(gs.deck.pop());
        }
        gs.sageChoices = choices;
        gs.sagePending = { actingUid: actingUid };
        logText = `🧙 賢者：山札から${drawCount}枚引いた。1枚を選んでください！`;
      } else {
        logText = `🧙 賢者：山札が空のため効果なし。`;
      }
      break;
    }

    // ── 8: 精霊（交換）─────────────────────────────
    case 8: {
      if (opponentProtected) {
        logText = `✨ 精霊：相手は乙女に守られています。効果なし。`;
      } else {
        const tmpHand            = [...gs.hands[actingUid]];
        gs.hands[actingUid]      = [...gs.hands[opponentUid]];
        gs.hands[opponentUid]    = tmpHand;
        logText = `✨ 精霊：相手と手札を交換した！`;
      }
      break;
    }

    // ── 9: 皇帝（公開処刑）─────────────────────────
    case 9: {
      if (opponentProtected) {
        logText = `👑 皇帝：相手は乙女に守られています。効果なし。`;
      } else if (gs.deck.length > 0) {
        // 相手に1枚引かせる（転生不可なので英雄でも転生なし）
        const drawnId = gs.deck.pop();
        gs.hands[opponentUid].push(drawnId);
        gs.emperorPending = {
          targetUid : opponentUid,
          actingUid : actingUid,
          isBoy     : false
        };
        logText = `👑 皇帝：相手に1枚引かせた。相手は手札を公開して1枚を捨てる。`;
      } else {
        logText = `👑 皇帝：山札が空のため効果なし。`;
      }
      break;
    }

    // ── 10: 英雄（場に出せない）────────────────────
    case 10: {
      // 英雄は自発的にプレイできない
      // 強制的に手札に戻す
      gs.hands[actingUid].push(Number(playedCardId));
      gs.discardPile.pop();
      logText = `🦸 英雄：英雄は自分からプレイできません！`;
      break;
    }

    default:
      logText = `不明なカードが使われました。`;
  }

  // ===== ゲームログに追加 =====
  gs.log.push({ turn: gs.turnNumber, text: logText });

  // ===== ゲーム終了チェック =====
  if (gameOver) {
    const winner  = Object.keys(gs.eliminated).find(uid => !gs.eliminated[uid]);
    gs.status     = "finished";
    gs.winner     = winner;
    gs.endReason  = "eliminated";
  } else if (
    !gs.deathPending &&
    !gs.emperorPending &&
    gs.deck.length === 0 &&
    Number(playedCardId) !== 7
  ) {
    resolveDecEmpty(gs);
  } else if (!gs.deathPending && !gs.emperorPending) {
    // ターン交代
    nextTurn(gs, actingUid, opponentUid);
  }

  const roomRef = doc(db, "rooms", roomId);
  await updateDoc(roomRef, { gameState: gs });
  return gs;
}

// ===================================================
// 死神・皇帝/少年の「捨てるカードを選ぶ」処理
// ===================================================
export async function resolveDiscard(roomId, gameState, actingUid, opponentUid, discardCardId, isEmperorEffect) {
  const gs = JSON.parse(JSON.stringify(gameState));

  // 選んだカードを手札から捨てる
  gs.hands[actingUid] = gs.hands[actingUid].filter(id => id !== Number(discardCardId));
  gs.discardPile.push(Number(discardCardId));

  let logText = "";

  if (isEmperorEffect) {
    // 皇帝・少年の効果：英雄は転生不可
    if (Number(discardCardId) === 10) {
      gs.eliminated[actingUid] = true;
      gs.status                = "finished";
      gs.winner                = opponentUid;
      gs.endReason             = "eliminated";
      logText = `👑 皇帝効果：相手が英雄を捨てた。英雄は転生不可！相手が脱落！`;
    } else {
      logText = `👑 皇帝効果：相手が「${getCardById(discardCardId)?.name}」を捨てた。`;
    }
    gs.emperorPending = null;
  } else {
    // 死神の効果：英雄は転生可能
    if (Number(discardCardId) === 10 && !gs.heroRevived[actingUid]) {
      gs.heroRevived[actingUid] = true;
      const revId               = gs.reincarnationCard;
      gs.hands[actingUid]       = [revId];
      gs.reincarnationCard      = null;
      logText = `💀 死神効果：相手が英雄を捨てた。英雄が転生！転生札(${getCardById(revId)?.name})で復活！`;
    } else if (Number(discardCardId) === 10 && gs.heroRevived[actingUid]) {
      gs.eliminated[actingUid] = true;
      gs.status                = "finished";
      gs.winner                = opponentUid;
      gs.endReason             = "eliminated";
      logText = `💀 死神効果：相手が英雄を捨てた。転生済みのため脱落！`;
    } else {
      logText = `💀 死神効果：相手が「${getCardById(discardCardId)?.name}」を捨てた。`;
    }
    gs.deathPending = null;
  }

  gs.log.push({ turn: gs.turnNumber, text: logText });

  // ゲーム終了していなければターン交代
  if (gs.status !== "finished") {
    const originalActing   = isEmperorEffect
      ? gs.emperorPending?.actingUid ?? opponentUid
      : gs.deathPending?.actingUid   ?? opponentUid;
    nextTurn(gs, opponentUid, actingUid);
  }

  if (gs.deck.length === 0 && gs.status !== "finished") {
    resolveDecEmpty(gs);
  }

  const roomRef = doc(db, "rooms", roomId);
  await updateDoc(roomRef, { gameState: gs });
  return gs;
}

// ===================================================
// 賢者の選択処理（3枚から1枚を選ぶ）
// ===================================================
export async function resolveSageChoice(roomId, gameState, actingUid, opponentUid, chosenCardId) {
  const gs = JSON.parse(JSON.stringify(gameState));

  const choices        = gs.sageChoices || [];
  gs.hands[actingUid]  = [Number(chosenCardId)];

  // 選ばなかったカードを山札に戻す（末尾に）
  const returned = choices.filter(id => id !== Number(chosenCardId));
  gs.deck.unshift(...returned);

  gs.sageChoices       = null;
  gs.sageActive[actingUid] = false;

  gs.log.push({
    turn : gs.turnNumber,
    text : `🧙 賢者：${getCardById(chosenCardId)?.name}を選んだ。`
  });

  // ターン交代
  nextTurn(gs, actingUid, opponentUid);

  if (gs.deck.length === 0 && gs.status !== "finished") {
    resolveDecEmpty(gs);
  }

  const roomRef = doc(db, "rooms", roomId);
  await updateDoc(roomRef, { gameState: gs });
  return gs;
}

// ===================================================
// ターン交代の共通処理
// ===================================================
function nextTurn(gs, actingUid, opponentUid) {
  gs.turnNumber++;
  gs.currentTurn = opponentUid;

  // 乙女の保護は自分のターン開始時に解除
  gs.protected[opponentUid] = false;
}

// ===================================================
// デッキ切れによるゲーム終了
// ===================================================
function resolveDecEmpty(gs) {
  const uids = Object.keys(gs.hands);
  const val0 = getCardById(gs.hands[uids[0]]?.[0])?.value ?? 0;
  const val1 = getCardById(gs.hands[uids[1]]?.[0])?.value ?? 0;

  if (val0 > val1)      gs.winner = uids[0];
  else if (val1 > val0) gs.winner = uids[1];
  else                  gs.winner = "draw";

  gs.status    = "finished";
  gs.endReason = "deckEmpty";
  gs.log.push({
    turn : gs.turnNumber,
    text : `📦 デッキ切れ！手札比較で勝敗決定。`
  });
}
