// 글자 대비: 밝은·어두운 화면 모두에서 글자가 배경과 충분히 구분되는가 (WCAG AA)
import { chromium } from 'playwright';
const PAGE = new URL('../public/index.html', import.meta.url).href;
const SCREENS = {
  홈: 'goHome()', 영역: "Region.open('temporal')",
  결과: "showResult({score:7,max:10,gameKey:null,detailHtml:'설명 <b>굵게</b>',retryFn:()=>{}})",
  결과추이: "localStorage.setItem('vgb_log',JSON.stringify([3,5,6].map((s,i)=>({g:'stroop',t:Date.now()-(3-i)*864e5,s,m:10}))));" +
    "showResult({score:8,max:10,gameKey:'stroop',detailHtml:'',retryFn:()=>{}});document.querySelector('.trend-table').open=true",
  기록오류: "document.getElementById('backup-msg').textContent='⚠ 베리굿브레인 기록 파일이 아니에요.';document.getElementById('backup-msg').className='backup-msg err'",
  모양: 'Shape.start()', 칠판: 'Chalk.start()', 같은그림: 'Speed.start()', 색깔글자: 'Stroop.start()', 카드: 'Memory.start()',
  청기백기: 'Flag.start()', 불빛: 'Pixel.start()', 낱말: 'Sort.start();Sort.flip()', 퀴즈: 'Quiz.start()',
};
const b = await chromium.launch();
const pass = [], fail = [];
const chk = (c, n, x = '') => (c ? pass : fail).push(n + (c ? '' : ' :: ' + x));
const errs = [];

// 페이지 안에서 쓰는 대비 계산 (문자열로 넘겨 evaluate 마다 재사용)
const LIB = `
  window.__rgb = s => (s.match(/[\\d.]+/g) || []).map(Number);
  window.__lum = ([r, g, b]) => [r, g, b].map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; })
    .reduce((a, v, i) => a + v * [.2126, .7152, .0722][i], 0);
  window.__bgOf = el => { for (let e = el; e; e = e.parentElement) {
    const c = __rgb(getComputedStyle(e).backgroundColor); if (c.length >= 3 && (c[3] ?? 1) > 0.5) return c; }
    return __rgb(getComputedStyle(document.body).backgroundColor); };
  window.__ratio = (a, b) => { const L1 = __lum(a), L2 = __lum(b); return (Math.max(L1, L2) + .05) / (Math.min(L1, L2) + .05); };
`;

for (const scheme of ['light', 'dark']) {
  const tag = scheme === 'light' ? '밝은' : '어두운';
  for (const [name, js] of Object.entries(SCREENS)) {
    const p = await b.newPage({ viewport: { width: 390, height: 900 }, colorScheme: scheme });
    p.on('pageerror', e => errs.push(e.message));
    await p.goto(PAGE); await p.waitForTimeout(150);
    await p.evaluate(LIB);
    await p.evaluate(j => eval(j), js); await p.waitForTimeout(200);
    const bad = await p.evaluate(() => {
      const out = [];
      const w = document.createTreeWalker(document.querySelector('.screen.active'), NodeFilter.SHOW_TEXT);
      let n; while ((n = w.nextNode())) {
        const el = n.parentElement, t = n.textContent.trim();
        if (!t || !el.offsetParent) continue;
        if (/^[\p{Extended_Pictographic}️‍\s⭕❌▶◀←→↑↓·]+$/u.test(t)) continue;   // 이모지·기호만
        const cs = getComputedStyle(el), ratio = __ratio(__rgb(cs.color), __bgOf(el));
        const px = parseFloat(cs.fontSize), bold = +cs.fontWeight >= 600;
        // 읽기 도구에서 숨긴 장식 기호(▲ 등)는 글자가 아니라 그림 기준(3:1)
        const need = (px >= 24 || (bold && px >= 18.66) || el.closest('[aria-hidden="true"]')) ? 3 : 4.5;
        if (ratio < need) out.push(`"${t.slice(0, 10)}" ${ratio.toFixed(2)}`);
      }
      return [...new Set(out)];
    });
    chk(bad.length === 0, `${tag} ${name} 글자 대비`, bad.join(', '));
    await p.close();
  }

  // 색깔 글자 게임의 네 가지 잉크는 무작위로 한 번만 보이므로 따로 전부 잰다
  const p = await b.newPage({ viewport: { width: 390, height: 900 }, colorScheme: scheme });
  await p.goto(PAGE); await p.waitForTimeout(150);
  await p.evaluate(LIB);
  await p.evaluate(() => Stroop.start()); await p.waitForTimeout(150);
  const inks = await p.evaluate(() => {
    const el = document.getElementById('stroop-word'), bg = __bgOf(el), res = {};
    for (const k of ['red', 'blue', 'purple', 'green']) {
      el.style.color = `var(--ink-${k})`;
      res[k] = { ratio: __ratio(__rgb(getComputedStyle(el).color), bg), rgb: getComputedStyle(el).color };
    }
    return res;
  });
  for (const [k, v] of Object.entries(inks)) chk(v.ratio >= 3, `${tag} 잉크 ${k} 대비 ≥3`, v.ratio.toFixed(2));
  // 네 잉크가 모두 서로 다른 색인지 (변수 누락 시 같은 색으로 떨어진다)
  chk(new Set(Object.values(inks).map(v => v.rgb)).size === 4, `${tag} 잉크 4색 모두 다름`);
  await p.close();
}
chk(errs.length === 0, '페이지 오류 없음', errs.join(' | '));
await b.close();
console.log(`test8.mjs   ${fail.length ? 'FAIL' : 'PASS'} ${pass.length}${fail.length ? ' / 실패 ' + fail.length : ''}`);
fail.forEach(f => console.log('  ✗ ' + f));
process.exit(fail.length ? 1 : 0);
