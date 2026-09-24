// 배터리: 가만히 둘 때 뇌 그림이 다시 그리기를 멈추는가
import { chromium } from 'playwright';
const PAGE = new URL('../public/index.html', import.meta.url).href;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 360, height: 740 } });
const errs = [];
p.on('pageerror', e => errs.push(e.message));
// 뇌를 그릴 때마다 배경을 칠하는 fillRect(0,0,..) 를 센다.
// 측정용으로 requestAnimationFrame 을 직접 돌리면 그 자체가 브라우저를 계속
// 그리게 만들어 결과가 오염된다. 관찰만 하고 기다림은 setTimeout 으로 한다.
await p.addInitScript(() => {
  window.__draws = 0;
  const f = CanvasRenderingContext2D.prototype.fillRect;
  CanvasRenderingContext2D.prototype.fillRect = function (x, y) {
    if (x === 0 && y === 0 && this.fillStyle === '#05070f') window.__draws++;
    return f.apply(this, arguments);
  };
});
await p.goto(PAGE);
await p.waitForTimeout(400);
// mount() 는 화면이 다시 보일 때 깨우는 용도라, 상태를 읽을 때마다 부르면
// 읽는 행위가 뇌를 깨운다. 참조를 한 번만 잡아두고 그걸로 읽고 쓴다
await p.evaluate(() => { window.__v = Brain3D.mount(document.getElementById('home-brain-canvas'), {}); });
const pass = [], fail = [];
const chk = (c, n, x = '') => (c ? pass : fail).push(n + (c ? '' : ' :: ' + x));
const rate = async (ms = 1000) => {
  await p.evaluate(() => (window.__draws = 0));
  await p.waitForTimeout(ms);
  return Math.round((await p.evaluate(() => window.__draws)) * 1000 / ms);
};
// 마지막으로 만진 지 오래된 상태로 만든다 (25초를 실제로 기다리지 않는다)
const rest = () => p.evaluate(() => {
  window.__v.awake = performance.now() - 60000; window.__v.touched = performance.now() - 60000;
});

let r = await rate();
chk(r > 20, 'P1 처음 열면 뇌가 돌며 그려짐', r + '회/초');

await rest(); await p.waitForTimeout(200);
r = await rate();
chk(r === 0, 'P2 오래 가만히 두면 다시 그리기를 멈춤', r + '회/초');

const lit = await p.evaluate(() => {
  const c = document.getElementById('home-brain-canvas');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 150) n++;
  return n;
});
chk(lit > 2000, 'P3 멈춰도 마지막 모습은 그대로 남음 (빈 화면 아님)', lit + '픽셀');

const yaw0 = await p.evaluate(() => window.__v.yaw);
await p.waitForTimeout(1200);
const yaw1 = await p.evaluate(() => window.__v.yaw);
chk(Math.abs(yaw1 - yaw0) < 1e-9, 'P4 쉬는 동안은 자전도 멈춤', `${yaw0} -> ${yaw1}`);

const box = await (await p.$('#home-brain-canvas')).boundingBox();
await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await p.mouse.down(); await p.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 5 });
await p.mouse.up();
r = await rate();
chk(r > 20, 'P5 만지면 다시 그리기 시작', r + '회/초');

await rest(); await p.waitForTimeout(200);
await p.click('.legend-chip');
r = await rate(600);
chk(r > 20, 'P6 색 칩으로 부위를 고르면 깨어남', r + '회/초');

await p.evaluate(() => Stroop.start());
r = await rate();
chk(r === 0, 'P7 게임 화면에서는 뇌를 그리지 않음', r + '회/초');

await p.evaluate(() => goHome());
await p.waitForTimeout(200);
r = await rate();
chk(r > 20, 'P8 홈으로 돌아오면 다시 그림', r + '회/초');

await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await p.waitForTimeout(400);
const off = await p.evaluate(() => document.getElementById('home-brain-canvas').getBoundingClientRect().bottom < 0);
r = await rate();
chk(off && r === 0, 'P9 스크롤로 화면 밖에 나가면 그리지 않음', `화면밖=${off} ${r}회/초`);

await p.evaluate(() => window.scrollTo(0, 0));
await p.waitForTimeout(400);
r = await rate();
chk(r > 20, 'P10 다시 보이면 그림', r + '회/초');

chk(errs.length === 0, 'P11 오류 없음', errs.join(' | '));
await b.close();
console.log('PASS ' + pass.length + '\n  ' + pass.join('\n  '));
if (fail.length) console.log('FAIL ' + fail.length + '\n  ' + fail.join('\n  '));
process.exit(fail.length ? 1 : 0);
