import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({viewport:{width:390,height:900}});
const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
p.on('console',m=>{ if(m.type()==='error') errs.push('CONSOLE: '+m.text()); });
await p.addInitScript(()=>{window.__osc=0;const AC=window.AudioContext;const o=AC.prototype.createOscillator;
  AC.prototype.createOscillator=function(){window.__osc++;return o.call(this);};});
await p.goto('file:///home/user/tasks_prac/index.html');
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
    litBefore.forEach(i=>document.querySelectorAll('.pcell')[i].click());
    log.push({r, banner, n:litBefore.length, disabledWhileShowing, stillLit, enabled,
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
chk(g.log.every(r=>r.소리), 'F6 정답마다 효과음', JSON.stringify(g.log.map(r=>r.소리)));
chk(g.screen==='screen-result' && g.score==='8점', 'F7 전부 맞히면 8/8', g.screen+' '+g.score);

// 오답 처리
const wrong = await p.evaluate(async ()=>{
  Pixel.start();
  const lit=[...document.querySelectorAll('.pcell.lit')].map(c=>+c.dataset.i);
  await new Promise(r=>setTimeout(r,1000+lit.length*300+120));
  const cells=[...document.querySelectorAll('.pcell')];
  const wrongIdx=cells.findIndex(c=>!lit.includes(+c.dataset.i));
  cells[wrongIdx].click();
  return {fb:document.getElementById('pixel-feedback').innerText,
          miss:document.querySelectorAll('.pcell.miss').length,
          reveal:document.querySelectorAll('.pcell.reveal').length, n:lit.length,
          입력잠김:cells.every(c=>c.disabled)};
});
chk(wrong.fb.includes('아쉬워요') && wrong.miss===1, 'G1 틀린 칸 표시', JSON.stringify(wrong));
chk(wrong.reveal===wrong.n, 'G2 못 찾은 칸을 알려줌', JSON.stringify(wrong));
chk(wrong.입력잠김, 'G3 오답 후 입력 잠김');

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
