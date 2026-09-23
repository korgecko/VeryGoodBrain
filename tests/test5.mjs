import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({viewport:{width:390,height:900}});
const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
p.on('console',m=>{ if(m.type()==='error') errs.push('CONSOLE: '+m.text()); });
await p.addInitScript(()=>{window.__osc=0;const AC=window.AudioContext;const o=AC.prototype.createOscillator;
  AC.prototype.createOscillator=function(){window.__osc++;return o.call(this);};});
await p.goto(new URL('../public/index.html', import.meta.url).href);
const pass=[],fail=[]; const chk=(c,n,x='')=>(c?pass:fail).push(n+(c?'':' :: '+x));

// ---- 후두엽이 대시보드에 들어왔는가 ----
const dash = await p.evaluate(()=>{
  const svg=document.querySelector('#home-brain svg');
  const regions=[...svg.querySelectorAll('path[data-region]')].map(e=>e.dataset.region);
  const labels=[...svg.querySelectorAll('g[data-region]')].map(e=>e.dataset.region);
  return {부위:regions, 라벨:labels};
});
chk(dash.부위.includes('occipital'), 'E1 후두엽이 누를 수 있는 부위가 됨', JSON.stringify(dash.부위));
chk(dash.라벨.length===5 && dash.라벨.includes('occipital'), 'E2 라벨 5개', JSON.stringify(dash.라벨));

// 라벨끼리 겹치지 않는가
const overlap = await p.evaluate(()=>{
  const ts=[...document.querySelectorAll('#home-brain svg text')].map(t=>({s:t.textContent,r:t.getBoundingClientRect()}));
  const bad=[];
  for(let i=0;i<ts.length;i++)for(let j=i+1;j<ts.length;j++){
    const a=ts[i].r,c=ts[j].r;
    if(a.left<c.right&&c.left<a.right&&a.top<c.bottom&&c.top<a.bottom) bad.push(ts[i].s+' ↔ '+ts[j].s);
  }
  const svg=document.querySelector('#home-brain svg').getBoundingClientRect();
  const clipped=ts.filter(t=>t.r.right>svg.right+.5||t.r.left<svg.left-.5||t.r.bottom>svg.bottom+.5).map(t=>t.s);
  return {겹침:bad, 잘림:clipped};
});
chk(overlap.겹침.length===0, 'E3 라벨끼리 안 겹침', JSON.stringify(overlap.겹침));
chk(overlap.잘림.length===0, 'E4 라벨 잘림 없음', JSON.stringify(overlap.잘림));

// 지시선이 실제로 해당 부위를 가리키는가
const aim = await p.evaluate(()=>{
  const svg=document.querySelector('#home-brain svg'), pt=svg.createSVGPoint();
  const out={};
  const order=['lfrontal','parietal','rfrontal','temporal','occipital'];
  // 소뇌 줄무늬도 line이라 라벨 지시선(svg 바로 밑)만 고른다
  [...svg.querySelectorAll(':scope > line')].forEach((ln,i)=>{
    const key=order[i];
    const path=svg.querySelector(`path[data-region="${key}"]`);
    // 지시선 끝점을 뇌 좌표계로 되돌려 해당 부위 안에 있는지 확인
    const m=path.getScreenCTM().inverse().multiply(svg.getScreenCTM());
    const q=svg.createSVGPoint(); q.x=+ln.getAttribute('x2'); q.y=+ln.getAttribute('y2');
    const local=q.matrixTransform(m);
    out[key]=path.isPointInFill(local);
  });
  return out;
});
chk(Object.values(aim).every(Boolean), 'E5 지시선 5개 모두 제 부위를 가리킴', JSON.stringify(aim));

// 후두엽 클릭 → 영역 페이지에 게임이 있는가
const opened = await p.evaluate(()=>{
  Region.open('occipital');
  return {제목:document.getElementById('region-title').textContent,
          게임:[...document.querySelectorAll('#region-games .region-game-name')].map(x=>x.textContent)};
});
chk(opened.제목==='후두엽' && opened.게임.includes('불빛 기억'), 'E6 후두엽 페이지에 게임 등록', JSON.stringify(opened));

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
