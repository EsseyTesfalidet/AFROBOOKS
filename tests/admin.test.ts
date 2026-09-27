import { test } from 'node:test';
import assert from 'node:assert/strict';
import { salesSummary } from '../lib/admin/metrics';
import { encodeCsv } from '../lib/admin/csv';

test('admin financial summaries exclude failed, refunded, future and out-of-range orders and retain empty calendar days', () => {
  const now = new Date(2026, 8, 27, 12);
  const sale = { status: 'completed', finalPrice: 1000, platformFee: 100, sellerEarnings: 850 };
  const summary = salesSummary(
    [
      { ...sale, createdAt: new Date(2026, 8, 21) },
      { ...sale, createdAt: { toDate: () => new Date(2026, 8, 27, 11) } },
      { ...sale, createdAt: new Date(2026, 8, 20, 23, 59) },
      { ...sale, createdAt: new Date(2026, 8, 28) },
      ...['pending', 'refunded', 'disputed', 'needs_review'].map((status) => ({
        ...sale,
        status,
        createdAt: now,
      })),
    ],
    7,
    now,
  );
  assert.equal(summary.count, 2);
  assert.equal(summary.gross, 2000);
  assert.equal(summary.platform, 200);
  assert.equal(summary.royalties, 1700);
  assert.equal(summary.series.length, 7);
  assert.equal(summary.series.filter((day) => day.count === 0).length, 5);
  assert.equal(
    summary.series.reduce((sum, day) => sum + day.gross, 0),
    summary.gross,
  );
});

test('admin CSV escapes book titles, newlines and spreadsheet formula prefixes', () => {
  const csv = encodeCsv([
    ['Book', 'Price'],
    ['A "quoted", title\nPart 2', 10],
    ['=HYPERLINK("bad")', '+SUM(A1)'],
    ['  @SUM(A1)', '-1+2'],
  ]);
  assert.ok(csv.includes('"A ""quoted"", title\nPart 2","10"'));
  assert.ok(csv.includes('"\'=HYPERLINK(""bad"")","\'+SUM(A1)"'));
  assert.ok(csv.includes('"\'  @SUM(A1)","\'-1+2"'));
});
