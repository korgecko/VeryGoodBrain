import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({viewport:{width:400,height:900}});
const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
p.on('console',m=>{ if(m.type()==='error' && !m.text().includes('Expected length')) errs.push('CONSOLE: '+m.text()); });
await p.goto('file:///home/user/tasks_prac/index.html');
const pass=[],fail=[]; const chk=(c,n,x='')=>(c?pass:fail).push(n+(c?'':' :: '+x));

// 테스트가 스스로 정답을 알도록 표를 따로 들고 있는다 (게임 로직과 독립적으로 대조)
const TABLE = {
  강아지:['animal','noun'], 고양이:['animal','noun'], 짖다:['animal','verb'], 뛰어놀다:['animal','verb'],
  복슬복슬한:['animal','adj'], 포근한:['animal','adj'],
  버스:['vehicle','noun'], 자전거:['vehicle','noun'], 달리다:['vehicle','verb'], 멈추다:['vehicle','verb'],
  빠른:['vehicle','adj'], 시끄러운:['vehicle','adj'],
  의사:['hospital','noun'], 주사:['hospital','noun'], 진찰하다:['hospital','verb'], 낫다:['hospital','verb'],
  따끔한:['hospital','adj'], 깨끗한:['hospital','adj'],
  사과:['food','noun'], 국수:['food','noun'], 씹다:['food','verb'], 끓이다:['food','verb'],
  달콤한:['food','adj'], 뜨거운:['food','adj'],
};

// ---- 한 판을 규칙대로 완주 ----
const run = await p.evaluate(async (TABLE) => {
  const log=[]; Sort.start();
  const $ = s => document.querySelector(s);
  for (let n=1;n<=16;n++){
    const beforeFlip = {
      flipped: $('#sort-card').classList.contains('flipped'),
      binsDisabled: [...document.querySelectorAll('.sort-bin')].every(b=>b.disabled),
      left: $('#sort-left').textContent,
      banner: $('#sort-level-banner').textContent,
      notice: $('#sort-feedback').innerText,
      allCounts: [...document.querySelectorAll('.sort-bin-count')].map(x=>x.textContent),
    };
    Sort.flip();
    const word = $('#sort-word').textContent;
    const bins = [...document.querySelectorAll('.sort-bin')];
    const keys = bins.map(x=>x.dataset.key);
    const mode = keys.includes('animal') ? 'theme' : 'role';
    const right = TABLE[word][mode==='theme'?0:1];
    const target = bins.find(x=>x.dataset.key===right);
    log.push({n, word, mode, right, keys, ...beforeFlip,
              enabledAfterFlip: bins.some(x=>!x.disabled),
              countBefore: target.querySelector('.sort-bin-count').textContent});
    target.click();
    log[log.length-1].countAfter = target.querySelector('.sort-bin-count').textContent;
    await new Promise(r=>setTimeout(r,900));
  }
  return { log, screen: $('.screen.active').id,
           score: $('#result-score').textContent, max: $('#result-max').textContent };
}, TABLE);
const L = run.log;

chk(L.every(r=>!r.flipped), 'D1 매 카드가 엎인 상태로 시작', JSON.stringify(L.filter(r=>r.flipped).map(r=>r.n)));
chk(L.every(r=>r.binsDisabled), 'D2 뒤집기 전엔 분류함 못 누름', JSON.stringify(L.filter(r=>!r.binsDisabled).map(r=>r.n)));
chk(L.every(r=>r.enabledAfterFlip), 'D3 뒤집으면 분류함 활성화');
chk(L.every(r=>r.left===String(16-r.n+1)), 'D4 남은 장수 표시', JSON.stringify(L.map(r=>r.left)));
chk(new Set(L.map(r=>r.word)).size===16, 'D5 한 판에 같은 낱말 중복 없음', JSON.stringify(L.map(r=>r.word)));

// 단계 구성
const stages = L.map(r=>r.banner);
chk(stages.slice(0,5).every(x=>x==='1단계') && stages.slice(5,10).every(x=>x==='2단계')
    && stages.slice(10).every(x=>x==='3단계'), 'D6 1~5/6~10/11~16 단계 구분', JSON.stringify(stages));
chk(L.slice(0,5).every(r=>r.mode==='theme'), 'D7 1단계는 종류(4함)', JSON.stringify(L.slice(0,5).map(r=>r.mode)));
chk(L.slice(0,5).every(r=>r.keys.length===4), 'D8 종류 분류함 4개', JSON.stringify(L[0].keys));
chk(L.slice(5,10).every(r=>r.mode==='role' && r.keys.length===3), 'D9 2단계는 말의 쓰임(3함)', JSON.stringify(L.slice(5,10).map(r=>r.mode)));
// 3단계: 11~13 한 기준, 14~16 반대 기준
const s3=L.slice(10).map(r=>r.mode);
chk(s3[0]===s3[1] && s3[1]===s3[2] && s3[3]===s3[4] && s3[4]===s3[5] && s3[2]!==s3[3],
    'D10 3단계에서 14번째에 기준이 뒤집힘', JSON.stringify(s3));

// 규칙 변경 안내
chk(L[5].notice.includes('기준이 바뀌었어요'), 'D11 2단계 진입 시 안내', L[5].notice);
chk(L[13].notice.includes('기준이 바뀌었어요'), 'D12 3단계 전환 시 안내', L[13].notice);
const changed = L.map((r,i)=>(i>0 && r.mode!==L[i-1].mode) ? r.n : null).filter(Boolean);
const noticed = L.filter(r=>r.notice.includes('기준이 바뀌었어요')).map(r=>r.n);
chk(JSON.stringify(changed)===JSON.stringify(noticed),
    'D13 기준이 바뀐 카드에서만 안내', `바뀜 ${JSON.stringify(changed)} / 안내 ${JSON.stringify(noticed)}`);
chk(changed.length===3 && JSON.stringify(changed)===JSON.stringify([6,11,14]),
    'D13b 6·11·14번에서 기준이 바뀜', JSON.stringify(changed));

// 모은 장수
chk(L.every(r=>parseInt(r.countAfter)===parseInt(r.countBefore)+1), 'D14 정답 시 해당 함 장수 +1');
// 기준이 바뀐 카드에서는 모든 함이 0장, 아니면 그 구간에서 넣은 만큼 쌓여 있어야 한다
let lastChange = 0;
const stackOk = L.map((r,i) => {
  if (i>0 && r.mode!==L[i-1].mode) lastChange = i;
  const sum = r.allCounts.reduce((a,c)=>a+parseInt(c),0);
  return { n:r.n, sum, expect: i - lastChange, counts:r.allCounts };
});
chk(stackOk.every(x=>x.sum===x.expect), 'D15 기준이 바뀌면 0부터, 아니면 넣은 만큼 쌓임',
    JSON.stringify(stackOk.filter(x=>x.sum!==x.expect)));

chk(run.screen==='screen-result' && run.score==='16점' && run.max==='/ 16점 만점',
    'D16 규칙대로 풀면 16/16 (판정 정확)', JSON.stringify(run).slice(0,200));

// ---- 오답 처리 ----
const wrong = await p.evaluate(async (TABLE) => {
  Sort.start(); Sort.flip();
  const word=document.getElementById('sort-word').textContent;
  const bins=[...document.querySelectorAll('.sort-bin')];
  // 1단계이므로 기준은 '종류'. 정답이 아닌 함을 골라 일부러 틀린다
  const right=TABLE[word][0];
  bins.find(x=>x.dataset.key!==right).click();
  const fb=document.getElementById('sort-feedback').innerText;
  const nope=document.querySelector('.sort-bin.nope')!==null;
  await new Promise(r=>setTimeout(r,1900));
  return { word, right, fb, nope, no:document.getElementById('sort-no').textContent };
}, TABLE);
chk(wrong.fb.includes(wrong.word) && wrong.fb.includes('❌') && wrong.nope,
    'D17 오답 시 정답 알려주고 함이 빨갛게', JSON.stringify(wrong));
chk(wrong.no==='2', 'D18 오답 후 다음 카드로', wrong.no);

// ---- 나가기 (세션 가드) ----
await p.evaluate(() => { Sort.start(); Sort.flip(); document.querySelector('.sort-bin').click(); });
await p.click('#screen-sort .btn-back');
await p.waitForTimeout(2200);
chk(await p.evaluate(()=>document.querySelector('.screen.active').id)==='screen-home', 'D19 피드백 중 나가기');

// ---- 홈/영역 페이지 등록 ----
const reg = await p.evaluate(() => {
  Region.open('rfrontal');
  return [...document.querySelectorAll('#region-games .region-game-name')].map(x=>x.textContent);
});
chk(reg.includes('낱말 나누기'), 'D20 우측 전두엽에 등록됨', JSON.stringify(reg));

await b.close();
console.log('PASS '+pass.length+'\n  '+pass.join('\n  '));
if(fail.length) console.log('FAIL '+fail.length+'\n  '+fail.join('\n  '));
if(errs.length) console.log('JS ERRORS:\n  '+errs.join('\n  '));
process.exit(fail.length||errs.length?1:0);
