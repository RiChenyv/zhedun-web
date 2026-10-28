import {meals, getShop, tastes} from './data.js';
import {quote, eta} from './model.js';

export const DECISION_KEY = 'zhedun-decision-v1';
export const timeOptions = [15, 20, 30, 45, 60];
export const outingLabels = {stay:'留在宿舍等饭', nearby:'可以下楼取餐', walk:'愿意走走'};
export const roleLabels = {fast:'最快吃上', cheap:'最省钱', easy:'最少折腾'};
const allowed = {stay:['delivery'], nearby:['delivery','pickup','cabinet'], walk:['delivery','cabinet','pickup','dine']};
const effort = {delivery:0, cabinet:1, pickup:2, dine:3};
const amount = n => Number(n.toFixed(2));
const money = n => String(amount(n));

export function decisionDefaults(prefs = {}) {
  const budget=Number(prefs.budget),minutes=Number(prefs.minutes);
  return {budget:Number.isFinite(budget)&&budget>=8&&budget<=60?Math.round(budget*2)/2:30,
    minutes:timeOptions.includes(minutes)?minutes:45,
    taste:['all',...tastes].includes(prefs.taste)?prefs.taste:'all',
    weather:prefs.weather==='rain'?'rain':'sun', outing:'walk'};
}
export function validConditions(p) {
  return p && Number.isFinite(p.budget) && p.budget >= 8 && p.budget <= 60 &&
    p.budget * 2 === Math.round(p.budget * 2) && timeOptions.includes(p.minutes) &&
    ['all', ...tastes].includes(p.taste) && ['sun','rain'].includes(p.weather) &&
    Object.hasOwn(allowed, p.outing);
}
export function loadDecision(storage, prefs) {
  try {
    const saved = JSON.parse(storage.getItem(DECISION_KEY));
    if (saved?.version === 1 && validConditions(saved.conditions) &&
        [1,2,3].includes(saved.step) && typeof saved.complete === 'boolean') return saved;
  } catch {}
  return {version:1, conditions:decisionDefaults(prefs), step:1, complete:false};
}
export function saveDecision(storage, session) {
  try { storage.setItem(DECISION_KEY, JSON.stringify(session)); return true; } catch { return false; }
}

export function decide(conditions, menu = meals) {
  if (!validConditions(conditions)) throw new Error('Invalid decision conditions');
  const pool = menu.filter(m => !m.sold && (conditions.taste === 'all' || m.taste === conditions.taste))
    .flatMap(m => m.modes.filter(mode => allowed[conditions.outing].includes(mode)).map(mode => ({
      key:`${m.id}:${mode}`, mealId:m.id, mode, total:quote(m,mode).total,
      minutes:eta(m,mode,conditions.weather), walk:mode === 'delivery' ? 0 : getShop(m.shopId).walk
    })));
  const feasible = pool.filter(p => p.total <= conditions.budget && p.minutes <= conditions.minutes);
  const tie = (a,b) => a.mealId.localeCompare(b.mealId, 'en', {numeric:true}) || a.mode.localeCompare(b.mode);
  const ranks = {
    fast:(a,b) => a.minutes-b.minutes || a.total-b.total || tie(a,b),
    cheap:(a,b) => a.total-b.total || a.minutes-b.minutes || tie(a,b),
    easy:(a,b) => effort[a.mode]-effort[b.mode] || a.walk-b.walk || a.minutes-b.minutes || a.total-b.total || tie(a,b)
  };
  const winners = Object.fromEntries(Object.entries(ranks).map(([role,sort]) => [role,[...feasible].sort(sort)[0]]));
  const picks = [];
  for (const [role,winner] of Object.entries(winners)) {
    if (!winner) continue;
    let pick = picks.find(p => p.key === winner.key);
    if (!pick) { pick = {...winner, roles:[]}; picks.push(pick); }
    pick.roles.push(role);
  }
  for (const pick of picks) {
    pick.reasons = pick.roles.map(role => role === 'fast'
      ? `符合条件的方案里，预计 ${pick.minutes} 分钟就能吃上。`
      : role === 'cheap' ? `符合条件的方案里，到手价最低 ¥${money(pick.total)}，包装配送都算上。`
      : pick.mode === 'delivery' ? '支持配送到宿舍，这次不用专程出门取餐。'
      : pick.mode === 'cabinet' ? '可预约取餐柜领取，在允许的方式中优先少折腾。'
      : `在允许的方式中优先少折腾，示例步行 ${pick.walk} 分钟。`);
    const priceDiff = amount(pick.total-winners.cheap.total);
    const timeDiff = winners.cheap.minutes-pick.minutes;
    pick.tradeoff = pick.key === winners.cheap.key
      ? `比最快方案${pick.minutes === winners.fast.minutes ? '用时相同' : `慢 ${pick.minutes-winners.fast.minutes} 分钟`}；${priceDiff === 0 && pick.total === winners.fast.total ? '价格也相同' : `省 ¥${money(winners.fast.total-pick.total)}`}。`
      : `比最省方案${priceDiff ? `贵 ¥${money(priceDiff)}` : '价格相同'}，${timeDiff > 0 ? `快 ${timeDiff} 分钟` : timeDiff < 0 ? `慢 ${-timeDiff} 分钟` : '用时相同'}。`;
  }
  const suggestions = [];
  if (!picks.length) {
    const inTime = pool.filter(p => p.minutes <= conditions.minutes);
    const inBudget = pool.filter(p => p.total <= conditions.budget);
    const neededBudget = Math.min(...inTime.map(p => p.total));
    const neededTime = Math.min(...inBudget.map(p => p.minutes));
    if (neededBudget > conditions.budget && neededBudget <= 60) suggestions.push({
      key:'budget', value:neededBudget, delta:amount(neededBudget-conditions.budget), required:neededBudget
    });
    const nextTime = timeOptions.find(t => t >= neededTime);
    if (neededTime > conditions.minutes && nextTime) suggestions.push({
      key:'minutes', value:nextTime, delta:nextTime-conditions.minutes, required:neededTime
    });
  }
  return {picks, suggestions, count:feasible.length};
}
