// ===================================================
// deck.js - 公式XENOカード定義（全10種・18枚）
// ===================================================

export const CARD_LIST = [
  {
    id          : 1,
    name        : "少年",
    value       : 1,
    count       : 2,
    emoji       : "👦",
    description : "2枚目を出すと皇帝と同じ「公開処刑」を発動。1枚目は効果なし。",
    needsTarget : false,
    needsGuess  : false
  },
  {
    id          : 2,
    name        : "兵士",
    value       : 2,
    count       : 2,
    emoji       : "⚔️",
    description : "相手の手札カード名を宣言。正解なら相手を脱落させる。",
    needsTarget : true,
    needsGuess  : true
  },
  {
    id          : 3,
    name        : "占師",
    value       : 3,
    count       : 2,
    emoji       : "🔮",
    description : "相手の手札を見る。",
    needsTarget : true,
    needsGuess  : false
  },
  {
    id          : 4,
    name        : "乙女",
    value       : 4,
    count       : 2,
    emoji       : "👸",
    description : "次の自分のターンまで、相手の効果を無効化する。",
    needsTarget : false,
    needsGuess  : false
  },
  {
    id          : 5,
    name        : "死神",
    value       : 5,
    count       : 2,
    emoji       : "💀",
    description : "相手に山札から1枚引かせ、2枚の手札から1枚を捨てさせる。",
    needsTarget : true,
    needsGuess  : false
  },
  {
    id          : 6,
    name        : "貴族",
    value       : 6,
    count       : 2,
    emoji       : "🏅",
    description : "相手と手札を見せ合い、数字の小さい方が脱落する。",
    needsTarget : true,
    needsGuess  : false
  },
  {
    id          : 7,
    name        : "賢者",
    value       : 7,
    count       : 2,
    emoji       : "🧙",
    description : "次の自分のターンで山札から3枚引き、1枚を選んで残りを戻す。",
    needsTarget : false,
    needsGuess  : false
  },
  {
    id          : 8,
    name        : "精霊",
    value       : 8,
    count       : 2,
    emoji       : "✨",
    description : "相手と手札を交換する。",
    needsTarget : true,
    needsGuess  : false
  },
  {
    id          : 9,
    name        : "皇帝",
    value       : 9,
    count       : 1,
    emoji       : "👑",
    description : "相手に山札から1枚引かせ、手札を全て公開させ1枚を捨てさせる。転生不可。",
    needsTarget : true,
    needsGuess  : false
  },
  {
    id          : 10,
    name        : "英雄",
    value       : 10,
    count       : 1,
    emoji       : "🦸",
    description : "場に出せない。他カードの効果で捨てられた場合、転生札で復活（皇帝除く）。",
    needsTarget : false,
    needsGuess  : false
  }
];

// ===== デッキを生成する =====
export function createDeck() {
  const deck = [];
  CARD_LIST.forEach(card => {
    for (let i = 0; i < card.count; i++) {
      deck.push({ ...card });
    }
  });
  return deck;
}

// ===== デッキをシャッフルする（Fisher-Yates法）=====
export function shuffleDeck(deck) {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

// ===== IDからカード情報を取得 =====
export function getCardById(id) {
  return CARD_LIST.find(c => c.id === Number(id)) || null;
}

// ===== 兵士で宣言できるカード一覧（兵士自身と英雄は除外）=====
export function getGuessableCards() {
  return CARD_LIST.filter(c => c.id !== 2 && c.id !== 10);
}
