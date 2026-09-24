// 두정엽: 칠판 비교
import { chromium } from 'playwright';
const PAGE = new URL('../public/index.html', import.meta.url).href;
const b = await chromium.launch();
const pass = [], fail = [];
const chk = (c, n, x = '') => (c ? pass : fail).push(n + (c ? '' : ' :: ' + x));
const errs = [];
const p = await b.newPage({ viewport: { width: 390, height: 900 } });
p.on('pageerror', e => errs.push(e.message));
await p.clock.install();
await p.goto(PAGE);
const val = e => Function(`return (${e.replace(/×/g, '*').replace(/−/g, '-')})`)();
const q = () => p.evaluate(() => Chalk.q);
const truth = x => (x.a > x.b ? 'L' : x.a < x.b ? 'R' : '=');
const active = () => p.evaluate(() => document.querySelector('.screen.active').id);

// C1 두정엽 영역에 카드가 있고 누르면 시작
await p.evaluate(() => Region.open('parietal'));
const names = await p.evaluate(() => [...document.querySelectorAll('.region-game-name')].map(e => e.textContent));
chk(names.includes('칠판 비교'), 'C1 두정엽 카드', names.join(','));
await p.evaluate(() => [...document.querySelectorAll('.region-game-card')].find(c => c.textContent.includes('칠판 비교')).click());
chk(await active() === 'screen-chalk', 'C1 화면 시작');

// C2 문제 생성: 여러 판을 돌며 단계별 규칙 확인 (모두 맞히며 진행)
const bad = []; let n = 0, eq = 0, mulQ = 0, sameStr = 0;
for (let g = 0; g < 25; g++) {
  await p.evaluate(() => Chalk.start());
  for (let i = 1; i <= 12; i++) {
    const x = await q(); n++;
    if (x.a === x.b) { eq++; if (x.ea && x.ea === x.eb) sameStr++; }
    if (i <= 4) {
      const dots = await p.evaluate(() => ['chalk-left', 'chalk-right'].map(id => document.querySelectorAll(`#${id} circle`).length));
      if (x.kind !== 'dots' || dots[0] !== x.a || dots[1] !== x.b || x.a < 3 || x.b > 12) bad.push(`dots#${i} ${JSON.stringify(x)} ${dots}`);
    } else {
      if (x.kind !== 'expr' || val(x.ea) !== x.a || val(x.eb) !== x.b) bad.push(`expr#${i} ${JSON.stringify(x)}`);
      const shown = await p.evaluate(() => ['chalk-left', 'chalk-right'].map(id => document.querySelector(`#${id} .chalk-expr`).textContent));
      if (shown[0] !== x.ea || shown[1] !== x.eb) bad.push(`shown#${i} ${shown}`);
      const hasMul = x.ea.includes('×') || x.eb.includes('×');
      if (i <= 8 && hasMul) bad.push(`2단계 곱셈#${i} ${x.ea}|${x.eb}`);
      if (i > 8) { if (!hasMul) bad.push(`3단계 곱셈없음#${i} ${x.ea}|${x.eb}`); else mulQ++; }
      if (/-\d|−\s*0|\+\s*0/.test(x.ea + x.eb)) bad.push(`음수·0#${i} ${x.ea}|${x.eb}`);
      if (Math.abs(x.a - x.b) > 3) bad.push(`차이#${i} ${x.a} ${x.b}`);
    }
    await p.evaluate(t => Chalk.answer(t), truth(x));
    await p.clock.runFor(1200);
  }
  if (await active() !== 'screen-result') { bad.push(`판${g} 결과 화면 아님`); break; }
}
chk(bad.length === 0, `C2 문제 규칙 (${n}문제)`, bad.slice(0, 5).join(' / '));
chk(eq / n > 0.12 && eq / n < 0.4, 'C2 같은 값 비율', (eq / n).toFixed(2));
chk(sameStr === 0, 'C2 같은 값이라도 식은 다르게', sameStr);
chk(mulQ === 25 * 4, 'C2 3단계는 모두 곱셈 포함', mulQ);

// C3 모두 맞히면 12점 만점 + 기록
const res = await p.evaluate(() => ({ s: document.getElementById('result-score').textContent, m: document.getElementById('result-max').textContent,
  log: JSON.parse(localStorage.getItem('vgb_log')).filter(r => r.g === 'chalk'), best: localStorage.getItem('vgb_best_chalk') }));
chk(res.s === '12점' && res.m.includes('12점') && res.log.length === 25 && res.best === '12', 'C3 만점·기록', JSON.stringify(res).slice(0, 120));

// C4 틀리면 점수 없음 + 두 값 공개, 시간 초과도 오답
await p.evaluate(() => Chalk.start());
let x = await q();
const wrong = truth(x) === 'L' ? 'R' : 'L';
await p.evaluate(t => Chalk.answer(t), wrong);
const fb = await p.evaluate(() => ({ t: document.getElementById('chalk-feedback').textContent,
  v: [...document.querySelectorAll('.chalk-val')].map(e => e.textContent), dis: [...document.querySelectorAll('.btn-chalk')].every(b => b.disabled) }));
chk(fb.t.includes('아쉬워요') && fb.v[0] === x.a + '개' && fb.v[1] === x.b + '개', 'C4 오답 + 값 공개', JSON.stringify(fb));
chk(fb.dis, 'C4 답한 뒤 버튼 잠김');
// 잠긴 동안 또 눌러도 점수·진행이 바뀌지 않는다
await p.evaluate(t => Chalk.answer(t), truth(x));
chk(await p.evaluate(() => document.getElementById('chalk-feedback').textContent.includes('아쉬워요')), 'C4 두 번 눌러도 한 번만');
await p.clock.runFor(2100);
chk(await p.evaluate(() => document.getElementById('chalk-no').textContent) === '2', 'C4 다음 문제로');
await p.clock.runFor(8100);
chk(await p.evaluate(() => document.getElementById('chalk-feedback').textContent.includes('시간이 지났어요')), 'C4 시간 초과');
await p.clock.runFor(2100);

// C5 나가면 멈춘다
const before = await p.evaluate(() => document.getElementById('chalk-no').textContent);
await p.click('#screen-chalk .btn-back');
await p.clock.runFor(30000);
chk(await active() === 'screen-home' && await p.evaluate(() => document.getElementById('chalk-no').textContent) === before, 'C5 나가면 멈춤');

// C6 실제 버튼 클릭으로 답하기
await p.evaluate(() => Chalk.start());
x = await q();
await p.click(`.btn-chalk[data-pick="${truth(x)}"]`);
chk(await p.evaluate(() => document.getElementById('chalk-feedback').textContent.includes('정답')), 'C6 버튼으로 정답');

// C7 좁은 화면(320)에서 가로 넘침 없음
await p.setViewportSize({ width: 320, height: 700 });
await p.clock.runFor(1200);
chk(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'C7 좁은 화면 넘침 없음');

chk(errs.length === 0, 'C8 페이지 오류 없음', errs.join(' | '));
await b.close();
console.log(`test10.mjs  ${fail.length ? 'FAIL' : 'PASS'} ${pass.length}${fail.length ? ' / 실패 ' + fail.length : ''}`);
fail.forEach(f => console.log('  ✗ ' + f));
process.exit(fail.length ? 1 : 0);
