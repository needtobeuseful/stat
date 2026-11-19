// Сайт статистики игрока мини-игры.
//
// Всё, что показывает страница, - в ссылке после #: её присылает бот (за
// награду канала или по !статистика). Там ник, числа и тексты только тех
// ачивок, которые игрок уже получил (номерами слов из словаря words.js), а
// неполученные - одним числом. Списка ачивок на самом сайте нет, а в
// словаре их слова перемешаны с подставными, поэтому секретные ачивки не
// узнать ни по странице, ни по её коду. Ссылка - снимок на день, когда её
// прислал бот.

import { decodeStats } from './codec.js';

const CONFIG = window.STATS_CONFIG || {};
const app = document.getElementById('app');

// Числа в ссылке - по порядку (как achievements.LINK_NUMBERS в боте).
// Только дописывать в конец, ничего не переставлять
const NUMBERS = ['balance', 'keys', 'games', 'best_game', 'total_found',
  'steps', 'boxes', 'moves', 'bumps', 'timeouts', 'hearts_lost', 'hearts_spent', 'traps', 'beds',
  'pets', 'scratches', 'keys_found', 'chests_opened', 'chests_broken', 'mimics', 'mimic_bites',
  'wishes', 'guess_wins', 'guess_losses', 'shops', 'bought', 'altars', 'visits', 'fake_double',
  'fake_hungry', 'hungry_paid', 'fake_forgotten', 'gifts_given', 'gifts_received', 'items', 'outfits',
  'traps_known'];

const LABELS = {
  steps: 'Переходов из бокса в бокс',
  boxes: 'Новых боксов открыто',
  moves: 'Ходов потрачено',
  bumps: 'Раз упёрся в стену',
  timeouts: 'Раз не успел сходить',
  hearts_lost: 'Сердечек отняли',
  hearts_spent: 'Сердечек потрачено',
  traps: 'Ловушек',
  beds: 'Отдыхов на кровати',
  pets: 'Раз погладил котят',
  scratches: 'Котик поцарапал',
  keys_found: 'Ключей подобрано',
  chests_opened: 'Сундуков открыто ключом',
  chests_broken: 'Сундуков сломано',
  mimics: 'Мимиков разбужено',
  mimic_bites: 'Укусов мимика',
  wishes: 'Монеток в фонтан',
  guess_wins: 'Угадал',
  guess_losses: 'Не угадал',
  shops: 'Заходов в лавки',
  bought: 'Покупок',
  altars: 'Сделок с алтарём',
  visits: 'Отдыхов в чужих комнатах',
  fake_double: 'Встреч с двойником',
  fake_hungry: 'Голодных комнат',
  hungry_paid: 'Раз накормил комнату',
  fake_forgotten: 'Забытых вещей найдено',
  gifts_given: 'Подарков подарено',
  gifts_received: 'Подарков получено',
  items: 'Мебели, обоев и пола',
  outfits: 'Одежды для персонажа',
  traps_known: 'Шагнул в ловушку нарочно',
};

// Разделы статистики. Пустые числа не показываются: незачем дразнить тем,
// чего игрок ещё не встречал
const GROUPS = [
  ['Путь по подвалу', '🧭', ['steps', 'boxes', 'moves', 'bumps', 'timeouts']],
  ['Сердечки', '💗', ['hearts_lost', 'hearts_spent']],
  ['Котята', '🐱', ['pets', 'scratches']],
  ['Ключи и сундуки', '🗝️', ['keys_found', 'chests_opened', 'chests_broken', 'mimics', 'mimic_bites']],
  ['Ловушки, кровати и фонтаны', '🛏️', ['traps', 'traps_known', 'beds', 'wishes']],
  ['Угадайка', '🎁', ['guess_wins', 'guess_losses']],
  ['Лавки и алтарь', '🕯️', ['shops', 'bought', 'altars']],
  ['Чужие комнаты', '🚪', ['visits', 'fake_double', 'fake_hungry', 'hungry_paid', 'fake_forgotten']],
  ['Подарки и находки', '📦', ['gifts_given', 'gifts_received', 'items', 'outfits']],
];

const EPOCH = Date.UTC(2024, 0, 1);

const esc = (text) => String(text ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));
const fmt = (n) => Number(n).toLocaleString('ru-RU');
const fill = (template, values) => String(template || '').replace(/\{(\w+)\}/g, (all, key) => (key in values ? values[key] : all));

function dateOf(day) {
  const date = new Date(EPOCH + day * 86400000);
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function codeFromHash() {
  const hash = location.hash.slice(1);
  if (!hash) return '';
  const params = new URLSearchParams(hash);
  return params.get('s') || (hash.includes('=') ? '' : hash);
}

function renderEmpty(title, text, bad = false) {
  document.title = CONFIG.title || 'Статистика';
  app.innerHTML = `
    <section class="empty${bad ? ' bad' : ''}">
      <div class="empty-icon">${bad ? '⚠️' : '📊'}</div>
      <h1>${esc(title)}</h1>
      <p>${esc(text)}</p>
    </section>`;
}

// Сердечки веером - «сердечек подобрано»: три сердечка с общим кончиком,
// как карты в руке. Цвета - как у 💗 на соседней плитке
const HEART = 'M16 28.2C14.9 27.3 3.5 19.6 3.5 11.4 3.5 7.2 6.6 4 10.5 4c2.4 0 4.4 1.3 5.5 3.3C17.1 5.3 19.1 4 21.5 4c3.9 0 7 3.2 7 7.4 0 8.2-11.4 15.9-12.5 16.8z';
const fanHeart = (turn, fill) => `<path d="${HEART}" transform="rotate(${turn}) translate(-9.6 -16.9) scale(0.6)" fill="${fill}" stroke="#b3124a" stroke-width="2.4" stroke-linejoin="round"/>`;
const HEARTS_FAN = `<svg class="fan" viewBox="9.5 19.5 29 19.5" aria-hidden="true"><g transform="translate(24 37)">`
  + fanHeart(-32, '#ff9cc3') + fanHeart(32, '#ff9cc3') + fanHeart(0, '#ff5c8a')
  + '<path d="M-4.4 -11.1c.3-.9 1-1.4 1.8-1.4" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="1.4" stroke-linecap="round"/>'
  + '</g></svg>';
const MEDAL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.1l6-.8z" fill="currentColor"/></svg>';
const LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="currentColor"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>';

function render(data) {
  const values = {};
  NUMBERS.forEach((name, index) => { values[name] = data.numbers[index] ?? 0; });
  const name = data.name || 'Игрок';
  document.title = `${name} - ${CONFIG.title || 'Статистика'}`;
  const total = data.earned.length + data.remaining;

  const hero = [
    ['💗', values.balance, 'сердечек на счету', 'heart'],
    ['🎮', values.games, 'игр сыграно', ''],
    ['🏆', values.best_game, 'рекорд за игру', 'gold'],
    [HEARTS_FAN, values.total_found, 'сердечек подобрано', ''],
    ['🗝️', values.keys, 'ключей сейчас', 'gold'],
  ];

  const earned = data.earned.map((text, i) => `
    <div class="ach" style="--i:${i}">
      <span class="medal">${MEDAL}</span>
      <b>${esc(text)}</b>
    </div>`).join('');
  const lockShown = Math.min(data.remaining, 24);
  const locked = data.remaining ? `
    <div class="locked">
      <div class="locks">${Array.from({ length: lockShown }, () => `<span class="lock">${LOCK}</span>`).join('')}${data.remaining > lockShown ? `<span class="more">+${data.remaining - lockShown}</span>` : ''}</div>
      <p>${esc(fill(CONFIG.lockedText || 'Ещё {count}', { count: data.remaining }))}</p>
    </div>` : '';
  const progress = total ? Math.round((data.earned.length / total) * 100) : 0;

  const groups = GROUPS.map(([title, icon, keys]) => {
    const rows = keys.filter((key) => values[key] > 0).map((key) => `
      <div class="row"><span>${esc(LABELS[key])}</span><b>${fmt(values[key])}</b></div>`);
    if (!rows.length) return '';
    return `
      <section class="group">
        <h3><span class="icon">${icon}</span>${esc(title)}</h3>
        ${rows.join('')}
      </section>`;
  }).join('');

  app.innerHTML = `
    <header class="hero">
      <p class="kicker">${esc(CONFIG.title || 'Статистика')}</p>
      <h1>${esc(name)}</h1>
      <p class="sub">${esc(fill(CONFIG.subtitle || '{date}', { date: dateOf(data.day) }))}</p>
    </header>

    <section class="tiles">
      ${hero.map(([icon, value, label, kind]) => `
        <div class="tile ${kind}">
          <span class="icon">${icon}</span>
          <b>${fmt(value)}</b>
          <span>${esc(label)}</span>
        </div>`).join('')}
    </section>

    <section class="card achievements">
      <div class="ach-head">
        <h2>${esc(fill(CONFIG.achievementsTitle || 'Ачивки: {earned} из {total}', { earned: data.earned.length, total }))}</h2>
        ${total ? `<div class="bar"><i style="width:${progress}%"></i></div>` : ''}
      </div>
      ${earned ? `<div class="ach-grid">${earned}</div>` : `<p class="none">${esc(CONFIG.noAchievements || '')}</p>`}
      ${locked}
    </section>

    ${groups ? `<section class="groups">${groups}</section>` : ''}`;
}

function start() {
  document.getElementById('footer').textContent = CONFIG.footer || '';
  const code = codeFromHash();
  if (!code) {
    renderEmpty(CONFIG.emptyTitle || 'Статистика игрока', CONFIG.emptyText || '');
    return;
  }
  try {
    render(decodeStats(code));
  } catch (error) {
    const reason = String(error.message || error);
    renderEmpty('Ссылка не открылась', `${reason.charAt(0).toUpperCase()}${reason.slice(1)}. Возьми у бота новую - наградой за баллы канала`, true);
  }
}

start();
window.addEventListener('hashchange', start);
window.__statsReady = true;
