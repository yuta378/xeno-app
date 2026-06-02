// ===================================================
// deck.js - カード定義とデッキ管理
// ===================================================

// ===== カード一覧（全16枚）=====
export const CARD_LIST = [
  {
    id      : 1,
    name    : "兵士",
    value   : 1,
    count   : 5,
    emoji   : "⚔️",
    description  : "相手の手札カード名を宣言。正解なら相手を脱落させる。",
    needsTarget  : true,
    needsGuess   : true
  },
  {
    id      : 2,
    name    : "占師",
    value   : 2,
    count   : 2,
    emoji   : "🔮",
    description  : "相手の手札を見る。",
    needsTarget  : true,
    needsGuess   : false
  },
  {
    id      : 3,
    name    : "乙女",
    value   : 3,
    count   : 2,
    emoji   : "👸",
    description  : "手に持っている間、他カードの効果を受けない。",
    needsTarget  : false,
    needsGuess   : false
  },
  {
    id      : 4,
    name    : "死神",
    value   : 4,
    count   : 2,
    emoji   : "💀",
    description  : "両者の手札を公開。数字の低い方が脱落する。",
    needsTarget  : false,
    needsGuess   : false
  },
  {
    id      : 5,
    name    : "貴族",
    value   : 5,
    count   : 2,
    emoji   : "🏅",
    description  : "相手と手札を比較。数字の低い方が脱落する。",
    needsTarget  : true,
    needsGuess   : false
  },
  {
    id      : 6,
    name    : "英雄",
    value   : 6,
    count   : 1,
    emoji   : "🦸",
    description  : "相手の手札を捨てさせ、新しいカードを引かせる。",
    needsTarget  : true,
    needsGuess   : false
  },
  {
    id      : 7,
    name    : "法王",
    value   : 7,
    count   : 1,
    emoji   : "⛪",
    description  : "このターン自分の手札を守る（効果を受けない）。",
    needsTarget  : false,
    needsGuess   : false
  },
  {
    id      : 8,
    name    : "皇帝",
    value   : 8,
    count   : 1,
    emoji   : "👑",
    description  : "相手と手札を交換する。",
    needsTarget  : true,
    needsGuess   : false
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

// ===== カード名一覧を取得（兵士の宣言用）=====
export function getGuessableCards() {
  // 兵士（1）以外のカード名一覧を返す
  return CARD_LIST.filter(c => c.id !== 1);
}