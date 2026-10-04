import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APP_APPEARANCE_BOOTSTRAP, resolveAppTheme, safeCoverColor } from '../lib/app/appearance';

test('automatic app theme uses local 6am/6pm boundaries; manual choices win', () => {
  for (const [hour, expected] of [[0, 'dark'], [5, 'dark'], [6, 'light'], [17, 'light'], [18, 'dark'], [23, 'dark']] as const) {
    const date = new Date(2026, 9, 4, hour, 0, 0);
    assert.equal(resolveAppTheme('auto', date), expected);
    assert.equal(resolveAppTheme('light', date), 'light');
    assert.equal(resolveAppTheme('dark', date), 'dark');
  }
});

test('early theme bootstrap honors saved mode and tolerates unavailable/corrupt storage', () => {
  const run = (appMode: string, value: string | Error) => {
    const root = { dataset: { appMode } as Record<string, string> };
    new Function('document', 'localStorage', APP_APPEARANCE_BOOTSTRAP)({ documentElement: root }, {
      getItem: () => { if (value instanceof Error) throw value; return value; },
    });
    return root.dataset.appTheme;
  };
  assert.equal(run('installed', '{"state":{"themeMode":"light"}}'), 'light');
  assert.equal(run('installed', '{"state":{"themeMode":"dark"}}'), 'dark');
  assert.equal(run('installed', '{bad'), resolveAppTheme('auto'));
  assert.equal(run('installed', new Error('denied')), resolveAppTheme('auto'));
  assert.equal(run('installed', '{"state":{"themeMode":"bad"}}'), resolveAppTheme('auto'));
  assert.equal(run('browser', '{"state":{"themeMode":"light"}}'), undefined);
});

test('cover decoration accepts colors, not arbitrary CSS or remote resources', () => {
  assert.equal(safeCoverColor('#aB1234'), '#aB1234');
  for (const invalid of ['url(https://example.com)', 'red;display:none', undefined, '#fff', 'transparent']) {
    assert.equal(safeCoverColor(invalid, '#123456'), '#123456');
  }
});
