// 접근성: 확대·글자 크기
import { chromium } from 'playwright';
const PAGE = new URL('../public/index.html', import.meta.url).href;
const b = await chromium.launch();
const pass = [], fail = [];
const chk = (c, n, x = '') => (c ? pass : fail).push(n + (c ? '' : ' :: ' + x));

// 휴대폰·브라우저 설정의 '기본 글자 크기'를 바꾼 것과 같은 상태로 연다
const open = async (pref, js) => {
  const p = await b.newPage({ viewport: { width: 360, height: 740 } });
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('Page.enable');
  await cdp.send('Page.setFontSizes', { fontSizes: { standard: pref, fixed: 13 } });
  await p.goto(PAGE);
  await p.waitForTimeout(200);
  if (js) { await p.evaluate(j => eval(j), js); await p.waitForTimeout(150); }
  return p;
};

// ---- 손가락으로 벌려 확대 ----
{
  const p = await open(16);
  const v = await p.evaluate(() => ({
    meta: document.querySelector('meta[name=viewport]').content,
    touch: getComputedStyle(document.body).touchAction,
  }));
  chk(!/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(\.0)?\b/.test(v.meta), 'A1 손가락으로 벌려 확대할 수 있음', v.meta);
  chk(v.touch === 'manipulation', 'A2 두 번 눌러 확대되는 건 여전히 막힘 (빠른 연타 보호)', v.touch);
  await p.close();
}

// ---- 사용자가 키운 글자 크기를 따르는가 ----
for (const [pref, want] of [[16, 18], [20, 22.5], [24, 27]]) {
  const p = await open(pref);
  const root = await p.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
  chk(Math.abs(root - want) < 0.1, `A3 설정 ${pref}px -> 앱 ${want}px`, root + 'px');
  await p.close();
}

// ---- 크게 해도 가로로 넘치지 않는가 (모든 화면) ----
const SCREENS = {
  홈: 'goHome()', 영역: "Region.open('parietal')",
  결과: "showResult({score:7,max:10,gameKey:null,detailHtml:'x',retryFn:()=>{}})",
  모양: 'Shape.start()', 같은그림: 'Speed.start()', 색깔글자: 'Stroop.start()', 카드: 'Memory.start()',
  청기백기: 'Flag.start()', 불빛: 'Pixel.start()', 낱말: 'Sort.start()', 퀴즈: 'Quiz.start()',
};
for (const pref of [24, 28, 32]) {
  const bad = [];
  for (const [name, js] of Object.entries(SCREENS)) {
    const p = await open(pref, js);
    const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (over > 0) bad.push(`${name}+${over}`);
    await p.close();
  }
  chk(bad.length === 0, `A4 설정 ${pref}px 에서 11개 화면 모두 가로 넘침 없음`, bad.join(', '));
}

// ---- 기본 크기에서는 예전과 똑같아야 한다 ----
{
  const p = await open(16);
  const d = await p.evaluate(() => getComputedStyle(document.querySelector('.attend-day')).fontSize);
  await p.evaluate(() => { Sort.start(); Sort.flip(); }); await p.waitForTimeout(120);
  const s = await p.evaluate(() => {
    const bins = [...document.querySelectorAll('.sort-bin')];
    const h = document.querySelector('.screen.active .game-header');
    const back = h.querySelector('.btn-back').getBoundingClientRect(), t = h.querySelector('.game-title').getBoundingClientRect();
    return { rows: new Set(bins.map(x => Math.round(x.getBoundingClientRect().top))).size,
             headerH: Math.round(h.getBoundingClientRect().height), titleBelow: t.top >= back.bottom - 2 };
  });
  await p.evaluate(() => Memory.start()); await p.waitForTimeout(120);
  const e = await p.evaluate(() => getComputedStyle(document.querySelector('.mcard-front')).fontSize);
  chk(d === '18px', 'A5 기본 크기: 달력 날짜 18px 그대로', d);
  chk(s.rows === 1, 'A5 기본 크기: 분류함 네 칸이 한 줄', s.rows + '줄');
  chk(!s.titleBelow && s.headerH === 42, 'A5 기본 크기: 게임 상단 한 줄 그대로', JSON.stringify(s));
  chk(e === '54px', 'A5 기본 크기: 카드 이모지 54px 그대로', e);
  await p.close();
}

// ---- 크게 하면 제목이 한 글자씩 쪼개지지 않고 아랫줄로 내려간다 ----
{
  const p = await open(28, 'Sort.start()');
  const r = await p.evaluate(() => {
    const h = document.querySelector('.screen.active .game-header');
    const back = h.querySelector('.btn-back').getBoundingClientRect(), t = h.querySelector('.game-title');
    const tr = t.getBoundingClientRect();
    const lh = parseFloat(getComputedStyle(t).fontSize) * 1.4;
    return { below: tr.top >= back.bottom - 2, lines: Math.round(tr.height / lh) };
  });
  chk(r.below && r.lines === 1, 'A6 크게 하면 제목이 아랫줄에 한 줄로', JSON.stringify(r));
  const bins = await p.evaluate(() => { Sort.flip();
    return new Set([...document.querySelectorAll('.sort-bin')].map(x => Math.round(x.getBoundingClientRect().top))).size; });
  chk(bins === 2, 'A6 크게 하면 분류함이 두 줄로 넘어감', bins + '줄');
  await p.close();
}

await b.close();
console.log('PASS ' + pass.length + '\n  ' + pass.join('\n  '));
if (fail.length) console.log('FAIL ' + fail.length + '\n  ' + fail.join('\n  '));
process.exit(fail.length ? 1 : 0);
