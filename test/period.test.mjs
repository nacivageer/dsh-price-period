import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

/**
 * Loads the shipped client.js the way the browser module loader does — a fake
 * `window.__ModuleLoader__` plus a `react` stub — and exercises the pure clock
 * helpers exposed through the plugin's `__period` test seam. Nothing here
 * duplicates the scheduling logic, so a drift in client.js fails the test.
 */

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');

let plugin = null;

/** What the fake clock returns to the component's useState during render assertions. */
const fixedNow = { value: 0 };

/** Minimal React stub that keeps the element tree inspectable. */
const createElement = (type, props, ...children) => ({
  type,
  props: props || {},
  children: children.flat(),
});

const sandbox = {
  window: {
    __ModuleLoader__: {
      load: (mod) => {
        plugin = mod.factory((id) => {
          if (id === 'react') {
            return {
              createElement,
              Fragment: 'Fragment',
              useState: () => [fixedNow.value, () => {}],
              useEffect() {},
            };
          }
          throw new Error(`unexpected module: ${id}`);
        });
      },
    },
  },
  console,
  Date, Intl, Math, Number, String, Set, Array, Object,
  setInterval: () => 0,
  clearInterval: () => {},
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(source, sandbox);

assert.ok(plugin, 'client.js did not register a module');
const { describe, remainingText } = plugin.__period;

const HOUR = 60 * 60 * 1000;

/** Pseudo-UTC stamp for a Beijing wall-clock instant. */
const beijing = (y, mo, d, h, mi = 0) => Date.UTC(y, mo - 1, d, h, mi);

const cases = [
  {
    name: 'Friday 08:35 — half price, peak in 25 minutes',
    now: Date.parse('2026-11-06T08:35:00+08:00'),
    peak: false,
    remaining: 25 * 60 * 1000,
    next: beijing(2026, 11, 6, 9),
  },
  {
    name: 'Friday 07:33 — half price, next switch is over 30 minutes out',
    now: Date.parse('2026-11-06T07:33:00+08:00'),
    peak: false,
    remaining: 87 * 60 * 1000,
    next: beijing(2026, 11, 6, 9),
  },
  {
    name: 'Friday 09:00 sharp — peak begins',
    now: Date.parse('2026-11-06T09:00:00+08:00'),
    peak: true,
    remaining: 3 * HOUR,
    next: beijing(2026, 11, 6, 12),
  },
  {
    name: 'Friday 09:30 — peak, next is the 12:00 half price',
    now: Date.parse('2026-11-06T09:30:00+08:00'),
    peak: true,
    remaining: 150 * 60 * 1000,
    next: beijing(2026, 11, 6, 12),
  },
  {
    name: 'Friday 12:30 — half price, peak at 14:00',
    now: Date.parse('2026-11-06T12:30:00+08:00'),
    peak: false,
    remaining: 90 * 60 * 1000,
    next: beijing(2026, 11, 6, 14),
  },
  {
    name: 'Friday 23:30 — half price through the weekend to Monday 09:00',
    now: Date.parse('2026-11-06T23:30:00+08:00'),
    peak: false,
    remaining: 57.5 * HOUR,
    next: beijing(2026, 11, 9, 9),
  },
  {
    name: 'Saturday 10:00 — weekend is off-peak all day',
    now: Date.parse('2026-11-07T10:00:00+08:00'),
    peak: false,
    remaining: 47 * HOUR,
    next: beijing(2026, 11, 9, 9),
  },
  {
    name: '2026-10-02 10:00 — National Day is off-peak all day',
    now: Date.parse('2026-10-02T10:00:00+08:00'),
    peak: false,
    remaining: 5 * 24 * HOUR + 23 * HOUR,
    next: beijing(2026, 10, 8, 9),
    holiday: true,
  },
  {
    name: '2026-09-30 18:30 — eve of National Day, next peak after the holiday',
    now: Date.parse('2026-09-30T18:30:00+08:00'),
    peak: false,
    remaining: 7 * 24 * HOUR + 14.5 * HOUR,
    next: beijing(2026, 10, 8, 9),
  },
  {
    name: '2026-02-14 10:00 — make-up working Saturday is still half price',
    now: Date.parse('2026-02-14T10:00:00+08:00'),
    peak: false,
    remaining: 9 * 24 * HOUR + 23 * HOUR,
    next: beijing(2026, 2, 24, 9),
  },
  {
    name: '2026-10-01 10:00 — covered year, holiday flag is on',
    now: Date.parse('2026-10-01T10:00:00+08:00'),
    peak: false,
    holiday: true,
    uncovered: false,
    remaining: 6 * 24 * HOUR + 23 * HOUR,
    next: beijing(2026, 10, 8, 9),
  },
  {
    // 契约是「说清楚自己在猜」，不是「猜对」：2027 安排发布前，工作日假期
    // 必然被读成高峰，芯片靠 ⚠ 与 tooltip 把它暴露出来，这条用例锁住这个行为。
    name: '2027-01-01 10:00 — uncovered year degrades to weekends only, flagged',
    now: Date.parse('2027-01-01T10:00:00+08:00'),
    peak: true,
    holiday: false,
    uncovered: true,
    remaining: 2 * HOUR,
    next: beijing(2027, 1, 1, 12),
  },
];

for (const testCase of cases) {
  const state = describe(testCase.now);
  assert.equal(state.peak, testCase.peak, `${testCase.name}: peak`);
  assert.equal(state.remaining, testCase.remaining, `${testCase.name}: remaining`);
  assert.equal(state.next?.stamp, testCase.next, `${testCase.name}: next switch`);
  if (testCase.holiday !== undefined) assert.equal(state.holiday, testCase.holiday, `${testCase.name}: holiday`);
  if (testCase.uncovered !== undefined) assert.equal(state.uncovered, testCase.uncovered, `${testCase.name}: uncovered`);
}

assert.equal(remainingText(25 * 60 * 1000), '25:00', 'countdown formatting');
assert.equal(remainingText(59 * 1000), '00:59', 'countdown formatting under a minute');

/**
 * 渲染断言：`uncovered` 是给用户看的，不能只是 describe() 里一个布尔。
 * 用最小 React 替身把组件跑一遍，检查 ⚠、tooltip 与倒计时确实出现在元素树里。
 */
const { PricePeriodChip } = plugin.__period;

function renderChip(iso) {
  fixedNow.value = Date.parse(iso);
  const tree = PricePeriodChip({ t: (key) => key });
  const chip = tree.children.find((node) => node && node.props && node.props['data-price-period'] === '');
  assert.ok(chip, `${iso}: chip element missing`);
  return chip;
}

const byClass = (chip, className) => chip.children.find((node) => node && node.props && node.props.className === className);

const uncovered = renderChip('2027-01-01T10:00:00+08:00');
assert.equal(uncovered.props['data-uncovered'], 'true', '未收录年份应带 data-uncovered');
assert.ok(byClass(uncovered, 'dsh-price-period__warn'), '未收录年份应渲染 ⚠');
assert.ok(uncovered.props.title.includes('hint.uncovered'), '未收录年份的 tooltip 应说明原因');

const covered = renderChip('2026-10-01T10:00:00+08:00');
assert.equal(covered.props['data-uncovered'], undefined, '已收录年份不应带 data-uncovered');
assert.ok(!byClass(covered, 'dsh-price-period__warn'), '已收录年份不应渲染 ⚠');

const countdown = renderChip('2026-11-06T08:35:00+08:00');
const count = byClass(countdown, 'dsh-price-period__count');
assert.ok(count, '距跨期 25 分钟时应渲染倒计时');
assert.equal(count.children.join(''), '· to.peak 25:00', '倒计时文案');

const quiet = renderChip('2026-11-06T07:33:00+08:00');
assert.ok(!byClass(quiet, 'dsh-price-period__count'), '距跨期 87 分钟时不应渲染倒计时');

/**
 * 表一致性校验：client.js 内联的 HOLIDAYS / HOLIDAYS_COVERED 必须与仓库里的
 * data/cn-holidays.json 一致，否则浏览器里的标签和 Python 估算脚本会各说各话。
 * 数据文件是仓库的一部分，读不到就是仓库坏了——直接失败，不降级成警告
 * （警告会让 CI 在没验证的情况下变绿）。
 */
const holidaysFile = new URL('../data/cn-holidays.json', import.meta.url);
const shared = JSON.parse(readFileSync(holidaysFile, 'utf8'));

assert.ok(Array.isArray(shared.dates) && shared.dates.length, 'data/cn-holidays.json: dates missing');
assert.ok(Array.isArray(shared.coveredYears) && shared.coveredYears.length, 'data/cn-holidays.json: coveredYears missing');
assert.deepEqual(
  [...plugin.__period.HOLIDAYS].sort(),
  [...shared.dates].sort(),
  'client.js 的 HOLIDAYS 应与 data/cn-holidays.json 一致（跑 node tools/sync-holidays.mjs）',
);
assert.deepEqual(
  [...plugin.__period.HOLIDAYS_COVERED],
  shared.coveredYears,
  'client.js 的 HOLIDAYS_COVERED 应与 data/cn-holidays.json 一致（跑 node tools/sync-holidays.mjs）',
);
for (const day of plugin.__period.HOLIDAYS) {
  assert.ok(
    plugin.__period.HOLIDAYS_COVERED.includes(Number(day.slice(0, 4))),
    `${day} 的年份未列进 coveredYears`,
  );
}

console.log(`ok — ${cases.length} clock cases + 渲染断言 + 节假日表一致`);
