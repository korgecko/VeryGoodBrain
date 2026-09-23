import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage();
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type()==='error' && !m.text().includes('Expected length')) errs.push('CONSOLE: '+m.text()); });
await p.goto('file:///home/user/tasks_prac/index.html');
const pass=[],fail=[]; const chk=(c,n,x='')=>(c?pass:fail).push(n+(c?'':' :: '+x));

// ===== 출석 스탬프 =====
let a = await p.evaluate(() => ({
  cells: document.querySelectorAll('#home-attend .attend-day').length,
  dow: document.querySelectorAll('#home-attend .attend-dow').length,
  done: document.querySelectorAll('#home-attend .attend-day.done').length,
  today: document.querySelectorAll('#home-attend .attend-day.today').length,
  txt: document.querySelector('.attend-streak').innerText.replace(/\s+/g,' '),
}));
chk(a.cells===14 && a.dow===7, 'A1 2주 달력 14칸 + 요일 7칸', JSON.stringify(a));
chk(a.today===1, 'A2 오늘 칸 정확히 1개', JSON.stringify(a));
chk(a.done===0 && a.txt==='연속 0일 · 누적 0일', 'A3 첫 방문엔 도장 없음', JSON.stringify(a));

// 게임을 하나 끝내면 오늘 도장
await p.evaluate(async () => {
  Memory.start();
  const by={}; [...document.querySelectorAll('#memory-grid .mcard')].forEach(c=>(by[c.dataset.animal]??=[]).push(c));
  for (const k of Object.keys(by)) { by[k][0].click(); by[k][1].click(); await new Promise(r=>setTimeout(r,30)); }
  await new Promise(r=>setTimeout(r,800));
  goHome();
});
a = await p.evaluate(() => ({
  done: document.querySelectorAll('#home-attend .attend-day.done').length,
  bothClasses: document.querySelectorAll('#home-attend .attend-day.done.today').length,
  txt: document.querySelector('.attend-streak').innerText.replace(/\s+/g,' '),
  msg: document.querySelector('.attend-msg').innerText,
}));
chk(a.done===1 && a.bothClasses===1, 'A4 게임 완료 후 오늘 도장', JSON.stringify(a));
chk(a.txt==='연속 1일 · 누적 1일', 'A5 연속/누적 집계', JSON.stringify(a));
chk(a.msg.includes('마치셨어요'), 'A6 완료 안내문구', a.msg);

// 연속 3일 시나리오 (어제/그저께를 저장소에 넣고 확인)
a = await p.evaluate(() => {
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const days=[]; for (let i=0;i<3;i++){const d=new Date();d.setDate(d.getDate()-i);days.push(ymd(d));}
  days.push('2020-01-01'); // 오래된 기록은 연속에 포함되면 안 됨
  localStorage.setItem('vgb_days', JSON.stringify(days));
  Attend.render();
  return document.querySelector('.attend-streak').innerText.replace(/\s+/g,' ');
});
chk(a==='연속 3일 · 누적 4일', 'A7 연속 3일 / 누적 4일 (옛 기록 제외)', a);
// 손상된 데이터
a = await p.evaluate(() => { localStorage.setItem('vgb_days','{깨진값'); Attend.render();
  return document.querySelector('.attend-streak').innerText.replace(/\s+/g,' '); });
chk(a==='연속 0일 · 누적 0일', 'A8 저장소 손상 시에도 동작', a);

// ===== 같은 그림 판별: 제한시간 =====
let sp = await p.evaluate(() => { Speed.start(); return document.getElementById('speed-timer-row').className; });
chk(sp.includes('hidden'), 'S1 기억 단계에선 타이머 숨김', sp);
sp = await p.evaluate(() => { Speed.begin(); return document.getElementById('speed-timer-row').className; });
chk(!sp.includes('hidden'), 'S2 시작하면 타이머 표시', sp);
const w0 = await p.evaluate(() => document.getElementById('speed-timer').getBoundingClientRect().width);
await p.waitForTimeout(2000);
const w1 = await p.evaluate(() => document.getElementById('speed-timer').getBoundingClientRect().width);
chk(w0 > 150 && w1 > 20 && w1 < w0 * 0.75, 'S3a 타이머 막대가 실제로 줄어듦', `${w0.toFixed(0)}px -> ${w1.toFixed(0)}px`);
sp = await p.evaluate(() => document.getElementById('speed-timer-num').textContent);
chk(/^[12]초$/.test(sp), 'S3b 남은 시간 카운트다운', sp);
await p.waitForTimeout(2600);   // 4초 초과
sp = await p.evaluate(() => ({ fb: document.getElementById('speed-feedback').innerText, no: document.getElementById('speed-no').textContent }));
chk(sp.fb.includes('시간이 지났어요'), 'S4 시간 초과 처리', JSON.stringify(sp));
await p.waitForTimeout(1700);
sp = await p.evaluate(() => document.getElementById('speed-no').textContent);
chk(sp==='2', 'S5 시간 초과 후 다음 문제로', sp);
// 시간 초과는 오답 -> 만점이 될 수 없음
await p.evaluate(() => Speed.quit());

// ===== 색깔 글자: 2단계 규칙 =====
const HEX = { 'rgb(220, 38, 38)':'빨강','rgb(37, 99, 235)':'파랑','rgb(147, 51, 234)':'보라','rgb(22, 163, 74)':'초록' };
const stroop = await p.evaluate(async (HEX) => {
  const log=[]; Stroop.start();
  let prevWord=null;
  for (let n=1;n<=10;n++){
    const el=document.getElementById('stroop-word');
    const word=el.textContent;
    const ink=HEX[getComputedStyle(el).color];
    const banner=document.getElementById('stroop-level-banner').textContent;
    const ref = n>=6 ? prevWord : word;           // 6번부터 '직전 글자'가 기준
    const expect = (ref===ink);
    log.push({n,word,ink,banner,ref,expect});
    prevWord=word;
    Stroop.answer(expect);                         // 규칙대로 답하기
    await new Promise(r=>setTimeout(r,900));
  }
  return { log, screen:document.querySelector('.screen.active').id,
           score:document.getElementById('result-score').textContent };
}, HEX);
chk(stroop.log.slice(0,5).every(r=>r.banner==='1단계'), 'C1 1~5번은 1단계', JSON.stringify(stroop.log.map(r=>r.banner)));
chk(stroop.log.slice(5).every(r=>r.banner==='2단계'), 'C2 6~10번은 2단계', JSON.stringify(stroop.log.map(r=>r.banner)));
chk(stroop.log.every(r=>r.ink), 'C3 잉크색이 4색 안에 있음', JSON.stringify(stroop.log));
chk(stroop.score==='10점', 'C4 규칙대로 답하면 만점 (2단계 판정 정확)', stroop.score+' '+JSON.stringify(stroop.log));
const m = stroop.log.slice(5).filter(r=>r.expect).length;
chk(m>=1 && m<=9, 'C5 2단계 정답이 한쪽으로 치우치지 않음', '일치 '+m+'/5');

// ===== 문맥 퀴즈: 12문항 중 5개 =====
await p.evaluate(() => goHome());
const quizRuns = await p.evaluate(async () => {
  const runs=[];
  for (let t=0;t<12;t++){
    Quiz.start(); const seen=[];
    for (let i=0;i<5;i++){
      seen.push(document.getElementById('quiz-question').textContent+'|'+document.getElementById('quiz-passage').innerText.slice(0,20));
      document.querySelector('.quiz-choice').click(); Quiz.next();
    }
    runs.push({seen, max:document.getElementById('result-max').textContent});
  }
  return runs;
});
chk(quizRuns.every(r=>r.seen.length===5 && new Set(r.seen).size===5), 'Q1 한 판에 서로 다른 5문제', JSON.stringify(quizRuns[0].seen));
chk(quizRuns.every(r=>r.max==='/ 5점 만점'), 'Q2 만점 기준 5점', quizRuns[0].max);
chk(new Set(quizRuns.flatMap(r=>r.seen)).size>=10, 'Q3 여러 판 돌리면 12문항이 두루 출제', String(new Set(quizRuns.flatMap(r=>r.seen)).size));

await b.close();
console.log('PASS '+pass.length+'\n  '+pass.join('\n  '));
if(fail.length) console.log('FAIL '+fail.length+'\n  '+fail.join('\n  '));
if(errs.length) console.log('JS ERRORS:\n  '+errs.join('\n  '));
process.exit(fail.length||errs.length?1:0);
