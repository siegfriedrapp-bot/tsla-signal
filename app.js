'use strict';
/* ============================================================
   TSLA Signal — technisches Analyse-Dashboard (keine Anlageberatung)
   ============================================================ */
const APP_VERSION = '1.1.1';

/* ---------- Storage ---------- */
const LS = {
  get(k, d){ try{ const v = localStorage.getItem(k); return v===null? d : JSON.parse(v); }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} },
  del(k){ try{ localStorage.removeItem(k); }catch(e){} }
};
const CFG_KEY='tsla_cfg';
const cfg = Object.assign({ provider:'twelvedata', apiKey:'', symbol:'TSLA' }, LS.get(CFG_KEY,{}));
let historyNote=''; // Warnhinweis bei eingeschränkter Historie (z. B. Alpha Vantage Gratis)

/* ---------- State ---------- */
let DATA = null;      // {dates:[], o:[], h:[], l:[], c:[], v:[]}
let IND  = null;      // computed indicators
let chartRange = 0;   // 0 = max

/* ---------- Utilities ---------- */
const $ = s => document.querySelector(s);
const fmtUSD = n => (n==null||isNaN(n))?'—':'$'+Number(n).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtPct = (n,dp=1) => (n==null||isNaN(n))?'—':(n>=0?'+':'')+ (n*100).toFixed(dp)+'%';
const fmtNum = (n,dp=1) => (n==null||isNaN(n))?'—':Number(n).toFixed(dp);
const fmtDate = d => { const t=new Date(d); return isNaN(t)? d : t.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'2-digit'}); };
const clamp = (x,a,b)=>Math.max(a,Math.min(b,x));
const last = a => a[a.length-1];

function banner(msg, kind='info', timeout=0){
  const b=$('#banner'); b.className='banner '+kind; b.textContent=msg; b.classList.remove('hidden');
  if(timeout){ setTimeout(()=>b.classList.add('hidden'), timeout); }
}
function hideBanner(){ $('#banner').classList.add('hidden'); }

/* ============================================================
   Indicator math
   ============================================================ */
function sma(a,n){ const out=Array(a.length).fill(null); let s=0;
  for(let i=0;i<a.length;i++){ s+=a[i]; if(i>=n) s-=a[i-n]; if(i>=n-1) out[i]=s/n; } return out; }

function ema(a,n){ const out=Array(a.length).fill(null); const k=2/(n+1); let prev=null;
  // seed with SMA of first n valid values
  let sum=0, cnt=0, seeded=false;
  for(let i=0;i<a.length;i++){
    if(a[i]==null) continue;
    if(!seeded){ sum+=a[i]; cnt++; if(cnt===n){ prev=sum/n; out[i]=prev; seeded=true; } }
    else { prev=a[i]*k + prev*(1-k); out[i]=prev; }
  }
  return out; }

function rsi(c,n=14){ const out=Array(c.length).fill(null); if(c.length<=n) return out;
  let gain=0, loss=0;
  for(let i=1;i<=n;i++){ const d=c[i]-c[i-1]; if(d>=0) gain+=d; else loss-=d; }
  gain/=n; loss/=n;
  out[n] = loss===0?100:100-100/(1+gain/loss);
  for(let i=n+1;i<c.length;i++){ const d=c[i]-c[i-1];
    gain=(gain*(n-1)+(d>0?d:0))/n; loss=(loss*(n-1)+(d<0?-d:0))/n;
    out[i]= loss===0?100:100-100/(1+gain/loss);
  }
  return out; }

function macd(c,f=12,s=26,sig=9){
  const ef=ema(c,f), es=ema(c,s);
  const line=c.map((_,i)=> (ef[i]!=null&&es[i]!=null)? ef[i]-es[i] : null);
  const signal=ema(line,sig);
  const hist=line.map((v,i)=> (v!=null&&signal[i]!=null)? v-signal[i]:null);
  return {line,signal,hist};
}

function rollingStd(a,n){ const out=Array(a.length).fill(null);
  for(let i=n-1;i<a.length;i++){ let m=0; for(let j=i-n+1;j<=i;j++) m+=a[j]; m/=n;
    let v=0; for(let j=i-n+1;j<=i;j++){ const d=a[j]-m; v+=d*d; } out[i]=Math.sqrt(v/n);
  } return out; }

function bollinger(c,n=20,k=2){ const mid=sma(c,n), sd=rollingStd(c,n);
  const up=c.map((_,i)=> mid[i]!=null? mid[i]+k*sd[i]:null);
  const lo=c.map((_,i)=> mid[i]!=null? mid[i]-k*sd[i]:null);
  const pctB=c.map((v,i)=> (up[i]!=null&&up[i]!==lo[i])? (v-lo[i])/(up[i]-lo[i]) : null);
  return {mid,up,lo,pctB}; }

function drawdownFromATH(c){ const dd=Array(c.length).fill(null); let peak=-Infinity;
  for(let i=0;i<c.length;i++){ peak=Math.max(peak,c[i]); dd[i]=c[i]/peak-1; } return dd; }

function annualVol(c,n=20){ const out=Array(c.length).fill(null);
  const r=c.map((v,i)=> i? Math.log(v/c[i-1]) : null);
  for(let i=n;i<c.length;i++){ let m=0; for(let j=i-n+1;j<=i;j++) m+=r[j]; m/=n;
    let v=0; for(let j=i-n+1;j<=i;j++){ const d=r[j]-m; v+=d*d; } out[i]=Math.sqrt(v/n)*Math.sqrt(252);
  } return out; }

/* ============================================================
   Pattern recognition — wiederkehrende Muster
   ============================================================ */
// Analog-Matching: aktuelle Kursform (letzte `win` Tage, als z-normierte
// Log-Renditen) mit allen Vergangenheitsfenstern vergleichen und mitteln,
// was in den `horizon` Tagen danach geschah.
function analogMatch(win=20, horizon=20, topK=25){
  const c=DATA.c, n=c.length;
  if(n < win+horizon+30) return null;
  const norm=a=>{ const m=a.reduce((x,y)=>x+y,0)/a.length;
    const sd=Math.sqrt(a.reduce((s,x)=>s+(x-m)*(x-m),0)/a.length)||1e-9;
    return a.map(x=>(x-m)/sd); };
  const cur=[]; for(let i=n-win;i<n;i++) cur.push(Math.log(c[i]/c[i-1]));
  const curN=norm(cur);
  const cutoff=n-win-1;            // keine Überlappung mit aktuellem Fenster
  const matches=[];
  for(let j=win; j<=cutoff-horizon; j++){
    const cand=[]; for(let k=0;k<win;k++) cand.push(Math.log(c[j-win+1+k]/c[j-win+k]));
    const candN=norm(cand);
    let dist=0; for(let k=0;k<win;k++){ const d=curN[k]-candN[k]; dist+=d*d; }
    matches.push({j, dist, fwd:c[j+horizon]/c[j]-1, date:DATA.dates[j]});
  }
  matches.sort((a,b)=>a.dist-b.dist);
  const top=matches.slice(0,topK);
  const avgFwd=top.reduce((s,m)=>s+m.fwd,0)/top.length;
  const upProb=top.filter(m=>m.fwd>0).length/top.length;
  const path=Array(horizon+1).fill(0);
  top.forEach(m=>{ for(let d=0;d<=horizon;d++) path[d]+=(c[m.j+d]/c[m.j]-1); });
  for(let d=0;d<=horizon;d++) path[d]/=top.length;
  return {avgFwd, upProb, top, path, horizon, win};
}

// Bedingte Muster: was folgte historisch auf typische Auslöser?
function conditionalPatterns(horizon=20){
  const c=DATA.c, n=c.length;
  const rsiA=IND.rsi, s50=IND.sma50, s200=IND.sma200, pb=IND.boll.pctB, dd=IND.dd;
  // gleitende 52W-Extrema (O(n))
  const hi=Array(n).fill(null), lo=Array(n).fill(null); const W=252;
  for(let i=0;i<n;i++){ if(i>=W){ let mx=-Infinity,mn=Infinity;
    for(let k=i-W;k<=i;k++){ if(c[k]>mx)mx=c[k]; if(c[k]<mn)mn=c[k]; } hi[i]=mx; lo[i]=mn; } }
  const defs=[
    {name:'RSI < 30 (überverkauft)',      test:i=>rsiA[i]!=null&&rsiA[i]<30},
    {name:'RSI > 70 (überkauft)',         test:i=>rsiA[i]!=null&&rsiA[i]>70},
    {name:'Kurs unter unterem Bollinger', test:i=>pb[i]!=null&&pb[i]<0},
    {name:'Kurs über oberem Bollinger',   test:i=>pb[i]!=null&&pb[i]>1},
    {name:'Golden Cross aktiv',           test:i=>s50[i]!=null&&s200[i]!=null&&s50[i]>s200[i]},
    {name:'Death Cross aktiv',            test:i=>s50[i]!=null&&s200[i]!=null&&s50[i]<s200[i]},
    {name:'Drawdown > 30% vom ATH',       test:i=>dd[i]!=null&&dd[i]<-0.30},
    {name:'Neues 52W-Hoch',               test:i=>hi[i]!=null&&c[i]>=hi[i]},
    {name:'Neues 52W-Tief',               test:i=>lo[i]!=null&&c[i]<=lo[i]},
    {name:'3 rote Tage in Folge',         test:i=>i>=3&&c[i]<c[i-1]&&c[i-1]<c[i-2]&&c[i-2]<c[i-3]},
  ];
  return defs.map(def=>{
    let cnt=0, sum=0, up=0;
    for(let i=0;i<n-horizon;i++){ if(!def.test(i)) continue;
      const f=c[i+horizon]/c[i]-1; cnt++; sum+=f; if(f>0) up++; }
    return { name:def.name, count:cnt, avg:cnt?sum/cnt:0, hit:cnt?up/cnt:0,
             active:def.test(n-1) };
  }).filter(r=>r.count>=5);
}

/* ============================================================
   Composite signal (transparent, weighted, -100..+100)
   Positive = eher Kauf-Bias, Negativ = eher Verkauf-Bias
   ============================================================ */
function computeSignal(){
  const c=DATA.c, i=c.length-1;
  const parts=[];

  // 1. RSI mean-reversion: niedrig = Kaufzone
  const r=IND.rsi[i];
  if(r!=null) parts.push({name:'RSI', w:1.1, s:clamp((50-r)/20,-1,1),
    note:`RSI ${fmtNum(r,0)}`});

  // 2. Bollinger %B: nahe unterem Band = Kaufzone
  const pb=IND.boll.pctB[i];
  if(pb!=null) parts.push({name:'Bollinger', w:0.9, s:clamp((0.5-pb)*2,-1,1),
    note:`%B ${fmtNum(pb*100,0)}`});

  // 3. Trend: Kurs vs SMA200 (Trendfilter, > = bullish)
  const s200=IND.sma200[i];
  if(s200!=null) parts.push({name:'Trend 200', w:1.2, s:Math.tanh((c[i]/s200-1)/0.10),
    note:c[i]>=s200?'über SMA200':'unter SMA200'});

  // 4. MACD-Momentum (Histogramm, normiert)
  const h=IND.macd.hist[i];
  if(h!=null){ // Skala über jüngste Histogramm-Amplitude
    let mx=1e-9; for(let j=Math.max(0,i-60);j<=i;j++){ if(IND.macd.hist[j]!=null) mx=Math.max(mx,Math.abs(IND.macd.hist[j])); }
    parts.push({name:'MACD', w:1.0, s:clamp(h/mx,-1,1), note:h>=0?'Momentum +':'Momentum −'}); }

  // 5. Golden/Death Cross
  const s50=IND.sma50[i];
  if(s50!=null&&s200!=null) parts.push({name:'50/200', w:0.7, s:s50>=s200?0.6:-0.6,
    note:s50>=s200?'Golden Cross':'Death Cross'});

  // 6. Drawdown vom ATH (kontrarisch: tiefer DD = Chance)
  const dd=IND.dd[i];
  if(dd!=null) parts.push({name:'Drawdown', w:0.7, s:clamp(dd/-0.40,-1,1),
    note:`${fmtPct(dd,0)} vom ATH`});

  // 7. Wiederkehrende Muster: Analog-Matching-Erwartung
  if(IND.analog) parts.push({name:'Muster', w:1.0, s:Math.tanh(IND.analog.avgFwd/0.10),
    note:`${fmtPct(IND.analog.avgFwd,1)} · ${fmtNum(IND.analog.upProb*100,0)}% ↑`});

  let num=0, den=0;
  parts.forEach(p=>{ num+=p.w*p.s; den+=p.w; });
  const score = den? Math.round(num/den*100):0;
  return {score, parts};
}

function verdict(score){
  if(score>=45) return {t:'Strong Buy', c:'var(--buy)'};
  if(score>=18) return {t:'Buy', c:'var(--buy)'};
  if(score>-18) return {t:'Neutral', c:'var(--neutral)'};
  if(score>-45) return {t:'Sell', c:'var(--sell)'};
  return {t:'Strong Sell', c:'var(--sell)'};
}

/* ============================================================
   Seasonality: durchschnittliche Monatsrendite
   ============================================================ */
function seasonality(){
  const byMonth=Array.from({length:12},()=>[]);
  // Gruppiere nach Monat: Rendite innerhalb des Kalendermonats (erster→letzter Handelstag)
  const groups={};
  for(let i=0;i<DATA.dates.length;i++){
    const d=new Date(DATA.dates[i]); const key=d.getFullYear()+'-'+d.getMonth();
    (groups[key]=groups[key]||[]).push({m:d.getMonth(), c:DATA.c[i]});
  }
  Object.values(groups).forEach(arr=>{ if(arr.length<2) return;
    const ret=arr[arr.length-1].c/arr[0].c-1; byMonth[arr[0].m].push(ret); });
  return byMonth.map(a=> a.length? a.reduce((x,y)=>x+y,0)/a.length : 0);
}

/* ============================================================
   Backtest: Score>+10 => long, Score<-10 => cash (Hysterese)
   ============================================================ */
function backtest(){
  const c=DATA.c, n=c.length;
  // Score-Serie über die Historie (vereinfachte tägliche Version der 6 Bausteine)
  const rsiA=IND.rsi, s200=IND.sma200, s50=IND.sma50, pbA=IND.boll.pctB, histA=IND.macd.hist, ddA=IND.dd;
  const scores=Array(n).fill(null);
  for(let i=0;i<n;i++){
    if(s200[i]==null||rsiA[i]==null||histA[i]==null) continue;
    let mx=1e-9; for(let j=Math.max(0,i-60);j<=i;j++){ if(histA[j]!=null) mx=Math.max(mx,Math.abs(histA[j])); }
    const parts=[
      [1.1, clamp((50-rsiA[i])/20,-1,1)],
      [0.9, pbA[i]!=null?clamp((0.5-pbA[i])*2,-1,1):0],
      [1.2, Math.tanh((c[i]/s200[i]-1)/0.10)],
      [1.0, clamp(histA[i]/mx,-1,1)],
      [0.7, (s50[i]!=null)?(s50[i]>=s200[i]?0.6:-0.6):0],
      [0.7, ddA[i]!=null?clamp(ddA[i]/-0.40,-1,1):0],
    ];
    let num=0,den=0; parts.forEach(p=>{num+=p[0]*p[1];den+=p[0];});
    scores[i]=num/den*100;
  }
  let inMkt=false, stratEq=1, holdEq=1, trades=0, wins=0, tradeStart=1;
  const eqStrat=Array(n).fill(null), eqHold=Array(n).fill(null);
  let peakS=1, peakH=1, mddS=0, mddH=0;
  const firstIdx = scores.findIndex(s=>s!=null);
  for(let i=Math.max(1,firstIdx);i<n;i++){
    const ret = c[i]/c[i-1]-1;
    holdEq *= (1+ret);
    if(inMkt) stratEq *= (1+ret);
    // Entscheidung am Ende des Tages i (wirkt ab i+1) — nutze scores[i-1] fürs Signal am Tag i
    const sig = scores[i-1];
    if(sig!=null){
      if(!inMkt && sig>10){ inMkt=true; trades++; tradeStart=stratEq; }
      else if(inMkt && sig<-10){ inMkt=false; if(stratEq>tradeStart) wins++; }
    }
    eqStrat[i]=stratEq; eqHold[i]=holdEq;
    peakS=Math.max(peakS,stratEq); mddS=Math.min(mddS, stratEq/peakS-1);
    peakH=Math.max(peakH,holdEq); mddH=Math.min(mddH, holdEq/peakH-1);
  }
  if(inMkt && stratEq>tradeStart) wins++; // offene Position als Gewinn werten falls positiv
  const years = (new Date(last(DATA.dates)) - new Date(DATA.dates[Math.max(0,firstIdx)]))/(365.25*864e5);
  const cagr = e => years>0? Math.pow(e,1/years)-1 : 0;
  return { eqStrat, eqHold, stratEq, holdEq, trades, wins,
    cagrS:cagr(stratEq), cagrH:cagr(holdEq), mddS, mddH,
    winRate: trades? wins/trades : 0 };
}

/* ============================================================
   Data providers
   ============================================================ */
async function fetchDaily(){
  historyNote='';
  const sym=cfg.symbol.trim().toUpperCase(), key=cfg.apiKey.trim();
  if(!key) throw new Error('Kein API-Schlüssel gesetzt. Öffne „Setup".');
  if(cfg.provider==='alphavantage'){
    const callAV=async os=>(await fetch(`https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${sym}&outputsize=${os}&apikey=${key}`)).json();
    let j=await callAV('full');
    const isPremium=x=>x['Information'] && /premium|outputsize=full/i.test(x['Information']);
    if(isPremium(j)){
      // Gratis-Konto: volle Historie gesperrt → auf compact (~100 Tage) ausweichen + warnen
      j=await callAV('compact');
      historyNote='⚠️ Alpha Vantage Gratis liefert nur ~100 Tage — SMA200, Saison, Muster & Backtest bleiben leer. In Setup auf „Twelve Data" wechseln (kostenlos, volle Historie).';
    }
    if(j['Error Message']) throw new Error('Symbol/Anbieter-Fehler: '+j['Error Message']);
    if(j['Note']||j['Information']) throw new Error('Limit/Key-Problem: '+(j['Note']||j['Information']));
    const ts=j['Time Series (Daily)']; if(!ts) throw new Error('Unerwartete Antwort von Alpha Vantage.');
    const rows=Object.keys(ts).sort().map(d=>({d, o:+ts[d]['1. open'], h:+ts[d]['2. high'], l:+ts[d]['3. low'], c:+ts[d]['4. close'], v:+ts[d]['5. volume']}));
    return toSeries(rows);
  } else {
    const url=`https://api.twelvedata.com/time_series?symbol=${sym}&interval=1day&outputsize=5000&apikey=${key}`;
    const j=await (await fetch(url)).json();
    if(j.status==='error') throw new Error('Twelve Data: '+j.message);
    if(!j.values) throw new Error('Unerwartete Antwort von Twelve Data.');
    const rows=j.values.map(x=>({d:x.datetime,o:+x.open,h:+x.high,l:+x.low,c:+x.close,v:+x.volume})).reverse();
    return toSeries(rows);
  }
}
function toSeries(rows){
  return { dates:rows.map(r=>r.d), o:rows.map(r=>r.o), h:rows.map(r=>r.h),
           l:rows.map(r=>r.l), c:rows.map(r=>r.c), v:rows.map(r=>r.v) };
}
const cacheKey = ()=> `tsla_data_${cfg.provider}_${cfg.symbol.toUpperCase()}`;

async function loadData(force=false){
  const ck=cacheKey();
  if(!force){
    const cached=LS.get(ck,null);
    if(cached && cached.savedAt && (Date.now()-cached.savedAt < 12*3600*1000)){
      DATA=cached.data; computeAll(); renderAll();
      banner('Daten aus Cache geladen ('+fmtDate(last(DATA.dates))+').','ok',2500);
      return;
    }
  }
  try{
    $('#refreshBtn').classList.add('spin');
    banner('Lade Kursdaten…','info');
    DATA=await fetchDaily();
    LS.set(ck,{savedAt:Date.now(),data:DATA});
    computeAll(); renderAll();
    if(historyNote) banner(historyNote,'err');
    else banner('Aktualisiert · Stand '+fmtDate(last(DATA.dates))+' · '+DATA.c.length+' Handelstage','ok',3500);
  }catch(e){
    // Fallback auf evtl. vorhandenen (alten) Cache
    const cached=LS.get(ck,null);
    if(cached){ DATA=cached.data; computeAll(); renderAll(); }
    banner(e.message,'err');
  }finally{ $('#refreshBtn').classList.remove('spin'); }
}

/* ---------- compute all indicators ---------- */
function computeAll(){
  const c=DATA.c;
  IND={
    sma50:sma(c,50), sma200:sma(c,200),
    rsi:rsi(c,14), macd:macd(c), boll:bollinger(c,20,2),
    dd:drawdownFromATH(c), vol:annualVol(c,20)
  };
  IND.analog=analogMatch(20,20,25);
  IND.cond=conditionalPatterns(20);
}

/* ============================================================
   Rendering
   ============================================================ */
function renderAll(){ renderOverview(); renderPatterns(); renderCharts(); renderSeason(); renderBacktest(); }

/* ---------- Patterns / Muster ---------- */
function renderPatterns(){
  if(!DATA||!IND.analog){ return; }
  const a=IND.analog;
  $('#anaHorizon').textContent=a.horizon;
  const sum=$('#analogSummary');
  const dir = a.avgFwd>=0?'pos':'neg';
  sum.innerHTML=`<div class="stat"><div class="k">Ø Bewegung (${a.horizon} T)</div><div class="v ${dir}">${fmtPct(a.avgFwd,1)}</div></div>
    <div class="stat"><div class="k">Aufwärts-Wahrsch.</div><div class="v ${a.upProb>=0.5?'pos':'neg'}">${fmtNum(a.upProb*100,0)}%</div></div>
    <div class="stat"><div class="k">verglichene Fenster</div><div class="v">${DATA.c.length-a.win}</div></div>
    <div class="stat"><div class="k">Top-Treffer</div><div class="v">${a.top.length}</div></div>`;
  // Forward-Path-Chart
  const cv=$('#chartAnalog'), c=baseChart(cv,{l:44,r:8,t:10,b:20});
  const path=a.path.map(x=>x*100);
  const [mn,mx]=minMax(path,[0]);
  drawGrid(c,mn,mx,v=>v.toFixed(0)+'%');
  // Null-Linie
  (function(){ const {ctx,pad,iw,ih}=c; const y=pad.t+ih*(1-(0-mn)/(mx-mn||1));
    ctx.strokeStyle='#5f6b79'; ctx.setLineDash([4,4]); ctx.beginPath();
    ctx.moveTo(pad.l,y); ctx.lineTo(pad.l+iw,y); ctx.stroke(); ctx.setLineDash([]); })();
  plotLine(c,path,0,mn,mx, a.avgFwd>=0?'#16c784':'#ea3943',2);
  $('#legendAnalog').innerHTML=`<span>Ø-Pfad der ${a.top.length} ähnlichsten Situationen, Tag 0 → +${a.horizon}</span>`;
  // Tabelle Top-Analogien
  const t=$('#analogTable');
  t.innerHTML='<div class="r head"><span>ähnliche Situation am</span><span>Bewegung +'+a.horizon+'T</span></div>';
  a.top.slice(0,12).forEach(m=>{ t.innerHTML+=`<div class="r"><span>${fmtDate(m.date)}</span>
    <span class="val ${m.fwd>=0?'pos':'neg'}">${fmtPct(m.fwd,1)}</span></div>`; });
  // Bedingte Muster
  const ct=$('#condTable');
  ct.innerHTML='<div class="r head"><span>Auslöser · Fälle · Trefferq.</span><span>Ø +20T</span></div>';
  IND.cond.sort((x,y)=>y.avg-x.avg).forEach(r=>{
    ct.innerHTML+=`<div class="r"><span>${r.name}${r.active?' <span class="live-badge">jetzt aktiv</span>':''}<br>
      <span class="muted" style="font-size:10px">${r.count} Fälle · Trefferquote ${fmtNum(r.hit*100,0)}%</span></span>
      <span class="val ${r.avg>=0?'pos':'neg'}">${fmtPct(r.avg,1)}</span></div>`; });
}

function renderOverview(){
  if(!DATA) return;
  const i=DATA.c.length-1;
  const price=DATA.c[i], prev=DATA.c[i-1];
  const chg=price/prev-1;
  $('#lastPrice').textContent=fmtUSD(price);
  const ce=$('#lastChange'); ce.textContent=fmtPct(chg,2); ce.className='chg '+(chg>=0?'up':'down');
  $('#lastDate').textContent='Stand '+fmtDate(DATA.dates[i])+' · Schlusskurs';

  const sig=computeSignal(); const v=verdict(sig.score);
  drawGauge(sig.score);
  const vt=$('#verdictText'); vt.textContent=v.t; vt.style.color=v.c;
  $('#verdictScore').textContent='Score '+(sig.score>0?'+':'')+sig.score+' / 100';

  // breakdown bars
  const bd=$('#breakdown'); bd.innerHTML='';
  sig.parts.forEach(p=>{
    const pct=Math.abs(p.s)*50; const left=p.s>=0?50:50-pct;
    const col=p.s>=0?'var(--buy)':'var(--sell)';
    const row=document.createElement('div'); row.className='bd-row';
    row.innerHTML=`<div class="bd-name">${p.name}<br><span class="muted" style="font-size:10px">${p.note}</span></div>
      <div class="bd-bar"><div class="mid"></div><div class="bd-fill" style="left:${left}%;width:${pct}%;background:${col}"></div></div>
      <div class="bd-val" style="color:${col}">${p.s>=0?'+':''}${(p.s*100).toFixed(0)}</div>`;
    bd.appendChild(row);
  });

  // metrics
  const m=$('#metrics'); m.innerHTML='';
  const hi52=Math.max(...DATA.c.slice(-252)), lo52=Math.min(...DATA.c.slice(-252));
  const cards=[
    ['RSI (14)', fmtNum(IND.rsi[i],1)],
    ['52W-Hoch', fmtUSD(hi52)],
    ['52W-Tief', fmtUSD(lo52)],
    ['Abstand SMA200', IND.sma200[i]?fmtPct(price/IND.sma200[i]-1,1):'—'],
    ['Drawdown ATH', fmtPct(IND.dd[i],1)],
    ['Volatilität p.a.', IND.vol[i]?fmtPct(IND.vol[i],0):'—'],
    ['MACD-Hist.', fmtNum(IND.macd.hist[i],2)],
    ['%B (Bollinger)', IND.boll.pctB[i]!=null?fmtNum(IND.boll.pctB[i]*100,0):'—'],
  ];
  cards.forEach(([k,val])=>{ const el=document.createElement('div'); el.className='metric';
    el.innerHTML=`<div class="k">${k}</div><div class="v">${val}</div>`; m.appendChild(el); });
}

/* ---------- Gauge ---------- */
function drawGauge(score){
  const cv=$('#gauge'), ctx=cv.getContext('2d');
  const DPR=window.devicePixelRatio||1, W=cv.clientWidth||320, H=W*0.56;
  cv.width=W*DPR; cv.height=H*DPR; ctx.scale(DPR,DPR);
  ctx.clearRect(0,0,W,H);
  const cx=W/2, cy=H*0.92, R=Math.min(W*0.42,H*0.82);
  const segs=[['#ea3943',-100,-45],['#f0803c',-45,-18],['#f0b90b',-18,18],['#7fd47a',18,45],['#16c784',45,100]];
  const a=s=>Math.PI+(s+100)/200*Math.PI;
  ctx.lineWidth=R*0.22; ctx.lineCap='butt';
  segs.forEach(([col,s0,s1])=>{ ctx.strokeStyle=col; ctx.beginPath(); ctx.arc(cx,cy,R,a(s0),a(s1)); ctx.stroke(); });
  // needle
  const ang=a(clamp(score,-100,100));
  ctx.strokeStyle='#e8edf2'; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(cx,cy);
  ctx.lineTo(cx+Math.cos(ang)*R*0.86, cy+Math.sin(ang)*R*0.86); ctx.stroke();
  ctx.fillStyle='#e8edf2'; ctx.beginPath(); ctx.arc(cx,cy,5,0,7); ctx.fill();
}

/* ============================================================
   Canvas line chart helper
   ============================================================ */
function sliceRange(){ const n=DATA.c.length; const r=chartRange&&chartRange<n?chartRange:0;
  const start=r? n-r:0; return {start,n}; }

function baseChart(cv, pad={l:44,r:8,t:10,b:20}){
  const DPR=window.devicePixelRatio||1, W=cv.clientWidth, H=cv.clientHeight;
  cv.width=W*DPR; cv.height=H*DPR; const ctx=cv.getContext('2d'); ctx.scale(DPR,DPR);
  ctx.clearRect(0,0,W,H);
  return {ctx,W,H,pad,iw:W-pad.l-pad.r,ih:H-pad.t-pad.b};
}
function drawGrid(c,min,max,fmt){ const {ctx,W,pad,ih}=c;
  ctx.strokeStyle='#232b35'; ctx.fillStyle='#5f6b79'; ctx.lineWidth=1; ctx.font='10px -apple-system,sans-serif';
  for(let g=0;g<=4;g++){ const y=pad.t+ih*g/4; const val=max-(max-min)*g/4;
    ctx.beginPath(); ctx.moveTo(pad.l,y); ctx.lineTo(W-pad.r,y); ctx.stroke();
    ctx.fillText(fmt(val), 4, y+3); }
}
function plotLine(c,arr,start,min,max,color,width=1.5){ const {ctx,pad,iw,ih}=c;
  const n=arr.length; ctx.strokeStyle=color; ctx.lineWidth=width; ctx.beginPath(); let started=false;
  for(let i=start;i<n;i++){ if(arr[i]==null){ started=false; continue; }
    const x=pad.l+iw*(i-start)/(n-1-start||1); const y=pad.t+ih*(1-(arr[i]-min)/(max-min||1));
    if(!started){ ctx.moveTo(x,y); started=true; } else ctx.lineTo(x,y); }
  ctx.stroke();
}
function plotBand(c,up,lo,start,min,max,color){ const {ctx,pad,iw,ih}=c; const n=up.length;
  ctx.fillStyle=color; ctx.beginPath(); let started=false;
  for(let i=start;i<n;i++){ if(up[i]==null)continue; const x=pad.l+iw*(i-start)/(n-1-start||1);
    const y=pad.t+ih*(1-(up[i]-min)/(max-min||1)); if(!started){ctx.moveTo(x,y);started=true;}else ctx.lineTo(x,y);}
  for(let i=n-1;i>=start;i--){ if(lo[i]==null)continue; const x=pad.l+iw*(i-start)/(n-1-start||1);
    const y=pad.t+ih*(1-(lo[i]-min)/(max-min||1)); ctx.lineTo(x,y);}
  ctx.closePath(); ctx.fill();
}
function minMax(...arrs){ let mn=Infinity,mx=-Infinity; arrs.forEach(a=>a.forEach(v=>{ if(v!=null){mn=Math.min(mn,v);mx=Math.max(mx,v);} }));
  const pad=(mx-mn)*0.06||1; return [mn-pad,mx+pad]; }

function renderCharts(){
  if(!DATA) return;
  const {start}=sliceRange();
  // Price + SMA + Bollinger
  const cP=baseChart($('#chartPrice'));
  const seg=arr=>arr.slice(start);
  const [pmin,pmax]=minMax(seg(DATA.c),seg(IND.boll.up),seg(IND.boll.lo));
  drawGrid(cP,pmin,pmax,v=>'$'+v.toFixed(0));
  plotBand(cP,IND.boll.up,IND.boll.lo,start,pmin,pmax,'rgba(59,130,246,.10)');
  plotLine(cP,IND.boll.up,start,pmin,pmax,'rgba(59,130,246,.35)',1);
  plotLine(cP,IND.boll.lo,start,pmin,pmax,'rgba(59,130,246,.35)',1);
  plotLine(cP,IND.sma200,start,pmin,pmax,'#f0b90b',1.4);
  plotLine(cP,IND.sma50,start,pmin,pmax,'#9b6bff',1.4);
  plotLine(cP,DATA.c,start,pmin,pmax,'#e8edf2',1.8);
  $('#legendPrice').innerHTML=`<span><i style="background:#e8edf2"></i>Kurs</span>
    <span><i style="background:#9b6bff"></i>SMA 50</span>
    <span><i style="background:#f0b90b"></i>SMA 200</span>
    <span><i style="background:#3b82f6"></i>Bollinger</span>`;

  // RSI
  const cR=baseChart($('#chartRsi'));
  drawGrid(cR,0,100,v=>v.toFixed(0));
  // 30/70 Zonen
  [30,70].forEach(lv=>{ const {ctx,pad,iw,ih}=cR; const y=pad.t+ih*(1-lv/100);
    ctx.strokeStyle= lv===70?'rgba(234,57,67,.4)':'rgba(22,199,132,.4)'; ctx.setLineDash([4,4]);
    ctx.beginPath(); ctx.moveTo(pad.l,y); ctx.lineTo(pad.l+iw,y); ctx.stroke(); ctx.setLineDash([]); });
  plotLine(cR,IND.rsi,start,0,100,'#3b82f6',1.6);

  // MACD
  const cM=baseChart($('#chartMacd'));
  const [mmin,mmax]=minMax(seg(IND.macd.line),seg(IND.macd.signal),seg(IND.macd.hist));
  drawGrid(cM,mmin,mmax,v=>v.toFixed(1));
  // histogram bars
  (function(){ const {ctx,pad,iw,ih}=cM; const n=IND.macd.hist.length;
    for(let i=start;i<n;i++){ const hv=IND.macd.hist[i]; if(hv==null)continue;
      const x=pad.l+iw*(i-start)/(n-1-start||1); const y0=pad.t+ih*(1-(0-mmin)/(mmax-mmin||1));
      const y1=pad.t+ih*(1-(hv-mmin)/(mmax-mmin||1));
      ctx.strokeStyle= hv>=0?'rgba(22,199,132,.7)':'rgba(234,57,67,.7)'; ctx.lineWidth=Math.max(1,iw/(n-start)*0.7);
      ctx.beginPath(); ctx.moveTo(x,y0); ctx.lineTo(x,y1); ctx.stroke(); } })();
  plotLine(cM,IND.macd.line,start,mmin,mmax,'#e8edf2',1.4);
  plotLine(cM,IND.macd.signal,start,mmin,mmax,'#f0b90b',1.4);
}

/* ---------- Season ---------- */
function renderSeason(){
  if(!DATA) return;
  const s=seasonality();
  const names=['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
  const cv=$('#chartSeason'), c=baseChart(cv,{l:36,r:8,t:10,b:22});
  const mx=Math.max(...s.map(Math.abs),0.01);
  const {ctx,pad,iw,ih}=c;
  drawGrid(c,-mx*100,mx*100,v=>v.toFixed(0)+'%');
  const zeroY=pad.t+ih*0.5;
  const bw=iw/12*0.6;
  s.forEach((v,idx)=>{ const x=pad.l+iw*(idx+0.5)/12; const h=ih*0.5*(v/mx);
    ctx.fillStyle= v>=0?'#16c784':'#ea3943';
    ctx.fillRect(x-bw/2, v>=0?zeroY-h:zeroY, bw, Math.abs(h));
    ctx.fillStyle='#8b97a6'; ctx.font='9px sans-serif'; ctx.textAlign='center';
    ctx.fillText(names[idx], x, pad.t+ih+14); });
  ctx.textAlign='left';
  const best=[...s.keys()].sort((a,b)=>s[b]-s[a]);
  $('#seasonNote').textContent=`Bestbewährter Monat: ${names[best[0]]} (${fmtPct(s[best[0]],1)}) · Schwächster: ${names[best[11]]} (${fmtPct(s[best[11]],1)}). Historischer Mittelwert, kein Versprechen.`;
  const tbl=$('#seasonTable'); tbl.innerHTML='<div class="r head"><span>Monat</span><span>Ø Rendite</span></div>';
  s.map((v,i)=>[names[i],v]).sort((a,b)=>b[1]-a[1]).forEach(([nm,v])=>{
    tbl.innerHTML+=`<div class="r"><span>${nm}</span><span class="val ${v>=0?'pos':'neg'}">${fmtPct(v,2)}</span></div>`; });
}

/* ---------- Backtest ---------- */
function renderBacktest(){
  if(!DATA) return;
  const bt=backtest();
  const cv=$('#chartEquity'), c=baseChart(cv,{l:48,r:8,t:10,b:20});
  const [mn,mx]=minMax(bt.eqStrat,bt.eqHold);
  const start=bt.eqHold.findIndex(v=>v!=null);
  drawGrid(c,mn,mx,v=>v.toFixed(1)+'×');
  plotLine(c,bt.eqHold,start,mn,mx,'#8b97a6',1.6);
  plotLine(c,bt.eqStrat,start,mn,mx,'#16c784',1.8);
  $('#legendEquity').innerHTML=`<span><i style="background:#16c784"></i>Signal-Strategie</span>
    <span><i style="background:#8b97a6"></i>Buy &amp; Hold</span>`;
  const st=$('#backtestStats'); st.innerHTML='';
  const rows=[
    ['CAGR Strategie', fmtPct(bt.cagrS,1), bt.cagrS>=0],
    ['CAGR Buy&Hold', fmtPct(bt.cagrH,1), bt.cagrH>=0],
    ['Endwert Strategie', fmtNum(bt.stratEq,2)+'×', bt.stratEq>=1],
    ['Endwert Buy&Hold', fmtNum(bt.holdEq,2)+'×', bt.holdEq>=1],
    ['Max Drawdown Strat.', fmtPct(bt.mddS,0), false],
    ['Max Drawdown B&H', fmtPct(bt.mddH,0), false],
    ['Trades', String(bt.trades), true],
    ['Trefferquote', fmtPct(bt.winRate,0), bt.winRate>=0.5],
  ];
  rows.forEach(([k,v,pos])=>{ const el=document.createElement('div'); el.className='stat';
    el.innerHTML=`<div class="k">${k}</div><div class="v ${pos?'pos':'neg'}">${v}</div>`; st.appendChild(el); });
}

/* ============================================================
   Earnings (lazy)
   ============================================================ */
async function loadEarnings(){
  const sym=cfg.symbol.trim().toUpperCase(), key=cfg.apiKey.trim();
  if(!key){ banner('Kein API-Schlüssel. Öffne „Setup".','err'); return; }
  if(cfg.provider!=='alphavantage'){ banner('Earnings-Reaktion ist nur mit Alpha Vantage verfügbar.','info',4000); return; }
  try{
    $('#loadEarnings').textContent='Lade…';
    const url=`https://www.alphavantage.co/query?function=EARNINGS&symbol=${sym}&apikey=${key}`;
    const j=await (await fetch(url)).json();
    if(j['Note']||j['Information']) throw new Error('Limit/Key-Problem: '+(j['Note']||j['Information']));
    const q=j.quarterlyEarnings; if(!q) throw new Error('Keine Earnings-Daten erhalten.');
    // Kursreaktion: Close am reportedDate vs Close am Vortag
    const idx={}; DATA.dates.forEach((d,i)=>idx[d]=i);
    const reactions=[];
    q.slice(0,24).forEach(e=>{ const d=e.reportedDate; let i=idx[d];
      // falls Berichtstag kein Handelstag: nächsten Handelstag suchen
      if(i==null){ for(let k=0;k<4;k++){ const dd=addDays(d,k); if(idx[dd]!=null){i=idx[dd];break;} } }
      if(i==null||i<1) return;
      const react=DATA.c[i]/DATA.c[i-1]-1;
      reactions.push({date:d, react, surprise: e.surprisePercentage!=null?+e.surprisePercentage:null});
    });
    renderEarnings(reactions);
    banner('Earnings geladen ('+reactions.length+' Quartale).','ok',2500);
  }catch(e){ banner(e.message,'err'); }
  finally{ $('#loadEarnings').textContent='Earnings-Daten neu laden'; }
}
function addDays(d,n){ const t=new Date(d); t.setDate(t.getDate()+n); return t.toISOString().slice(0,10); }

function renderEarnings(rs){
  const sum=$('#earningsSummary'); sum.classList.remove('hidden');
  const ups=rs.filter(r=>r.react>0).length; const avg=rs.reduce((a,b)=>a+b.react,0)/(rs.length||1);
  const avgAbs=rs.reduce((a,b)=>a+Math.abs(b.react),0)/(rs.length||1);
  sum.innerHTML=`<div class="stat"><div class="k">Ø Reaktion</div><div class="v ${avg>=0?'pos':'neg'}">${fmtPct(avg,1)}</div></div>
    <div class="stat"><div class="k">Ø Bewegung (Betrag)</div><div class="v">${fmtPct(avgAbs,1)}</div></div>
    <div class="stat"><div class="k">Grün nach Zahlen</div><div class="v">${ups}/${rs.length}</div></div>
    <div class="stat"><div class="k">Aufwärts-Quote</div><div class="v ${ups/rs.length>=0.5?'pos':'neg'}">${fmtPct(ups/(rs.length||1),0)}</div></div>`;
  const t=$('#earningsTable');
  t.innerHTML='<div class="r head"><span>Berichtstag</span><span>Kursreaktion (Folgetag)</span></div>';
  rs.forEach(r=>{ t.innerHTML+=`<div class="r"><span>${fmtDate(r.date)}</span>
    <span class="val ${r.react>=0?'pos':'neg'}">${fmtPct(r.react,1)}</span></div>`; });
}

/* ============================================================
   UI wiring
   ============================================================ */
function switchView(name){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  $('#view-'+name).classList.add('active');
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active', t.dataset.view===name));
  if(DATA) requestAnimationFrame(()=>{ renderCharts(); renderSeason(); renderBacktest(); if(name==='patterns') renderPatterns(); if(name==='overview') drawGauge(computeSignal().score); });
}
document.querySelectorAll('.tab').forEach(t=> t.addEventListener('click', ()=>switchView(t.dataset.view)) );

document.querySelectorAll('.range-sel button').forEach(b=> b.addEventListener('click',()=>{
  document.querySelectorAll('.range-sel button').forEach(x=>x.classList.remove('on'));
  b.classList.add('on'); chartRange=+b.dataset.range; renderCharts();
}));

$('#refreshBtn').addEventListener('click', ()=> loadData(true));
$('#loadEarnings').addEventListener('click', loadEarnings);

$('#saveSettings').addEventListener('click', ()=>{
  cfg.provider=$('#provider').value; cfg.apiKey=$('#apiKey').value.trim(); cfg.symbol=($('#symbol').value.trim()||'TSLA').toUpperCase();
  LS.set(CFG_KEY,cfg);
  $('#symTitle').textContent=(cfg.symbol==='TSLA'?'TESLA · ':'')+cfg.symbol;
  $('#settingsMsg').textContent='Gespeichert. Lade Daten…';
  loadData(true).then(()=>{ $('#settingsMsg').textContent='Fertig.'; switchView('overview'); });
});
$('#clearCache').addEventListener('click', ()=>{
  LS.del(cacheKey()); $('#settingsMsg').textContent='Cache geleert.';
});

let rt; window.addEventListener('resize', ()=>{ clearTimeout(rt); rt=setTimeout(()=>{ if(DATA){ drawGauge(computeSignal().score); renderCharts(); renderSeason(); renderBacktest(); } },200); });

/* ---------- init ---------- */
(function init(){
  $('#provider').value=cfg.provider; $('#apiKey').value=cfg.apiKey; $('#symbol').value=cfg.symbol;
  $('#symTitle').textContent=(cfg.symbol==='TSLA'?'TESLA · ':'')+cfg.symbol;
  $('#symSub').textContent='Analyse-Dashboard · v'+APP_VERSION;
  if('serviceWorker' in navigator){ navigator.serviceWorker.register('sw.js').catch(()=>{}); }
  if(cfg.apiKey){ loadData(false); }
  else { banner('Willkommen! Öffne „Setup" (⚙︎), füge deinen kostenlosen API-Key ein und tippe „Speichern & Laden".','info'); switchView('settings'); }
})();
