// Called by the real-screen appearance fixture. Check rendered colors, including
// inline surfaces and portals; no Firebase writes or payment requests are made.
const assert = require('node:assert/strict');

function luminance(rgb) {
  const channels = rgb.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => {
    const c = v / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
  });
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
}
async function colors(locator) {
  await locator.evaluate(el => Promise.allSettled(el.getAnimations().filter(a => a.effect.getTiming().iterations !== Infinity).map(a => a.finished)));
  return locator.evaluate(el => {
    const color = getComputedStyle(el).color;
    let composite = [0, 0, 0, 0];
    while (el && composite[3] < 1) {
      const channels = getComputedStyle(el).backgroundColor.match(/[\d.]+/g).map(Number);
      const alpha = channels[3] ?? 1;
      const combined = composite[3] + alpha * (1 - composite[3]);
      if (combined) composite = [...channels.slice(0, 3).map((v, i) =>
        (composite[i] * composite[3] + v * alpha * (1 - composite[3])) / combined), combined];
      el = el.parentElement;
    }
    const bg = 'rgb(' + composite.slice(0, 3).join(', ') + ')';
    return { color, bg };
  });
}
async function readable(locator, label) {
  const { color, bg } = await colors(locator);
  const [lighter, darker] = [luminance(color), luminance(bg)].sort((a, b) => b - a);
  assert.ok((lighter + .05) / (darker + .05) >= 4.5, label + ' contrast: ' + JSON.stringify({ color, bg }));
}
async function surface(locator, theme, label) {
  const { bg } = await colors(locator);
  assert.ok(theme === 'light' ? luminance(bg) > .6 : luminance(bg) < .1, label + ' ' + theme + ': ' + bg);
}

module.exports = async function verifyThemeSurfaces(page) {
  for (const theme of ['light', 'dark', 'light']) {
    await page.evaluate(theme => window.appPrefs.getState().setThemeMode(theme), theme);
    await page.waitForFunction(theme => document.documentElement.dataset.appTheme === theme, theme);
    await page.evaluate(() => window.navigate('/search'));
    await page.getByRole('heading', { name: 'Find the exact next read' }).waitFor();
    const search = page.getByPlaceholder('Search books, authors, or topics...');
    await surface(search, theme, 'Search field'); await readable(search, 'Search field');
    const hero = await page.locator('main > section').first().evaluate(el => getComputedStyle(el).backgroundImage);
    assert.ok(hero.includes(theme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(25, 27, 32)'), 'Search hero follows ' + theme);
    await page.getByRole('button', { name: 'Filters', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Search filters' });
    await surface(sheet, theme, 'Filter sheet');
    await sheet.getByRole('button', { name: 'Fiction', exact: true }).click();
    await readable(sheet.getByRole('button', { name: 'Fiction', exact: true }), 'Selected genre');
    await readable(sheet.getByRole('button', { name: 'History', exact: true }), 'Unselected genre');
    await readable(sheet.getByPlaceholder('25'), 'Price field');
    await page.getByRole('button', { name: 'Close search sheet' }).click();
    await page.getByRole('button', { name: 'Most relevant', exact: true }).click();
    await surface(page.getByRole('dialog', { name: 'Sort books' }), theme, 'Sort sheet');
    await readable(page.getByRole('dialog').getByRole('button', { name: 'Most relevant', exact: true }), 'Selected sort');
    await page.getByRole('button', { name: 'Close search sheet' }).click();

    await page.evaluate(() => window.navigate('/library'));
    await page.locator('.app-library-action').first().waitFor();
    await surface(page.locator('.app-library-action').first(), theme, 'Library continue action');
    await readable(page.locator('.app-library-action').first(), 'Library continue label');
    await surface(page.locator('.app-library-item').first(), theme, 'Library row');
    const coverColor = await page.locator('.app-book-cover').first().evaluate(el => getComputedStyle(el).backgroundColor);
    assert.equal(coverColor, 'rgb(170, 112, 88)', 'Artwork retains its original palette');

    await page.evaluate(() => window.navigate('/theme-check'));
    await page.getByRole('heading', { name: 'Theme surfaces' }).waitFor();
    for (const status of ['paid', 'pending', 'failed', 'processing', 'draft']) {
      await readable(page.locator('#statuses').getByText(status, { exact: true }), status + ' status');
    }
    await page.locator('#account-settings summary').filter({ hasText: 'Change password' }).click();
    await surface(page.locator('#buyer-password-current'), theme, 'Account password field');
    await readable(page.locator('#buyer-password-current'), 'Account password text');
    await surface(page.locator('#review-form form'), theme, 'Review form');
    await surface(page.locator('#review-title'), theme, 'Review input');
    await readable(page.locator('#review-title'), 'Review input text');
    await surface(page.locator('#review-card > div'), theme, 'Review card');
    await readable(page.getByText('Verified Purchase', { exact: true }), 'Verified badge');

    await page.getByRole('button', { name: 'Open notifications', exact: true }).click();
    await page.getByRole('heading', { name: 'Notifications', exact: true }).waitFor();
    const panel = page.getByRole('heading', { name: 'Notifications', exact: true }).locator('../..');
    await surface(panel, theme, 'Notification portal');
    await readable(panel.getByRole('button', { name: 'all', exact: true }), 'Selected notification tab');
    await readable(panel.getByRole('button', { name: 'unread', exact: true }), 'Unselected notification tab');
    await readable(page.getByText('A new chapter is ready.', { exact: true }), 'Unread notification');
    await readable(page.getByText('Welcome to your library.', { exact: true }), 'Read notification');
    await panel.getByRole('button', { name: 'Close', exact: true }).click();
    if (process.env.SCREENSHOT_DIR && theme === 'light') {
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ animations: 'disabled', path: process.env.SCREENSHOT_DIR + '/theme-surfaces-light.png' });
    }
  }
  await page.evaluate(() => window.appPrefs.getState().setThemeMode('auto'));
  console.log('PASS light/dark/light search, filter and sort sheets, library actions, account fields, reviews, notification portals, status contrast and unchanged artwork');
};
