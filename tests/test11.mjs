// 기록 옮기기(파일 저장·불러오기), 화면 읽기 도구 안내, 공용 제한시간 막대
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
const FILE = new URL('../public/index.html', import.meta.url);
const PAGE = FILE.href;
// file:// 에서는 브라우저가 내려받기 파일 이름을 무시하므로, 실제 배포처럼 http 로 띄운다
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(readFileSync(FILE)); });
await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
const HTTP = `http://127.0.0.1:${srv.address().port}/`;
const b = await chromium.launch();
const pass = [], fail = [];
const chk = (c, n, x = '') => (c ? pass : fail).push(n + (c ? '' : ' :: ' + x));
const errs = [];
const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, acceptDownloads: true });
const p = await ctx.newPage();
p.on('pageerror', e => errs.push(e.message));
await p.goto(HTTP); await p.waitForTimeout(150);
const store = () => p.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter(k => k.startsWith('vgb_')).sort().map(k => [k, localStorage.getItem(k)])));
const msg = () => p.evaluate(() => { const e = document.getElementById('backup-msg'); return { t: e.textContent, err: e.classList.contains('err') }; });
const upload = (name, text) => p.setInputFiles('#backup-file', { name, mimeType: 'application/json', buffer: Buffer.from(text) });

// B1 저장: 모든 vgb_ 값이 파일에 담긴다
await p.evaluate(() => {
  localStorage.setItem('vgb_points', '120');
  localStorage.setItem('vgb_best_stroop', '9');
  localStorage.setItem('vgb_days', JSON.stringify(['2026-09-20', '2026-09-21']));
  localStorage.setItem('vgb_log', JSON.stringify([{ g: 'stroop', t: 1, s: 7, m: 10 }, { g: 'chalk', t: 2, s: 11, m: 12 }]));
  localStorage.setItem('other_app', 'x');   // 다른 앱 값은 담지 않는다
});
const saved = await store();
const [dl] = await Promise.all([p.waitForEvent('download'), p.click('text=📤 파일로 저장')]);
const file = JSON.parse(readFileSync(await dl.path(), 'utf8'));
chk(/^verygoodbrain-backup-\d{4}-\d{2}-\d{2}\.json$/.test(dl.suggestedFilename()), 'B1 파일 이름', dl.suggestedFilename());
chk(file.app === 'verygoodbrain' && JSON.stringify(Object.fromEntries(Object.entries(file.data).sort())) === JSON.stringify(saved) && !('other_app' in file.data), 'B1 내용', JSON.stringify(file).slice(0, 150));
chk((await msg()).t.includes('저장했어요'), 'B1 안내 문구');
const good = JSON.stringify(file);

// B2 불러오기: 확인하면 파일 기록으로 바뀌고 화면도 새로 그린다
await p.evaluate(() => { localStorage.clear(); localStorage.setItem('vgb_points', '3'); localStorage.setItem('vgb_best_flag', '5'); goHome(); });
p.once('dialog', d => d.accept());
await upload('backup.json', good);
await p.waitForFunction(() => document.getElementById('backup-msg').textContent.includes('불러왔어요'));
chk(JSON.stringify(await store()) === JSON.stringify(saved), 'B2 기록 교체', JSON.stringify(await store()).slice(0, 120));
chk(await p.evaluate(() => document.getElementById('total-points').textContent) === '120', 'B2 포인트 다시 그림');
chk((await msg()).t.includes('2판'), 'B2 불러온 판 수', (await msg()).t);

// B3 확인에서 취소하면 그대로
await p.evaluate(() => localStorage.setItem('vgb_points', '999'));
p.once('dialog', d => d.dismiss());
await upload('backup.json', good);
await p.waitForTimeout(300);
chk(await p.evaluate(() => localStorage.getItem('vgb_points')) === '999', 'B3 취소하면 그대로');

// B4 엉뚱한 파일은 확인창 없이 거절하고 기록을 건드리지 않는다
let asked = false; const onD = d => { asked = true; d.dismiss(); }; p.on('dialog', onD);
const before = await store();
for (const [name, text, want] of [
  ['a.json', '{깨짐', '기록 파일이 아니에요'],
  ['b.json', JSON.stringify({ app: 'other', data: {} }), '기록 파일이 아니에요'],
  ['c.json', JSON.stringify({ app: 'verygoodbrain', data: [] }), '기록 파일이 아니에요'],
  ['d.json', JSON.stringify({ app: 'verygoodbrain', data: { evil_key: 'x' } }), '올바르지 않아요'],
  ['e.json', JSON.stringify({ app: 'verygoodbrain', data: { vgb_points: 5 } }), '올바르지 않아요'],
  ['f.json', 'x'.repeat(1024 * 1024 + 1), '너무 커요'],
]) {
  await upload(name, text);
  await p.waitForFunction(w => document.getElementById('backup-msg').textContent.includes(w), want, { timeout: 3000 }).catch(() => {});
  const m = await msg();
  chk(m.err && m.t.includes(want), `B4 거절 ${name}`, m.t);
}
p.off('dialog', onD);
chk(!asked && JSON.stringify(await store()) === JSON.stringify(before), 'B4 기록 그대로·확인창 없음');

// B5 같은 파일을 다시 골라도 동작 (input 값 비움)
chk(await p.evaluate(() => document.getElementById('backup-file').value) === '', 'B5 파일 선택 비움');

// A1 정답·오답 안내 영역은 화면 읽기 도구가 읽어준다
const live = await p.evaluate(() => [...document.querySelectorAll('[id$="-feedback"]')].map(e => [e.id, e.getAttribute('aria-live')]));
chk(live.length >= 8 && live.every(([, v]) => v === 'polite'), 'A1 aria-live', JSON.stringify(live));
// A2 결과 화면이 뜨면 제목으로 초점
await p.evaluate(() => showResult({ score: 5, max: 10, gameKey: 'stroop', detailHtml: '', retryFn: () => {} }));
chk(await p.evaluate(() => document.activeElement.id) === 'result-title', 'A2 결과 제목 초점');

// T1 공용 제한시간 막대: 숫자가 줄고, 끝 무렵 빨개지고, 답하면 가득 찬 막대로 돌아간다
const p2 = await ctx.newPage();
p2.on('pageerror', e => errs.push(e.message));
await p2.clock.install();
await p2.goto(PAGE);
await p2.evaluate(() => Chalk.start());
const tb = () => p2.evaluate(() => { const bar = document.getElementById('chalk-timer'), n = document.getElementById('chalk-timer-num');
  return { n: n.textContent, low: n.classList.contains('low') && bar.classList.contains('low'), w: bar.style.width, run: bar.classList.contains('running') }; });
let t = await tb();
chk(t.n === '8초' && t.run && t.w === '0%' && !t.low, 'T1 시작', JSON.stringify(t));
await p2.clock.runFor(3050);
t = await tb();
chk(t.n === '5초' && !t.low, 'T1 줄어듦', JSON.stringify(t));
await p2.clock.runFor(3500);
t = await tb();
chk(t.n === '2초' && t.low, 'T1 끝 무렵 빨강', JSON.stringify(t));
await p2.evaluate(() => Chalk.answer('='));
t = await tb();
chk(!t.run && !t.low && t.w === '100%', 'T1 답하면 되돌림', JSON.stringify(t));
// 같은 그림 판별도 같은 막대를 쓴다
await p2.evaluate(() => { Speed.start(); Speed.begin(); });
await p2.clock.runFor(2200);
t = await p2.evaluate(() => ({ n: document.getElementById('speed-timer-num').textContent, low: document.getElementById('speed-timer').classList.contains('low') }));
chk(t.n === '2초' && !t.low, 'T2 같은 그림 막대', JSON.stringify(t));
await p2.clock.runFor(500);
t = await p2.evaluate(() => document.getElementById('speed-timer').classList.contains('low'));
chk(t, 'T2 같은 그림 1.5초 이하 빨강');
// 청기백기: 준비 0.8초 뒤 시작, 채점되면 숫자가 멈춘다
await p2.evaluate(() => Flag.start());
await p2.clock.runFor(900);
const f1 = await p2.evaluate(() => document.getElementById('flag-timer-num').textContent);
await p2.clock.runFor(8000);
const f2 = await p2.evaluate(() => document.getElementById('flag-timer-num').textContent);
await p2.clock.runFor(500);
const f3 = await p2.evaluate(() => document.getElementById('flag-timer-num').textContent);
chk(f1 === '8초' && f2 === '0초' && f3 === '0초', 'T3 청기백기 막대', `${f1} ${f2} ${f3}`);

chk(errs.length === 0, 'Z 페이지 오류 없음', errs.join(' | '));
await b.close();
srv.close();
console.log(`test11.mjs  ${fail.length ? 'FAIL' : 'PASS'} ${pass.length}${fail.length ? ' / 실패 ' + fail.length : ''}`);
fail.forEach(f => console.log('  ✗ ' + f));
process.exit(fail.length ? 1 : 0);
