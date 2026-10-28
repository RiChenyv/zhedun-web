import {meals,getMeal,modes} from './data.js';
import {quote,eta} from './model.js';

export const periodLabels={breakfast:'早餐',lunch:'午餐',dinner:'晚餐',late:'夜宵'};
export const PERSONAL_KEY='zhedun-recommendation-v1';
export const familyLabels={breakfast:'早餐组合',rice:'米饭套餐',tray:'家常套餐',noodles:'面食',light:'轻食暖碗',dumplings:'水饺',tofu:'豆腐饭',sweetpork:'糖醋饭',curry:'咖喱饭',fish:'鱼肉饭',steak:'牛排饭'};
const DAY=86400000;
const paidStatuses=['placed','preparing','ready','delivering','done'];
const money=n=>Number(n.toFixed(2));
export function mealPeriod(date=new Date()) {
  const h=date.getHours();
  return h>=5&&h<10?'breakfast':h>=10&&h<16?'lunch':h>=16&&h<21?'dinner':'late';
}
export function localDay(date=new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
export function loadPersonalSession(storage,date=new Date()) {
  const fresh={version:1,date:localDay(date),period:null,offsets:{},signatures:{}};
  try {
    const x=JSON.parse(storage.getItem(PERSONAL_KEY));
    if(x?.version!==1||x.date!==fresh.date||!(x.period===null||Object.hasOwn(periodLabels,x.period)))return fresh;
    fresh.period=x.period;
    for(const period of Object.keys(periodLabels)){
      if(Number.isInteger(x.offsets?.[period])&&x.offsets[period]>=0&&x.offsets[period]<1000000)fresh.offsets[period]=x.offsets[period];
      if(typeof x.signatures?.[period]==='string')fresh.signatures[period]=x.signatures[period];
    }
  }catch{}
  return fresh;
}
export function savePersonalSession(storage,session) {
  try{storage.setItem(PERSONAL_KEY,JSON.stringify(session));return true;}catch{return false;}
}
function orderPeriod(order) {
  const match=/^(\d{1,2}):(\d{2})/.exec(order.slot||'');
  const date=new Date(order.created);
  if(match&&Number(match[1])<24&&Number(match[2])<60)date.setHours(Number(match[1]),Number(match[2]));
  return mealPeriod(date);
}
export function family(meal) { return meal.category||meal.image; }
export function isExampleOrder(order) { return order.sample===true||['ZD102701','ZD102602'].includes(order.id); }

export function buildProfile(state,period,now=Date.now()) {
  const orders=(state.orders||[]).filter(o=>paidStatuses.includes(o.status)&&getMeal(o.mealId)&&
    Number.isFinite(o.created)&&o.created<=now&&o.created>=now-30*DAY&&
    Number.isFinite(o.quote?.total)&&o.quote.total>=0&&Number.isInteger(o.qty)&&o.qty>=1);
  const completed=orders.filter(o=>o.status==='done'&&o.created>=now-7*DAY);
  const spent=money(completed.reduce((sum,o)=>sum+o.quote.total,0));
  const units=completed.reduce((sum,o)=>sum+o.qty,0);
  const counts={taste:{},family:{},mode:{},shop:{}};
  let weight=0;
  for(const o of orders){
    const m=getMeal(o.mealId);
    // Same-meal-period purchases and the last seven days carry more weight.
    const w=(o.created>=now-7*DAY?2:1)*(orderPeriod(o)===period?2:1);
    weight+=w;
    for(const [type,value] of [['taste',m.taste],['family',family(m)],['mode',o.mode],['shop',m.shopId]]){
      if(value)counts[type][value]=(counts[type][value]||0)+w;
    }
  }
  const top=type=>Object.entries(counts[type]).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'zh-CN'))[0]?.[0]||null;
  return {orders,counts,weight,spent,completedCount:completed.length,units,
    average:units?money(spent/units):null,exampleCount:orders.filter(isExampleOrder).length,
    periodCount:orders.filter(o=>orderPeriod(o)===period).length,
    topTaste:top('taste'),topFamily:top('family'),topMode:top('mode')};
}

export function recommendMeal(state,conditions,{period=mealPeriod(),now=Date.now(),menu=meals}={}) {
  if(!Object.hasOwn(periodLabels,period))period=mealPeriod(new Date(now));
  const profile=buildProfile(state,period,now);
  const budget=Number.isFinite(Number(conditions.budget))?Number(conditions.budget):30;
  const minutes=Number.isFinite(Number(conditions.minutes))?Number(conditions.minutes):45;
  const target=Math.min(budget,profile.average??18);
  const share=(type,value)=>profile.weight?(profile.counts[type][value]||0)/profile.weight:0;
  const history=[...profile.orders].sort((a,b)=>b.created-a.created);
  const ranked=[];
  for(const m of menu){
    const periods=m.mealPeriods||(family(m)==='breakfast'?['breakfast','late']:['lunch','dinner','late']);
    if(m.sold||!periods.includes(period)||m.portion.includes('双人')||
       (conditions.taste&&conditions.taste!=='all'&&m.taste!==conditions.taste))continue;
    const candidates=[];
    for(const mode of m.modes){
      if(conditions.mode&&conditions.mode!=='all'&&mode!==conditions.mode)continue;
      const total=quote(m,mode).total,minutesToEat=eta(m,mode,conditions.weather);
      if(total>budget||minutesToEat>minutes)continue;
      const last=history.find(o=>o.mealId===m.id);
      const recent=last&&now-last.created<=2*DAY;
      const priceFit=Math.max(0,10-Math.abs(total-target)/Math.max(target,1)*10);
      const score=share('taste',m.taste)*30+share('family',family(m))*22+
        share('mode',mode)*16+share('shop',m.shopId)*8+priceFit+
        (conditions.weather==='rain'&&mode==='delivery'?6:0)+
        (conditions.energy==='low'&&mode==='delivery'?8:0)+
        (!profile.orders.length&&mode==='pickup'?4:0)-(recent?24:0);
      candidates.push({mealId:m.id,mode,total,minutes:minutesToEat,score,recent});
    }
    candidates.sort((a,b)=>b.score-a.score||a.total-b.total||a.minutes-b.minutes||a.mode.localeCompare(b.mode));
    if(candidates.length)ranked.push(candidates[0]);
  }
  ranked.sort((a,b)=>b.score-a.score||a.total-b.total||a.minutes-b.minutes||a.mealId.localeCompare(b.mealId,'en',{numeric:true}));
  for(const pick of ranked){
    const m=menu.find(m=>m.id===pick.mealId),reasons=[];
    if(profile.orders.length){
      if(m.taste===profile.topTaste)reasons.push(`最近买过的餐食里，「${m.taste}」更合你的选择`);
      if(family(m)===profile.topFamily)reasons.push(`延续你最近选过的${familyLabels[family(m)]||'这类餐食'}`);
      if(pick.mode===profile.topMode&&modes[pick.mode])reasons.push(`沿用你近期更常选的${modes[pick.mode]}`);
      if(profile.average!==null&&pick.total<=profile.average)reasons.push(`到手 ¥${pick.total}，不超过近 7 天已完成订单的每份均价 ¥${profile.average}`);
      if(history.slice(0,3).some(o=>family(getMeal(o.mealId))===family(m)&&o.mealId!==m.id)&&!pick.recent)
        reasons.push('保留熟悉的搭配，换一道近两天没买过的菜');
    }
    if(conditions.weather==='rain'&&pick.mode==='delivery')reasons.push('雨天安排配送，少跑一趟');
    if(!reasons.length)reasons.push(profile.orders.length?'在你的预算和时间内，换个适合这顿的选择':'先按你设置的预算、口味和用餐时间挑选');
    pick.reasons=reasons.slice(0,3);
  }
  return {period,profile,ranked,budget,minutes,target};
}
