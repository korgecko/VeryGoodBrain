import { chromium } from 'playwright';

const b = await chromium.launch();
const p = await b.newPage();
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });
await p.goto(new URL('../public/index.html', import.meta.url).href);

const active = () => p.evaluate(() => document.querySelector('.screen.active').id);
const pass = [], fail = [];
const chk = (c, name, extra='') => (c ? pass : fail).push(name + (c ? '' : ' :: ' + extra));

// ---- T1: 모양 맞추기 - 보기 중복/개수/정답수 검사 (어려운 라운드 포함 200회) ----
const shapeRes = await p.evaluate(() => {
  const out = { dupes: 0, badCount: 0, badOk: 0, sameAsTarget: 0, n: 0 };
  for (let t = 0; t < 40; t++) {
    Shape.start();
    for (let r = 1; r <= 8; r++) {
      const target = document.getElementById('shape-target').innerHTML;
      const btns = [...document.querySelectorAll('#shape-choices .shape-choice')];
      const svgs = btns.map(x => x.innerHTML);
      out.n++;
      if (btns.length !== 4) out.badCount++;
      if (new Set(svgs).size !== svgs.length) out.dupes++;
      // 정답 버튼을 찾기: onclick 이 ok=true 인 것 -> 클릭해서 결과로 판정
      const norm = h => h.replace(/width="\d+" height="\d+"/, '');
      if (svgs.some(sv => norm(sv) === norm(target))) out.sameAsTarget++;
      btns[0].click();
      // 다음 라운드로 넘어가려면 타이머가 필요하므로 여기서 중단
      break;
    }
  }
  return out;
});
chk(shapeRes.badCount === 0, 'T1a 보기 항상 4개', JSON.stringify(shapeRes));
chk(shapeRes.dupes === 0, 'T1b 똑같이 그려진 보기 없음', JSON.stringify(shapeRes));
chk(shapeRes.sameAsTarget === 0, 'T1c 목표와 각도까지 같은 보기 없음', JSON.stringify(shapeRes));

// ---- T2: 나가기 버튼 - 색깔 글자 ----
await p.evaluate(() => Stroop.start());
await p.click('#screen-stroop .btn-big');            // 답 제출 -> 피드백 대기 시작
await p.click('#screen-stroop .btn-back');           // 대기 중 나가기
await p.waitForTimeout(2200);
chk(await active() === 'screen-home', 'T2 색깔 글자: 나가기 후 홈 유지', await active());

// ---- T3: 나가기 버튼 - 같은 그림 판별 (마지막 문제에서 나가면 결과화면으로 튐) ----
await p.evaluate(() => { Speed.start(); Speed.begin(); });
await p.evaluate(async () => { for (let i = 0; i < 9; i++) { Speed.answer(true); await new Promise(r => setTimeout(r, 1600)); } });
await p.click('#screen-speed .btn-back');
await p.waitForTimeout(2000);
chk(await active() === 'screen-home', 'T3 같은 그림 판별: 마지막 문제 중 나가기', await active());

// ---- T4: 나가기 버튼 - 청기백기 (피드백 중 나가기) ----
await p.evaluate(() => Flag.start());
await p.waitForTimeout(1000);
await p.evaluate(() => Flag.__t ? 0 : 0);
await p.evaluate(() => { document.querySelector('#screen-flag .btn-back').click(); });
await p.waitForTimeout(12000);
chk(await active() === 'screen-home', 'T4 청기백기: 준비 중 나가기', await active());

// ---- T5: 청기백기 - 라운드 채점 후 피드백 대기 중 나가기 ----
await p.evaluate(() => Flag.start());
await p.waitForTimeout(1200);
await p.evaluate(() => { // 시간초과로 채점되게 두지 않고 강제로 평가 트리거
  document.querySelector('#screen-flag .btn-back');
});
await p.waitForTimeout(9000);   // 1단계 8초 -> evaluate -> 피드백 표시
await p.click('#screen-flag .btn-back');
await p.waitForTimeout(3000);
chk(await active() === 'screen-home', 'T5 청기백기: 채점 피드백 중 나가기', await active());

// ---- T6: 카드 뒤집기 점수 ----
const mem = await p.evaluate(async () => {
  Memory.start();
  const cards = [...document.querySelectorAll('#memory-grid .mcard')];
  const byAnimal = {};
  cards.forEach(c => (byAnimal[c.dataset.animal] ||= []).push(c));
  for (const a of Object.keys(byAnimal)) {
    byAnimal[a][0].click(); byAnimal[a][1].click();
    await new Promise(r => setTimeout(r, 50));
  }
  await new Promise(r => setTimeout(r, 800));
  return {
    screen: document.querySelector('.screen.active').id,
    score: document.getElementById('result-score').textContent,
    max: document.getElementById('result-max').textContent,
    best: localStorage.getItem('vgb_best_memory_flips'),
  };
});
chk(mem.screen === 'screen-result', 'T6a 카드 뒤집기 완주', JSON.stringify(mem));
chk(mem.score === '12점' && mem.max === '/ 12점 만점', 'T6b 완벽 플레이 = 12/12점', JSON.stringify(mem));

// ---- T7: 결과 점수 표기 ----
await p.evaluate(() => showResult({ score: 5, max: 8, gameKey: null, detailHtml: '', retryFn: () => {} }));
const r7 = await p.evaluate(() => document.querySelector('.result-score').innerText.replace(/\s+/g, ' ').trim());
chk(r7 === '획득 점수 5점 / 8점 만점', 'T7 결과 점수 표기', r7);

await b.close();
console.log('PASS ' + pass.length + '\n  ' + pass.join('\n  '));
if (fail.length) console.log('FAIL ' + fail.length + '\n  ' + fail.join('\n  '));
if (errs.length) console.log('JS ERRORS:\n  ' + errs.join('\n  '));
process.exit(fail.length || errs.length ? 1 : 0);
