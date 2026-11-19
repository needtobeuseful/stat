// Код статистики игрока из ссылки. Тот же кодек на питоне - в
// src/minimap/codes.py (encode_stats): меняйте оба вместе.
//
// Код - поток битов, записанный буквами base64url (A-Z a-z 0-9 - _), в
// конце две буквы контрольной суммы (12 бит CRC-16). Служебные числа
// (версия, сколько чисел и текстов) - кодом Exp-Golomb: маленькие короткие,
// 0 - один бит.
//
// [3 бита вид = 5] [версия формата] [день: с 1 января 2024]
// [ник] [сколько чисел] [числа по порядку] [сколько ачивок ещё не получено]
// [сколько получено] [тексты полученных].
//
// Версия 0 - день, числа и «ещё не получено» кодом Exp-Golomb, версия 1 -
// кодом Элиаса-дельта: сначала (Exp-Golomb) сколько бит в числе, потом сами
// биты без старшей единицы - большие числа так короче. Версия 2 - тексты
// ачивок словами из словаря (words.js): после «сколько получено» -
// [бит на номер слова - 1], и у каждого текста [0 - словами: слов - 1, на
// каждое номер слова (0 - слово не из словаря, дальше оно буквами), между
// словами номер промежутка из GAPS, в конце номер конца из ENDS] или
// [1 - буквами, как ник]. Первое слово и слово после конца предложения -
// с заглавной. Сайт читает все версии.
//
// Текст: [0 - ник: длина (Exp-Golomb порядка 3), по 6 бит на букву из
// A-Z a-z 0-9 _] или [1 - текст: длина, бит «первая буква заглавная», коды
// Хаффмана символов]. Коды Хаффмана канонические: по длине из LENGTHS, при
// равной длине - по порядку в TABLE. За таблицей два знака: UPPER
// (следующий символ - заглавный) и RAW (дальше - номер символа в Unicode).

import { WORDS } from './words.js';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const KIND_STATS = 5;
const STATS_FORMAT = 2;
// Текст ачивки словами: что между словами и что после последнего. Только
// дописывать в конец - как WORD_GAPS и WORD_ENDS в боте
const GAPS = [' ', ', ', '. ', '-', '! ', '? ', ': ', ' - ', ' — ', '… ', '... '];
const ENDS = ['', '!', '?', '…', '.', '...', '!!!', '?!'];
const SENTENCE = new Set(['. ', '! ', '? ']);
const MAX_WORDS = 40;
const NEWER = 'ссылка от более новой версии бота - сайт пора обновить';
const MAX_ZEROS = 24;
const MAX_TEXT = 200;
const NAME_CHARS = ALPHABET.slice(0, 62) + '_';
const TABLE = ' оеаинтсрвлкмдпуяыьгзбчйхжшюцщэфъё' + '.,!?-:«»"\'()' + '0123456789' + 'abcdefghijklmnopqrstuvwxyz';
const UPPER = TABLE.length;
const RAW = TABLE.length + 1;
const LENGTHS = [3, 4, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 7, 7, 7, 8, 8, 8, 9, 9, 9,
  12, 11, 8, 8, 8, 9, 8, 11, 11, 10, 11, 12, 12, 12, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 11,
  11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11,
  11, 7, 10];
const LONGEST = Math.max(...LENGTHS);

export class CodeError extends Error {}

// Канонический код: {`длина:код`: символ}
const SYMBOLS = (() => {
  const order = LENGTHS.map((length, symbol) => [length, symbol])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const map = new Map();
  let code = 0, previous = 0;
  for (const [length, symbol] of order) {
    code *= 2 ** (length - previous);
    previous = length;
    map.set(`${length}:${code}`, symbol);
    code += 1;
  }
  return map;
})();

function crc16(values) {
  let crc = 0xffff;
  for (const value of values) {
    crc ^= value << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

class BitReader {
  constructor(text) {
    const clean = String(text ?? '').trim();
    if (clean.length < 3) throw new CodeError('код слишком короткий');
    const values = [];
    for (const char of clean) {
      const value = ALPHABET.indexOf(char);
      if (value < 0) throw new CodeError('в коде лишние символы');
      values.push(value);
    }
    const body = values.slice(0, -2);
    const check = (values[values.length - 2] << 6) | values[values.length - 1];
    if ((crc16(body) >> 4) !== check) throw new CodeError('ссылка скопирована не целиком или с ошибкой');
    this.bits = [];
    for (const value of body) {
      for (let i = 5; i >= 0; i--) this.bits.push((value >> i) & 1);
    }
    this.pos = 0;
    if (this.read(3) !== KIND_STATS) throw new CodeError('это не ссылка на статистику');
  }

  read(count) {
    if (this.pos + count > this.bits.length) throw new CodeError('ссылка оборвана');
    let value = 0;
    for (let i = 0; i < count; i++) value = value * 2 + this.bits[this.pos++];
    return value;
  }

  number() {
    let zeros = 0;
    while (this.read(1) === 0) {
      if (++zeros > MAX_ZEROS) throw new CodeError('ссылка повреждена');
    }
    return 2 ** zeros + this.read(zeros) - 1;
  }

  numberK(order) {
    return this.number() * 2 ** order + this.read(order);
  }

  // Элиас-дельта: [сколько бит - 1 кодом Exp-Golomb] [биты без старшей единицы]
  delta() {
    const length = this.number() + 1;
    if (length > 53) throw new CodeError('ссылка повреждена');
    return 2 ** (length - 1) + this.read(length - 1) - 1;
  }

  count(limit) {
    const value = this.number();
    if (value > limit) throw new CodeError('ссылка повреждена');
    return value;
  }

  symbol() {
    let code = 0;
    for (let length = 1; length <= LONGEST; length++) {
      code = code * 2 + this.read(1);
      const symbol = SYMBOLS.get(`${length}:${code}`);
      if (symbol !== undefined) return symbol;
    }
    throw new CodeError('ссылка повреждена');
  }

  string() {
    const simple = this.read(1) === 0;
    const length = this.numberK(3);
    if (length > MAX_TEXT) throw new CodeError('ссылка повреждена');
    let text = '';
    if (simple) {
      for (let i = 0; i < length; i++) {
        const value = this.read(6);
        if (value >= NAME_CHARS.length) throw new CodeError('ссылка повреждена');
        text += NAME_CHARS[value];
      }
      return text;
    }
    const capital = this.read(1) === 1;
    for (let i = 0; i < length; i++) {
      let symbol = this.symbol();
      let upper = capital && i === 0;
      if (symbol === UPPER) {
        upper = true;
        symbol = this.symbol();
        if (symbol >= TABLE.length) throw new CodeError('ссылка повреждена');
      }
      if (symbol === RAW) {
        const point = this.number();
        if (point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff) || upper) throw new CodeError('ссылка повреждена');
        text += String.fromCodePoint(point);
      } else {
        text += upper ? TABLE[symbol].toUpperCase() : TABLE[symbol];
      }
    }
    return text;
  }

  // Текст ачивки: словами из словаря или буквами (версия 2)
  phrase(width) {
    if (this.read(1) === 1) return this.string();
    const count = this.count(MAX_WORDS - 1) + 1;
    let text = '';
    let start = true;
    for (let i = 0; i < count; i++) {
      const code = this.read(width);
      let word;
      if (code === 0) {
        word = this.string();
      } else {
        word = WORDS[code - 1];
        if (word === undefined) throw new CodeError(NEWER);
      }
      text += start ? word.charAt(0).toUpperCase() + word.slice(1) : word;
      if (i < count - 1) {
        const gap = GAPS[this.number()];
        if (gap === undefined) throw new CodeError(NEWER);
        text += gap;
        start = SENTENCE.has(gap);
      }
    }
    const end = ENDS[this.number()];
    if (end === undefined) throw new CodeError(NEWER);
    return text + end;
  }

  finish() {
    const rest = this.bits.slice(this.pos);
    if (rest.length >= 6 || rest.some((bit) => bit)) throw new CodeError('в ссылке лишние данные');
  }
}

// {day, name, numbers, remaining, earned}. Бросает CodeError, если код испорчен
export function decodeStats(text) {
  const reader = new BitReader(text);
  const version = reader.number();
  if (version > STATS_FORMAT) throw new CodeError('ссылка от более новой версии бота - сайт пора обновить');
  const number = version >= 1 ? () => reader.delta() : () => reader.number();
  const day = number();
  const name = reader.string();
  const numbers = [];
  for (let i = reader.count(1000); i > 0; i--) numbers.push(number());
  const remaining = number();
  const earned = [];
  const count = reader.count(1000);
  if (version >= 2 && count) {
    const width = reader.count(31) + 1;
    for (let i = 0; i < count; i++) earned.push(reader.phrase(width));
  } else {
    for (let i = 0; i < count; i++) earned.push(reader.string());
  }
  reader.finish();
  return { day, name, numbers, remaining, earned };
}
