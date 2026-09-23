import { chromium } from 'playwright';
const file = process.argv[2];
const b = await chromium.launch(); const p = await b.newPage();
await p.goto('file://' + file);
const round = () => p.evaluate(() => document.getElementById('flag-round').textContent);
const out = [];

// A) "준비..." 표시 중에 나가기 -> 백그라운드에서 라운드가 계속 돌면 안 됨
await p.evaluate(() => Flag.start());
await p.waitForTimeout(300);                 // 아직 준비(800ms) 중
await p.click('#screen-flag .btn-back');
const a1 = await round(); await p.waitForTimeout(12000); const a2 = await round();
out.push(['A 준비 중 나가기', a1 === a2, `round ${a1} -> ${a2}`]);

// B) 채점 피드백 표시 중에 나가기 -> 다음 라운드가 예약되어 있으면 안 됨
await p.evaluate(() => Flag.start());
await p.waitForTimeout(10000);               // 800ms 준비 + 8s 제한시간 -> 채점/피드백 중
const bFb = await p.evaluate(() => !document.getElementById('flag-feedback').classList.contains('hidden'));
await p.click('#screen-flag .btn-back');
const b1 = await round(); await p.waitForTimeout(5000); const b2 = await round();
out.push(['B 피드백 중 나가기 (피드백표시=' + bFb + ')', b1 === b2, `round ${b1} -> ${b2}`]);

// C) 나가기 후에도 홈 화면이 유지되는가
out.push(['C 홈 유지', await p.evaluate(() => document.querySelector('.screen.active').id) === 'screen-home', '']);
await b.close();
for (const [n, ok, x] of out) console.log((ok ? 'PASS ' : 'FAIL ') + n + (ok ? '' : ' :: ' + x));
process.exit(out.every(o => o[1]) ? 0 : 1);
