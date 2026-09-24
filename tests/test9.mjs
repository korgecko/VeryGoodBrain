// 기록 쌓기 + 추이 그래프
import { chromium } from 'playwright';
const PAGE = new URL('../public/index.html', import.meta.url).href;
const b = await chromium.launch();
const pass = [], fail = [];
const chk = (c, n, x = '') => (c ? pass : fail).push(n + (c ? '' : ' :: ' + x));
const errs = [];
const fresh = async (opt = {}) => {
  const p = await b.newPage({ viewport: { width: 390, height: 900 }, ...opt });
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(PAGE); await p.waitForTimeout(150);
  return p;
};
const seed = (p, g, ss, m = 10) => p.evaluate(([g, ss, m]) => {
  const now = Date.now();
  const old = JSON.parse(localStorage.getItem('vgb_log') || '[]');
  localStorage.setItem('vgb_log', JSON.stringify(old.concat(ss.map((s, i) => ({ g, t: now - (ss.length - i) * 864e5, s, m })))));
}, [g, ss, m]);
const result = (p, score, key = 'stroop', max = 10) => p.evaluate(([score, key, max]) =>
  showResult({ score, max, gameKey: key, detailHtml: '', retryFn: () => {} }), [score, key, max]);
const trend = p => p.evaluate(() => {
  const box = document.getElementById('result-trend');
  return {
    hidden: box.classList.contains('hidden'), msg: box.querySelector('.trend-msg')?.textContent || '',
    dots: box.querySelectorAll('.tr-dot').length, now: box.querySelectorAll('.tr-now').length,
    label: box.querySelector('.tr-label')?.textContent || '', rows: [...box.querySelectorAll('tbody tr')].map(r => r.textContent),
    aria: box.querySelector('.trend-chart')?.getAttribute('aria-label') || '',
  };
});
const logOf = (p, g) => p.evaluate(g => JSON.parse(localStorage.getItem('vgb_log') || '[]').filter(r => r.g === g), g);

// R1 첫 판: 기록이 남고 '첫 기록' 안내, 그래프 없음
let p = await fresh();
await result(p, 6);
let t = await trend(p), log = await logOf(p, 'stroop');
chk(!t.hidden && t.msg.includes('첫 기록') && t.now === 0, 'R1 첫 판 안내', JSON.stringify(t));
chk(log.length === 1 && log[0].s === 6 && log[0].m === 10 && log[0].t > 0, 'R1 기록 저장', JSON.stringify(log));

// R2 두 번째 판: 선 + 이번 점 + 표
await result(p, 8);
t = await trend(p);
chk(t.dots === 1 && t.now === 1 && t.label === '이번 8점', 'R2 그래프 점', JSON.stringify(t));
chk(t.rows.length === 2 && t.rows[0].startsWith('이번') && t.rows[0].endsWith('8점'), 'R2 표 최신이 위', t.rows.join('|'));
chk(t.msg.includes('▲') && t.msg.includes('2점'), 'R2 올랐어요', t.msg);
chk(t.aria.includes('6, 8'), 'R2 읽기 도구용 설명', t.aria);
await p.close();

// R3 평균과 비슷 / 낮음: 낮을 때도 탓하지 않고 숫자 차이를 앞세우지 않는다
p = await fresh();
await seed(p, 'stroop', [6, 7, 6, 7, 6]);
await result(p, 6);
t = await trend(p);
chk(t.msg.includes('비슷') && !t.msg.includes('▲'), 'R3 비슷해요', t.msg);
await result(p, 2);
t = await trend(p);
chk(t.msg.includes('쉬어가는') && !t.msg.includes('▲') && !/-\d/.test(t.msg), 'R3 낮음 문구', t.msg);
// 최근 5판만 평균: 6,7,6,7,6,6 중 마지막 5판 = 7,6,7,6,6 → 6.4
chk(t.msg.includes('6.4점'), 'R3 최근 5판 평균', t.msg);
await p.close();

// R4 그래프는 최근 10판(지난 9 + 이번)까지만
p = await fresh();
await seed(p, 'stroop', [1, 2, 3, 4, 5, 6, 7, 8, 9, 1, 2, 3]);
await result(p, 5);
t = await trend(p);
chk(t.dots === 9 && t.now === 1 && t.rows.length === 10, 'R4 최근 10판', `${t.dots}/${t.rows.length}`);
await p.close();

// R5 게임별 상한: 한 게임을 많이 해도 다른 게임 기록은 남는다
p = await fresh();
await seed(p, 'flag', [3, 4, 5], 8);
await seed(p, 'stroop', Array.from({ length: 60 }, (_, i) => i % 10));
await result(p, 7);
const st = await logOf(p, 'stroop'), fl = await logOf(p, 'flag');
chk(st.length === 60 && st[59].s === 7 && st[0].s === 1, 'R5 게임별 60판 유지', `${st.length} ${st[0].s}`);
chk(fl.length === 3, 'R5 다른 게임 기록 보존', fl.length);
await p.close();

// R6 망가진 저장값·저장 실패에도 결과 화면은 뜬다
p = await fresh();
await p.evaluate(() => localStorage.setItem('vgb_log', '{깨짐'));
await result(p, 4);
t = await trend(p);
chk(t.msg.includes('첫 기록') && (await logOf(p, 'stroop')).length === 1, 'R6 깨진 값 복구', t.msg);
await p.evaluate(() => { localStorage.setItem('vgb_log', '{"g":1}'); });
await result(p, 4);
chk((await logOf(p, 'stroop')).length === 1, 'R6 배열 아닌 값 복구');
await p.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('full'); }; });
await result(p, 9);
chk(await p.evaluate(() => document.getElementById('screen-result').classList.contains('active')), 'R6 저장 실패에도 결과 화면');
await p.close();

// R7 영역 카드: 두 판 이상이면 최근 평균 + 작은 선
p = await fresh();
await seed(p, 'stroop', [4, 6, 8]);
await seed(p, 'flag', [5], 8);
await p.evaluate(() => Region.open('lfrontal'));
const cards = await p.evaluate(() => [...document.querySelectorAll('.region-game-card')].map(c => ({
  name: c.querySelector('.region-game-name').textContent, txt: c.querySelector('.mission-best').textContent,
  spark: !!c.querySelector('.card-trend svg'), hid: c.querySelector('.card-trend svg')?.getAttribute('aria-hidden'),
})));
const sc = cards.find(c => c.name === '색깔 글자'), fc = cards.find(c => c.name === '청기백기');
chk(sc && sc.spark && sc.hid === 'true' && sc.txt.includes('최근 평균: 6점'), 'R7 기록 있는 카드', JSON.stringify(sc));
chk(fc && !fc.spark && !fc.txt.includes('평균'), 'R7 한 판뿐이면 선 없음', JSON.stringify(fc));
await p.close();

// R8 말풍선: 점 가까이에 손을 대면 날짜·점수
p = await fresh();
await seed(p, 'stroop', [3, 5]);
await result(p, 7);
const cb = await (await p.$('.trend-chart')).boundingBox();
await p.mouse.move(cb.x + 8, cb.y + cb.height / 2);
let tip = await p.evaluate(() => { const e = document.querySelector('.trend-tip'); return { v: !e.classList.contains('hidden'), t: e.textContent }; });
chk(tip.v && /월 \d+일 · 3점$/.test(tip.t), 'R8 첫 점 말풍선', JSON.stringify(tip));
await p.mouse.move(cb.x + cb.width - 90, cb.y + cb.height / 2);
tip = await p.evaluate(() => document.querySelector('.trend-tip').textContent);
chk(tip === '이번 · 7점', 'R8 이번 판 말풍선', tip);
await p.mouse.move(5, 5);
chk(await p.evaluate(() => document.querySelector('.trend-tip').classList.contains('hidden')), 'R8 벗어나면 숨김');
// 표는 누르면 펼쳐진다
await p.click('.trend-table summary');
chk(await p.evaluate(() => document.querySelector('.trend-table').open), 'R8 숫자로 보기 펼침');
await p.close();

// R9 실제 게임을 끝내면 기록이 남는다 (청기백기: 끝까지 아무것도 안 눌러도 끝난다)
// 9라운드 × 제한시간을 실제로 기다리지 않도록 시계를 빨리 돌린다
p = await b.newPage({ viewport: { width: 390, height: 900 } });
p.on('pageerror', e => errs.push(e.message));
await p.clock.install();
await p.goto(PAGE);
await p.evaluate(() => { Flag.start(); });
await p.clock.runFor(200000);
chk(await p.evaluate(() => document.getElementById('screen-result').classList.contains('active')), 'R9 결과 화면 도달');
log = await logOf(p, 'flag');
chk(log.length === 1 && Number.isFinite(log[0].s), 'R9 청기백기 끝나면 기록', JSON.stringify(log));
await p.close();

// R10 어두운 화면에서 선·점이 카드 위에서 보인다 (그래픽 대비 3:1)
p = await fresh({ colorScheme: 'dark' });
await seed(p, 'stroop', [3, 5]);
await result(p, 7);
const gr = await p.evaluate(() => {
  const rgb = s => (s.match(/[\d.]+/g) || []).map(Number);
  const lum = c => c.slice(0, 3).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [.2126, .7152, .0722][i], 0);
  const ratio = (a, b) => { const x = lum(rgb(a)), y = lum(rgb(b)); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  const card = getComputedStyle(document.querySelector('.result-box')).backgroundColor;
  return { line: ratio(getComputedStyle(document.querySelector('.tr-line')).stroke, card),
           now: ratio(getComputedStyle(document.querySelector('.tr-now')).fill, card) };
});
chk(gr.line >= 3 && gr.now >= 3, 'R10 어두운 화면 선·점 대비', JSON.stringify(gr));
await p.close();

chk(errs.length === 0, 'R11 페이지 오류 없음', errs.join(' | '));
await b.close();
console.log(`test9.mjs   ${fail.length ? 'FAIL' : 'PASS'} ${pass.length}${fail.length ? ' / 실패 ' + fail.length : ''}`);
fail.forEach(f => console.log('  ✗ ' + f));
process.exit(fail.length ? 1 : 0);
