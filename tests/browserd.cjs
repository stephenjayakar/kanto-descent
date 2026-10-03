// Headless Chrome driver daemon: POST JSON commands to http://127.0.0.1:9533
// {cmd:'goto',url} {cmd:'down',key} {cmd:'up',key} {cmd:'key',key} {cmd:'hold',key,ms}
// {cmd:'mouse',x,y,button?,action:'move'|'down'|'up'|'click'} (virtual 768x432 coords)
// {cmd:'shot',path} {cmd:'eval',js} {cmd:'logs'} {cmd:'wait',ms} {cmd:'quit'}
const { chromium } = require('playwright');
const http = require('http');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] }); // silent: never play sound on the owner's speakers
  const page = await browser.newPage({ viewport: { width: 1536, height: 864 } });
  const logs = [];
  page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('response', r => { if (r.status() >= 400) logs.push(`[http ${r.status()}] ${r.url()}`); });
  page.on('pageerror', e => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
  const toPage = async (x, y) => {
    const r = await page.evaluate(() => { const c = document.getElementById('game').getBoundingClientRect(); return { l: c.left, t: c.top, w: c.width, h: c.height }; });
    return [r.l + x / 768 * r.w, r.t + y / 432 * r.h];
  };
  http.createServer(async (req, res) => {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', async () => {
      try {
        const c = JSON.parse(body || '{}');
        let out = 'ok';
        if (c.cmd === 'goto') await page.goto(c.url, { waitUntil: 'load' });
        else if (c.cmd === 'down') await page.keyboard.down(c.key);
        else if (c.cmd === 'up') await page.keyboard.up(c.key);
        else if (c.cmd === 'key') await page.keyboard.press(c.key);
        else if (c.cmd === 'hold') { await page.keyboard.down(c.key); await page.waitForTimeout(c.ms || 200); await page.keyboard.up(c.key); }
        else if (c.cmd === 'mouse') {
          const [px, py] = await toPage(c.x, c.y);
          await page.mouse.move(px, py);
          if (c.action === 'down') await page.mouse.down({ button: c.button || 'left' });
          if (c.action === 'up') await page.mouse.up({ button: c.button || 'left' });
          if (c.action === 'click') await page.mouse.click(px, py, { button: c.button || 'left' });
        }
        else if (c.cmd === 'shot') await page.screenshot({ path: c.path });
        else if (c.cmd === 'eval') out = JSON.stringify(await page.evaluate(c.js));
        else if (c.cmd === 'logs') { out = logs.join('\n'); logs.length = 0; }
        else if (c.cmd === 'wait') await page.waitForTimeout(c.ms);
        else if (c.cmd === 'quit') { res.end('bye'); await browser.close(); process.exit(0); }
        res.end(out);
      } catch (e) { res.end('ERR ' + e.message); }
    });
  }).listen(9533, '127.0.0.1', () => console.log('browserd on 9533'));
})();
