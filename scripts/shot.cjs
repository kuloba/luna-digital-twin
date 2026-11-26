const { chromium } = require('playwright');
(async () => {
  const [,, out = 'shot.png', wait = '6000', actions = ''] = process.argv;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 960 }, deviceScaleFactor: 1 });
  const logs = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
  await page.goto('http://127.0.0.1:5173/' + (process.env.Q || ''));
  await page.waitForTimeout(Number(wait));
  if (actions) { for (const a of actions.split(';')) { await page.evaluate(a); await page.waitForTimeout(2500); } }
  await page.screenshot({ path: out });
  console.log(logs.slice(0, 15).join('\n'));
  await browser.close();
})();
