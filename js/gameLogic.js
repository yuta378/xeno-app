// ===================================================
// gameLogic.js - XENOゲームロジック（完全版）
// ===================================================
import { db } from "./firebase-config.js";
import {
  doc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { createDeck, shuffleDeck, getCardById } from "./deck.js";

// ===================================================
// ゲーム初期化（ホストのみ）
// ===================================================
export async function initializeGame(roomId, playerUids) {
  const deck = shuffleDeck(createDeck());

  // 各プレイヤーに1枚配る
  const hand0 = deck.pop().id;
  const hand1 = deck.pop().id;

  // 転生札（裏向き除外・1枚）
  const reincarnationCard = deck.pop().id;

  const p0 = playerUids[0];
  const p1 = playerUids[1];

  const gameState = {
    deck              : deck.map(c => c.id),
    reincarnationCard : reincarnationCard,
    hands             : { [p0]: [hand0], [p1]: [hand1] },
    discardPile       : [],
    currentTurn       : p0,       // ホストが先攻
    turnNumber        : 1,
    status            : "playing",
    winner            : null,
    endReason         : null,

    // 乙女の保護（自分のターン開始時に解除）
    protected : { [p0]: false, [p1]: false },

    // 脱落フラグ
    eliminated : { [p0]: false, [p1]: false },

    // 少年：1枚目が出たかフラグ
    boyPlayed : false,

    // 英雄：転生済みフラグ
    heroRevived : { [p0]: false, [p1]: false },

    // 賢者：即時選択用
    sagePending : null,   // { actingUid }
    sageChoices : null,   // [cardId, ...]

    // 死神：捨て択待ち
    deathPending   : null,  // { targetUid, nextTurnUid }

    // 皇帝・少年革命：捨て択待ち
    emperorPending : null,  // { targetUid, nextTurnUid }

    // 占師：確認表示用
    revealed : null,        // { forUid, cardId }

    log : []
  };

  const roomRef = doc(db, "rooms", roomId);
  await updateDoc(roomRef, { gameState, status: "playing" });
}

// ===================================================
// カードをプレイする（actingUid がカードを出す）
// ===================================================
export async function playCard(
  roomId, gameState,
  actingUid, opponentUid,
  playedCardId, guessCardId = null
) {
  const gs  = deepCopy(gameState);
  const pid = Number(playedCardId);

  // 手札からプレイしたカードを除く
  gs.hands[actingUid] = gs.hands[actingUid].filter(id => id !== pid);
  gs.discardPile.push(pid);

  // 残った自分の手札（効果比較用）
  const myCard  = getCardById(gs.hands[actingUid][0]);
  // 相手の手札
  const oppCard = getCardById(gs.hands[opponentUid]?.[0]);
  const oppId   = gs.hands[opponentUid]?.[0];
  const oppProt = gs.protected[opponentUid];

  let logText  = "";
  let gameOver = false;

  // ===== カード効果 =====
  switch (pid) {

    // ── 少年（1）──────────────────────────────────
    case 1: {
      if (!gs.boyPlayed) {
        gs.boyPlayed = true;
        logText = `👦 少年：1枚目。効果なし。次に少年が出ると革命発動！`;
      } else {
        // 2枚目 → 公開処刑（皇帝と同じ処理）
        gs.boyPlayed = false;
        if (oppProt) {
          logText = `👦 少年（革命）：相手は乙女に守られている。効果なし。`;
        } else if (gs.deck.length > 0) {
          gs.hands[opponentUid].push(gs.deck.pop());
          gs.emperorPending = {
            targetUid   : opponentUid,
            nextTurnUid : opponentUid   // 効果処理後は相手のターン
          };
          logText = `👦 少年（革命）：相手に1枚引かせた。相手は1枚を捨てる。`;
        } else {
          logText = `👦 少年（革命）：山札が空。効果なし。`;
        }
      }
      break;
    }

    // ── 兵士（2）──────────────────────────────────
    case 2: {
      if (oppProt) {
        logText = `⚔️ 兵士：相手は乙女に守られている。効果なし。`;
        break;
      }
      const guessId = Number(guessCardId);
      if (guessId === Number(oppId)) {
        // 英雄なら転生チェック
        if (Number(oppId) === 10 && !gs.heroRevived[opponentUid] && gs.reincarnationCard !== null) {
          const revId               = gs.reincarnationCard;
          gs.hands[opponentUid]     = [revId];
          gs.reincarnationCard      = null;
          gs.heroRevived[opponentUid] = true;
          logText = `⚔️ 兵士：正解！だが英雄が転生！${getCardById(revId)?.name}で復活。`;
        } else {
          gs.eliminated[opponentUid] = true;
          gameOver = true;
          logText  = `⚔️ 兵士：正解！相手の手札は「${oppCard?.name}」。相手脱落！`;
        }
      } else {
        logText = `⚔️ 兵士：はずれ（宣言：${getCardById(guessId)?.name}）。効果なし。`;
      }
      break;
    }

    // ── 占師（3）──────────────────────────────────
    case 3: {
      if (oppProt) {
        logText = `🔮 占師：相手は乙女に守られている。効果なし。`;
      } else {
        gs.revealed = { forUid: actingUid, cardId: oppId };
        logText     = `🔮 占師：相手の手札を確認した。`;
      }
      break;
    }

    // ── 乙女（4）──────────────────────────────────
    case 4: {
      gs.protected[actingUid] = true;
      logText = `👸 乙女：次の自分のターンまで効果を無効化！`;
      break;
    }

    // ── 死神（5）──────────────────────────────────
    case 5: {
      if (oppProt) {
        logText = `💀 死神：相手は乙女に守られている。効果なし。`;
      } else if (gs.deck.length > 0) {
        gs.hands[opponentUid].push(gs.deck.pop());
        gs.deathPending = {
          targetUid   : opponentUid,
          nextTurnUid : opponentUid   // 効果処理後は相手のターン
        };
        logText = `💀 死神：相手に1枚引かせた。相手は1枚を捨てる。`;
      } else {
        logText = `💀 死神：山札が空。効果なし。`;
      }
      break;
    }

    // ── 貴族（6）──────────────────────────────────
    case 6: {
      if (oppProt) {
        logText = `🏅 貴族：相手は乙女に守られている。効果なし。`;
        break;
      }
      const av = myCard?.value  ?? 0;
      const ov = oppCard?.value ?? 0;
      if (av === ov) {
        logText = `🏅 貴族：同値（${av}）。引き分け。効果なし。`;
      } else {
        const loserUid  = av < ov ? actingUid  : opponentUid;
        const loserCard = av < ov ? myCard      : oppCard;
        const winCard   = av < ov ? oppCard     : myCard;
        // 敗者が英雄なら転生チェック
        if (loserCard?.id === 10 && !gs.heroRevived[loserUid] && gs.reincarnationCard !== null) {
          const revId           = gs.reincarnationCard;
          gs.hands[loserUid]    = [revId];
          gs.reincarnationCard  = null;
          gs.heroRevived[loserUid] = true;
          logText = `🏅 貴族：${loserCard.name}(${av < ov ? av : ov}) < ${winCard.name}(${av < ov ? ov : av})。英雄が転生！${getCardById(revId)?.name}で復活。`;
        } else {
          gs.eliminated[loserUid] = true;
          gameOver = true;
          logText = `🏅 貴族：${loserCard?.name}(${av < ov ? av : ov}) < ${winCard?.name}(${av < ov ? ov : av})。${loserUid === actingUid ? "自分" : "相手"}が脱落！`;
        }
      }
      break;
    }

    // ── 賢者（7）──────────────────────────────────
    case 7: {
      const count = Math.min(3, gs.deck.length);
      if (count > 0) {
        const choices = [];
        for (let i = 0; i < count; i++) choices.push(gs.deck.pop());
        gs.sageChoices = choices;
        gs.sagePending = { actingUid };
        logText = `🧙 賢者：山札から${count}枚引いた。1枚を選ぶ！`;
      } else {
        logText = `🧙 賢者：山札が空。効果なし。`;
      }
      break;
    }

    // ── 精霊（8）──────────────────────────────────
    case 8: {
      if (oppProt) {
        logText = `✨ 精霊：相手は乙女に守られている。効果なし。`;
      } else {
        const tmp             = [...gs.hands[actingUid]];
        gs.hands[actingUid]   = [...gs.hands[opponentUid]];
        gs.hands[opponentUid] = tmp;
        logText = `✨ 精霊：相手と手札を交換した！`;
      }
      break;
    }

    // ── 皇帝（9）──────────────────────────────────
    case 9: {
      if (oppProt) {
        logText = `👑 皇帝：相手は乙女に守られている。効果なし。`;
      } else if (gs.deck.length > 0) {
        gs.hands[opponentUid].push(gs.deck.pop());
        gs.emperorPending = {
          targetUid   : opponentUid,
          nextTurnUid : opponentUid
        };
        logText = `👑 皇帝：相手に1枚引かせた。相手は手札を公開して1枚捨てる。`;
      } else {
        logText = `👑 皇帝：山札が空。効果なし。`;
      }
      break;
    }

    // ── 英雄（10）：出せない ───────────────────────
    case 10: {
      gs.hands[actingUid].push(pid);
      gs.discardPile.pop();
      logText = `🦸 英雄：自分からプレイできません！`;
      break;
    }

    default:
      logText = `不明なカード(${pid})が使われた。`;
  }

  gs.log.push({ turn: gs.turnNumber, text: logText });

  // ===== 終了・継続判定 =====
  if (gameOver) {
    finishGame(gs, opponentUid);

  } else if (gs.deathPending || gs.emperorPending || gs.sagePending) {
    // ペンディング中はターン交代しない（待機）

  } else {
    // 通常のターン交代
    doNextTurn(gs, actingUid, opponentUid);
  }

  await saveGameState(roomId, gs);
  return gs;
}

// ===================================================
// 死神・皇帝/少年 → 捨て札選択の解決
// ===================================================
export async function resolveDiscard(
  roomId, gameState,
  chooserUid,      // 捨て札を選ぶプレイヤー
  nextTurnUid,     // 次にターンが来るプレイヤー
  discardCardId,
  isEmperorEffect
) {
  const gs  = deepCopy(gameState);
  const cid = Number(discardCardId);

  // 選んだカードを手札から捨てる
  gs.hands[chooserUid] = gs.hands[chooserUid].filter(id => id !== cid);
  gs.discardPile.push(cid);

  let logText  = "";
  let gameOver = false;

  if (isEmperorEffect) {
    // 皇帝・少年革命：英雄でも転生不可
    if (cid === 10) {
      gs.eliminated[chooserUid] = true;
      gameOver = true;
      logText  = `👑 皇帝効果：英雄を捨てた。転生不可！脱落！`;
    } else {
      logText = `👑 皇帝効果：「${getCardById(cid)?.name}」を捨てた。`;
    }
    gs.emperorPending = null;
  } else {
    // 死神：英雄なら転生可
    if (cid === 10 && !gs.heroRevived[chooserUid] && gs.reincarnationCard !== null) {
      const revId           = gs.reincarnationCard;
      gs.hands[chooserUid]  = [revId];
      gs.reincarnationCard  = null;
      gs.heroRevived[chooserUid] = true;
      logText = `💀 死神効果：英雄を捨てた。転生！${getCardById(revId)?.name}で復活。`;
    } else if (cid === 10) {
      gs.eliminated[chooserUid] = true;
      gameOver = true;
      logText  = `💀 死神効果：英雄を捨てた。転生不可！脱落！`;
    } else {
      logText = `💀 死神効果：「${getCardById(cid)?.name}」を捨てた。`;
    }
    gs.deathPending = null;
  }

  gs.log.push({ turn: gs.turnNumber, text: logText });

  if (gameOver) {
    // 相手（捨てさせた側）が勝者
    const winnerUid = Object.keys(gs.eliminated).find(u => !gs.eliminated[u]);
    finishGame(gs, winnerUid);
  } else {
    doNextTurn(gs, null, nextTurnUid);
  }

  await saveGameState(roomId, gs);
  return gs;
}

// ===================================================
// 賢者 → カード選択の解決
// ===================================================
export async function resolveSageChoice(
  roomId, gameState,
  actingUid, opponentUid,
  chosenCardId
) {
  const gs  = deepCopy(gameState);
  const cid = Number(chosenCardId);

  const choices = gs.sageChoices || [];
  // 選んだカードを手札に
  gs.hands[actingUid] = [cid];
  // 選ばなかったカードを山札の先頭に戻す
  const returned = choices.filter(id => id !== cid);
  gs.deck.unshift(...returned);

  gs.sageChoices = null;
  gs.sagePending = null;

  gs.log.push({
    turn : gs.turnNumber,
    text : `🧙 賢者：「${getCardById(cid)?.name}」を選んだ。残り${returned.length}枚を山札に戻した。`
  });

  doNextTurn(gs, actingUid, opponentUid);
  await saveGameState(roomId, gs);
  return gs;
}

// ===================================================
// 共通：ターン交代
// ===================================================
function doNextTurn(gs, currentUid, nextUid) {
  gs.turnNumber++;
  gs.currentTurn = nextUid;
  // 次のプレイヤーの乙女保護を解除（自分のターン開始時に解除）
  if (currentUid) gs.protected[currentUid] = false;
}

// ===================================================
// 共通：ゲーム終了処理
// ===================================================
function finishGame(gs, winnerUid) {
  // 全員脱落チェック
  const allElim = Object.values(gs.eliminated).every(v => v);
  gs.status    = "finished";
  gs.winner    = allElim ? "draw" : winnerUid;
  gs.endReason = allElim ? "allEliminated" : "eliminated";
  if (allElim) {
    gs.log.push({ turn: gs.turnNumber, text: `💥 全員脱落！引き分け（DRAW）！` });
  }
}

// ===================================================
// 共通：デッキ切れ処理
// ===================================================
export function checkDeckEmpty(gs) {
  if (gs.deck.length > 0 || gs.status === "finished") return;
  const uids = Object.keys(gs.hands);
  const v0   = getCardById(gs.hands[uids[0]]?.[0])?.value ?? 0;
  const v1   = getCardById(gs.hands[uids[1]]?.[0])?.value ?? 0;
  if      (v0 > v1) gs.winner = uids[0];
  else if (v1 > v0) gs.winner = uids[1];
  else              gs.winner = "draw";
  gs.status    = "finished";
  gs.endReason = "deckEmpty";
  gs.log.push({ turn: gs.turnNumber, text: `📦 山札切れ！手札比較で決着！` });
}

// ===================================================
// ユーティリティ
// ===================================================
function deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
}

async function saveGameState(roomId, gs) {
  const roomRef = doc(db, "rooms", roomId);
  await updateDoc(roomRef, { gameState: gs });
}
