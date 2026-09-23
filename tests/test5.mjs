import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({viewport:{width:390,height:900}});
const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
p.on('console',m=>{ if(m.type()==='error') errs.push('CONSOLE: '+m.text()); });
await p.addInitScript(()=>{window.__osc=0;const AC=window.AudioContext;const o=AC.prototype.createOscillator;
  AC.prototype.createOscillator=function(){window.__osc++;return o.call(this);};});
await p.goto(new URL('../public/index.html', import.meta.url).href);
const pass=[],fail=[]; const chk=(c,n,x='')=>(c?pass:fail).push(n+(c?'':' :: '+x));

// ---- 뇌 대시보드 (3D 점구름) ----
const dash = await p.evaluate(()=>({
  영역:Object.keys(Region.REGIONS),
  칩:[...document.querySelectorAll('.legend-chip b')].map(x=>x.textContent),
  칩색:[...document.querySelectorAll('.legend-chip')].map(x=>x.style.getPropertyValue('--c')),
  캔버스있음:!!document.getElementById('home-brain-canvas'),
  옛그림:document.querySelectorAll('#home-brain, .region-brain').length,
}));
chk(dash.영역.length===4 && !dash.영역.includes('occipital'),
    'E1 원래 4개 영역으로 복귀 (후두엽 없음)', JSON.stringify(dash.영역));
chk(dash.칩.length===4 && dash.칩.includes('두정엽') && dash.칩.includes('측두엽')
    && dash.칩.includes('좌측 전두엽') && dash.칩.includes('우측 전두엽'),
    'E2 색 칩 4개', JSON.stringify(dash.칩));
chk(dash.칩색.every(c=>/^#[0-9a-f]{6}$/i.test(c.trim())), 'E3 칩마다 영역 색', JSON.stringify(dash.칩색));
chk(dash.캔버스있음 && dash.옛그림===0, 'E4 2D SVG 그림이 3D 캔버스로 교체됨', JSON.stringify(dash));

// 캔버스에 실제로 뇌가 그려졌는가 (검은 배경만 있으면 안 된다)
const drawn = await p.evaluate(()=>{
  const c=document.getElementById('home-brain-canvas');
  const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
  let lit=0, hues=new Set();
  for(let i=0;i<d.length;i+=4){
    const [r,g,b2]=[d[i],d[i+1],d[i+2]];
    if(r+g+b2>150){ lit++; hues.add(`${r>>6},${g>>6},${b2>>6}`); }
  }
  return {밝은픽셀:lit, 색가짓수:hues.size};
});
chk(drawn.밝은픽셀>2000, 'E5 캔버스에 뇌가 그려짐', JSON.stringify(drawn));
chk(drawn.색가짓수>=4, 'E6 영역별로 색이 다름', JSON.stringify(drawn));

// 끌면 회전하고, 끌기만으로는 선택되지 않는다
const cv = await p.$('#home-brain-canvas');
const box = await cv.boundingBox();
const y0 = await p.evaluate(()=>Brain3D.mount(document.getElementById('home-brain-canvas'),{}).yaw);
await p.mouse.move(box.x+box.width/2, box.y+box.height/2);
await p.mouse.down();
await p.mouse.move(box.x+box.width/2+90, box.y+box.height/2, {steps:6});
await p.mouse.up();
const y1 = await p.evaluate(()=>Brain3D.mount(document.getElementById('home-brain-canvas'),{}).yaw);
chk(Math.abs(y1-y0)>0.3, 'E7 끌면 회전함', `${y0.toFixed(2)} -> ${y1.toFixed(2)}`);
chk(await p.evaluate(()=>!!document.querySelector('.dash-hint')), 'E8 끌기만으로는 선택되지 않음');

// 탭하면 영역이 선택된다
let picked=null;
for (const [dx,dy] of [[0,-30],[-60,0],[60,10],[0,40],[-30,40],[40,-40]]) {
  await p.mouse.click(box.x+box.width/2+dx, box.y+box.height/2+dy);
  await p.waitForTimeout(120);
  picked = await p.evaluate(()=>{const c=document.querySelector('.legend-chip.on b');return c?c.textContent:null;});
  if(picked) break;
}
chk(!!picked, 'E9 뇌를 탭하면 영역이 선택됨', String(picked));

// 불빛 기억은 원래 분류대로 측두엽에 있어야 한다
const opened = await p.evaluate(()=>{
  Region.open('temporal');
  return {제목:document.getElementById('region-title').textContent,
          게임:[...document.querySelectorAll('#region-games .region-game-name')].map(x=>x.textContent),
          영역페이지캔버스:!!document.getElementById('region-brain-canvas')};
});
chk(opened.제목==='측두엽' && opened.게임.includes('불빛 기억'),
    'E10 불빛 기억이 측두엽에 있음', JSON.stringify(opened));
chk(opened.영역페이지캔버스, 'E11 영역 페이지도 3D 뇌 사용');

// 게임이 결과 화면에서 말하는 영역이 실제 등록된 영역과 맞는지
// (게임을 다른 영역으로 옮기고 문구를 안 고치면 엉뚱한 곳을 훈련했다고 알려준다)
const label = await p.evaluate(async ()=>{
  const where = {};
  for (const reg of Object.values(Region.REGIONS))
    for (const g of reg.games) where[g.name] = reg.title;
  Pixel.start();
  const lit=[...document.querySelectorAll('.pcell.lit')].map(c=>+c.dataset.i);
  await new Promise(r=>setTimeout(r,1000+lit.length*300+120));
  const cells=[...document.querySelectorAll('.pcell')];
  lit.forEach(i=>cells[i].click());
  await new Promise(r=>setTimeout(r,400));
  // 마지막 판까지 가지 않아도 결과 문구 틀은 같으므로 게임을 끝까지 돌린다
  return { 등록:where['불빛 기억'] };
});
chk(label.등록==='측두엽', 'E12 불빛 기억은 측두엽 소속', JSON.stringify(label));
chk(!(await p.evaluate(()=>document.documentElement.innerHTML.includes('후두엽'))),
    'E13 없앤 후두엽이 문구에 남아 있지 않음');
await p.evaluate(()=>goHome());
await p.evaluate(()=>goHome());

// ---- 불빛 기억 게임 ----
const g = await p.evaluate(async ()=>{
  const log=[]; Pixel.start();
  for(let r=1;r<=8;r++){
    const banner=document.getElementById('pixel-level-banner').textContent;
    const litBefore=[...document.querySelectorAll('.pcell.lit')].map(c=>+c.dataset.i);
    const disabledWhileShowing=[...document.querySelectorAll('.pcell')].every(c=>c.disabled);
    await new Promise(r2=>setTimeout(r2, 1000+litBefore.length*300+120));
    const stillLit=document.querySelectorAll('.pcell.lit').length;
    const enabled=[...document.querySelectorAll('.pcell')].some(c=>!c.disabled);
    const before=window.__osc;
    // 켜졌던 칸을 그대로 짚는다
    const cs=[...document.querySelectorAll('.pcell')];
    litBefore.forEach(i=>cs[i].click());
    const 고른뒤안내=document.getElementById('pixel-guide').textContent;
    await new Promise(r2=>setTimeout(r2,400));   // 채점까지 기다린다
    log.push({r, banner, n:litBefore.length, disabledWhileShowing, stillLit, enabled, 고른뒤안내,
              소리:window.__osc>before,
              fb:document.getElementById('pixel-feedback').innerText});
    await new Promise(r2=>setTimeout(r2,900));
  }
  return {log, screen:document.querySelector('.screen.active').id,
          score:document.getElementById('result-score').textContent};
});
chk(g.log.every(r=>r.disabledWhileShowing), 'F1 보여주는 동안은 못 누름');
chk(g.log.every(r=>r.stillLit===0 && r.enabled), 'F2 불이 꺼진 뒤 입력 가능');
chk(JSON.stringify(g.log.map(r=>r.n))==='[3,3,4,4,5,5,6,6]', 'F3 칸 수가 3→6으로 늘어남', JSON.stringify(g.log.map(r=>r.n)));
chk(g.log.every(r=>r.banner===r.n+'칸'), 'F4 배너에 칸 수 표시', JSON.stringify(g.log.map(r=>r.banner)));
chk(g.log.every(r=>r.fb.includes('정답')), 'F5 제대로 짚으면 정답', JSON.stringify(g.log.map(r=>r.fb)));
chk(g.log.every(r=>/\(\d+\/\d+\)/.test(r.고른뒤안내)||r.고른뒤안내.includes('맞히셨')),
    'F5b 고르는 동안 진행 상황 표시', JSON.stringify(g.log.map(r=>r.고른뒤안내)));
chk(g.log.every(r=>r.소리), 'F6 정답마다 효과음', JSON.stringify(g.log.map(r=>r.소리)));
chk(g.screen==='screen-result' && g.score==='8점', 'F7 전부 맞히면 8/8', g.screen+' '+g.score);

// 오답 처리: 틀린 칸을 눌러도 개수를 다 채울 때까지 채점하지 않아야 한다
const wrong = await p.evaluate(async ()=>{
  Pixel.start();
  const lit=[...document.querySelectorAll('.pcell.lit')].map(c=>+c.dataset.i);
  await new Promise(r=>setTimeout(r,1000+lit.length*300+120));
  const cells=[...document.querySelectorAll('.pcell')];
  const fb=()=>document.getElementById('pixel-feedback').innerText;
  const guide=()=>document.getElementById('pixel-guide').textContent;
  const wrongIdx=+cells.find(c=>!lit.includes(+c.dataset.i)).dataset.i;

  // 첫 칸부터 일부러 틀리게 누른다
  cells[wrongIdx].click();
  const 틀린칸직후={fb:fb(), guide:guide(),
    아직판정없음:document.querySelectorAll('.pcell.miss,.pcell.hit,.pcell.reveal').length===0,
    선택표시:document.querySelectorAll('.pcell.picked').length,
    계속입력가능:cells.some(c=>!c.disabled)};

  // 되돌리기: 같은 칸을 다시 눌러 선택 취소
  cells[wrongIdx].click();
  const 취소후={선택수:document.querySelectorAll('.pcell.picked').length, guide:guide()};
  cells[wrongIdx].click(); // 다시 고른다

  // 나머지는 정답 칸으로 채워 개수를 맞춘다 (틀린 것 1 + 맞는 것 n-1)
  lit.slice(0, lit.length-1).forEach(i=>cells[i].click());
  const 채우는중={fb:fb(), 입력가능:cells.some(c=>!c.disabled)};
  await new Promise(r=>setTimeout(r,400)); // 채점 대기

  return {n:lit.length, 틀린칸직후, 취소후, 채우는중,
          fb:fb(), guide:guide(),
          hit:document.querySelectorAll('.pcell.hit').length,
          miss:document.querySelectorAll('.pcell.miss').length,
          reveal:document.querySelectorAll('.pcell.reveal').length,
          입력잠김:cells.every(c=>c.disabled)};
});
chk(wrong.틀린칸직후.아직판정없음 && wrong.틀린칸직후.계속입력가능,
    'G1 틀린 칸을 눌러도 바로 채점하지 않음', JSON.stringify(wrong.틀린칸직후));
chk(wrong.틀린칸직후.선택표시===1 && wrong.틀린칸직후.guide.includes('(1/'),
    'G2 고른 칸은 표시되고 진행 상황이 보임', JSON.stringify(wrong.틀린칸직후));
chk(wrong.취소후.선택수===0 && wrong.취소후.guide.includes('(0/'),
    'G3 다시 누르면 선택 취소', JSON.stringify(wrong.취소후));
chk(wrong.채우는중.fb==='' , 'G4 개수를 채우기 전에는 채점 안 됨', JSON.stringify(wrong.채우는중));
chk(wrong.hit===wrong.n-1 && wrong.miss===1 && wrong.reveal===1,
    'G5 채운 뒤 내가 고른 것과 정답을 함께 보여줌', JSON.stringify(wrong));
chk(wrong.fb.includes(`${wrong.n}칸 중 ${wrong.n-1}칸`), 'G6 몇 칸 맞았는지 알려줌', wrong.fb);
chk(wrong.guide.includes('놓친 곳'), 'G7 놓친 칸 안내', wrong.guide);
chk(wrong.입력잠김, 'G8 채점 후 입력 잠김');

// 나가기 (세션 가드)
await p.evaluate(()=>{Pixel.start();});
await p.click('#screen-pixel .btn-back');
await p.waitForTimeout(3000);
chk(await p.evaluate(()=>document.querySelector('.screen.active').id)==='screen-home','G4 보여주는 도중 나가기');

await b.close();
console.log('PASS '+pass.length+'\n  '+pass.join('\n  '));
if(fail.length) console.log('FAIL '+fail.length+'\n  '+fail.join('\n  '));
if(errs.length) console.log('JS ERRORS:\n  '+errs.join('\n  '));
process.exit(fail.length||errs.length?1:0);
