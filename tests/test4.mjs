import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({viewport:{width:390,height:900}});
const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
p.on('console',m=>{ if(m.type()==='error') errs.push('CONSOLE: '+m.text()); });

// 오디오 노드 생성을 세어 실제로 소리를 냈는지 확인한다
await p.addInitScript(() => {
  window.__osc = 0; window.__starts = []; window.__stops = []; window.__verb = 0;
  const AC = window.AudioContext || window.webkitAudioContext;
  const oOsc = AC.prototype.createOscillator, oConv = AC.prototype.createConvolver;
  AC.prototype.createOscillator = function () {
    window.__osc++;
    const o = oOsc.call(this);
    const st = o.start.bind(o), sp = o.stop.bind(o);
    o.start = t => { window.__starts.push(t); st(t); };
    o.stop  = t => { window.__stops.push(t);  sp(t); };
    return o;
  };
  AC.prototype.createConvolver = function () { window.__verb++; return oConv.call(this); };
});
await p.goto(new URL('../public/index.html', import.meta.url).href);
const pass=[],fail=[]; const chk=(c,n,x='')=>(c?pass:fail).push(n+(c?'':' :: '+x));
const osc = () => p.evaluate(()=>window.__osc);
const HEX={'rgb(220, 38, 38)':'빨강','rgb(37, 99, 235)':'파랑','rgb(147, 51, 234)':'보라','rgb(22, 163, 74)':'초록'};
const TABLE={강아지:['animal','noun'],고양이:['animal','noun'],짖다:['animal','verb'],뛰어놀다:['animal','verb'],
복슬복슬한:['animal','adj'],포근한:['animal','adj'],버스:['vehicle','noun'],자전거:['vehicle','noun'],
달리다:['vehicle','verb'],멈추다:['vehicle','verb'],빠른:['vehicle','adj'],시끄러운:['vehicle','adj'],
의사:['hospital','noun'],주사:['hospital','noun'],진찰하다:['hospital','verb'],낫다:['hospital','verb'],
따끔한:['hospital','adj'],깨끗한:['hospital','adj'],사과:['food','noun'],국수:['food','noun'],
씹다:['food','verb'],끓이다:['food','verb'],달콤한:['food','adj'],뜨거운:['food','adj']};

chk(await p.evaluate(()=>Sound.isOn()), 'A1 기본은 소리 켜짐');
chk(await p.evaluate(()=>document.getElementById('sound-btn').textContent)==='🔊','A2 버튼 아이콘 🔊');

// ---- 게임별: 정답을 맞혔을 때 소리가 나는가 ----
// 색깔 글자
let n0=await osc();
const st=await p.evaluate((HEX)=>{Stroop.start();const el=document.getElementById('stroop-word');
  Stroop.answer(el.textContent===HEX[getComputedStyle(el).color]);
  return document.getElementById('stroop-feedback').innerText;},HEX);
chk(st.includes('정답') && await osc()>n0, 'B1 색깔 글자', st+' osc+'+(await osc()-n0));

// 같은 그림 판별
n0=await osc();
const sp=await p.evaluate(async()=>{Speed.start();const prev=document.getElementById('speed-card').textContent;
  Speed.begin();const cur=document.getElementById('speed-card').textContent;
  Speed.answer(cur===prev);return document.getElementById('speed-feedback').innerText;});
chk(sp.includes('정답') && await osc()>n0, 'B2 같은 그림 판별', sp);
await p.evaluate(()=>Speed.quit());

// 낱말 나누기
n0=await osc();
const so=await p.evaluate((T)=>{Sort.start();Sort.flip();
  const w=document.getElementById('sort-word').textContent;
  [...document.querySelectorAll('.sort-bin')].find(x=>x.dataset.key===T[w][0]).click();
  return document.getElementById('sort-feedback').innerText;},TABLE);
chk(so.includes('정답') && await osc()>n0, 'B3 낱말 나누기', so);
await p.evaluate(()=>goHome());

// 카드 뒤집기
n0=await osc();
const me=await p.evaluate(()=>{Memory.start();
  const by={};[...document.querySelectorAll('#memory-grid .mcard')].forEach(c=>(by[c.dataset.animal]??=[]).push(c));
  const k=Object.keys(by)[0];by[k][0].click();by[k][1].click();
  return document.getElementById('memory-score').textContent;});
chk(me==='1' && await osc()>n0, 'B4 카드 뒤집기 (짝 맞춤)', me);
await p.evaluate(()=>goHome());

// 모양 맞추기 - 정답 보기를 모르므로 맞을 때까지 새 판을 돌린다
let shapeOk=false, shapeSound=false;
for (let t=0;t<30 && !shapeOk;t++){
  n0=await osc();
  const r=await p.evaluate(()=>{Shape.start();
    document.querySelectorAll('#shape-choices .shape-choice')[0].click();
    return document.getElementById('shape-feedback').innerText;});
  if(r.includes('정답')){shapeOk=true; shapeSound=(await osc())>n0;}
}
chk(shapeOk && shapeSound, 'B5 모양 맞추기', '정답발생='+shapeOk+' 소리='+shapeSound);
await p.evaluate(()=>goHome());

// 문맥 퀴즈
let quizOk=false, quizSound=false;
for (let t=0;t<30 && !quizOk;t++){
  n0=await osc();
  const r=await p.evaluate(()=>{Quiz.start();
    document.querySelector('.quiz-choice').click();
    return document.getElementById('quiz-feedback').innerText;});
  if(r.includes('정답이에요')){quizOk=true; quizSound=(await osc())>n0;}
}
chk(quizOk && quizSound, 'B6 문맥 퀴즈', '정답발생='+quizOk+' 소리='+quizSound);
await p.evaluate(()=>goHome());

// 청기백기 - 지시문을 읽고 스와이프로 깃발을 맞춘다
n0=await osc();
await p.evaluate(()=>Flag.start());
await p.waitForTimeout(1100);
const fl=await p.evaluate(async()=>{
  const cmd=document.getElementById('flag-command').textContent;
  const act=(name)=>{ const i=cmd.indexOf(name); if(i<0) return 'neutral';
    const tail=cmd.slice(i);
    if(/^..\s*(올리지 말고|내리지 말고)/.test(tail)) return 'neutral';
    if(/^..\s*(올려|올리고)/.test(tail)) return 'up';
    if(/^..\s*(내려|내리고)/.test(tail)) return 'down';
    return 'neutral'; };
  const swipe=(id,dir)=>{const z=document.getElementById(id),r=z.getBoundingClientRect();
    const x=r.left+r.width/2, y0=r.top+r.height/2, y1=y0+(dir==='up'?-60:60);
    const o=y=>({bubbles:true,clientX:x,clientY:y,pointerId:1,pointerType:'touch'});
    z.dispatchEvent(new PointerEvent('pointerdown',o(y0)));
    z.dispatchEvent(new PointerEvent('pointermove',o(y1)));
    z.dispatchEvent(new PointerEvent('pointerup',o(y1)));};
  const B=act('청기'), W=act('백기');
  if(B!=='neutral') swipe('zone-blue',B);
  if(W!=='neutral') swipe('zone-white',W);
  await new Promise(r=>setTimeout(r,1000));
  return {cmd, B, W, fb:document.getElementById('flag-feedback-text').innerText};
});
chk(fl.fb.includes('정답') && await osc()>n0, 'B7 청기백기', JSON.stringify(fl));
await p.evaluate(()=>Flag.quit());

// ---- 오답에는 소리 없음 ----
n0=await osc();
const wrong=await p.evaluate((HEX)=>{Stroop.start();const el=document.getElementById('stroop-word');
  Stroop.answer(!(el.textContent===HEX[getComputedStyle(el).color]));
  return document.getElementById('stroop-feedback').innerText;},HEX);
chk(wrong.includes('아쉬워요') && await osc()===n0, 'C1 오답에는 소리 없음', wrong);
await p.evaluate(()=>goHome());

// ---- 소리의 결: 배음을 겹친 종소리인가 ----
const tone = await p.evaluate(()=>{
  const n0=window.__osc; window.__starts.length=0; window.__stops.length=0;
  Sound.correct(0);
  const made = window.__osc-n0;
  const span = Math.max(...window.__stops) - Math.min(...window.__starts);
  const onsets = [...new Set(window.__starts.map(t=>Math.round(t*1000)))].length;
  return {오실레이터:made, 음수:onsets, 꼬리길이:+span.toFixed(2), 울림:window.__verb};
});
chk(tone.음수===3, 'C2 도-미-솔 세 음', JSON.stringify(tone));
chk(tone.오실레이터===tone.음수*3, 'C3 음마다 배음 3겹 (기음+옥타브+12도)', JSON.stringify(tone));
chk(tone.꼬리길이>0.7, 'C4 소리가 길게 사그라짐 (띡 하고 끊기지 않음)', JSON.stringify(tone));
chk(tone.울림>0, 'C5 울림(리버브) 적용', JSON.stringify(tone));

// 연속으로 맞힐수록 음이 늘어난다
const grow = await p.evaluate(()=>{
  const c=()=>{const n=window.__osc; return s=>{Sound.correct(s); const d=window.__osc-window.__osc+0; return 0;};};
  const out={};
  for (const s of [0,3,6]) { const n=window.__osc; Sound.correct(s); out[s]=(window.__osc-n)/3; }
  return out;
});
chk(grow['0']===3 && grow['3']===4 && grow['6']===5,
    'C6 연속 3회·6회에서 음이 하나씩 늘어남', JSON.stringify(grow));

// 한 판을 끝내면 마무리 소리
const fin = await p.evaluate(()=>{
  const out={};
  for (const r of [0.3,0.6,1.0]) { const n=window.__osc; Sound.finish(r); out[r]=(window.__osc-n)/3; }
  return out;
});
chk(fin['0.3']===3 && fin['0.6']===4 && fin['1']===6,
    'C7 마무리 소리는 잘할수록 길어짐', JSON.stringify(fin));

// 결과 화면이 뜰 때 마무리 소리가 실제로 울리는지 (배선 확인)
const wired = await p.evaluate(()=>{
  const n=window.__osc;
  showResult({score:8, max:10, gameKey:null, detailHtml:'', retryFn:()=>{}});
  return window.__osc-n;
});
chk(wired>0, 'C8 게임을 끝내면 마무리 소리가 울림', '오실레이터 +'+wired);
await p.evaluate(()=>goHome());

// ---- 끄기 ----
await p.evaluate(()=>Sound.toggle());
chk(await p.evaluate(()=>document.getElementById('sound-btn').textContent)==='🔇','D1 끄면 아이콘 🔇');
n0=await osc();
const off=await p.evaluate((HEX)=>{Stroop.start();const el=document.getElementById('stroop-word');
  Stroop.answer(el.textContent===HEX[getComputedStyle(el).color]);
  return document.getElementById('stroop-feedback').innerText;},HEX);
chk(off.includes('정답') && await osc()===n0, 'D2 꺼져 있으면 정답이어도 소리 없음', off);
chk(await p.evaluate(()=>localStorage.getItem('vgb_sound'))==='off','D3 설정이 저장됨');
// 새로고침해도 유지
await p.reload();
chk(await p.evaluate(()=>document.getElementById('sound-btn').textContent)==='🔇','D4 새로고침해도 꺼진 상태 유지');
await p.evaluate(()=>Sound.toggle());
chk(await p.evaluate(()=>Sound.isOn()),'D5 다시 켜짐');

await b.close();
console.log('PASS '+pass.length+'\n  '+pass.join('\n  '));
if(fail.length) console.log('FAIL '+fail.length+'\n  '+fail.join('\n  '));
if(errs.length) console.log('JS ERRORS:\n  '+errs.join('\n  '));
process.exit(fail.length||errs.length?1:0);
