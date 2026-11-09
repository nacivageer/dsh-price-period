#!/usr/bin/env node
/**
 * sync-holidays.mjs — 把 data/cn-holidays.json 里的法定节假日日期写进
 * client.js 的 HOLIDAYS 字面量（浏览器端读不了文件，只能内联）。
 *
 * 用法:
 *   node tools/sync-holidays.mjs                  # 重写 client.js
 *   node tools/sync-holidays.mjs --check          # 只校验，不一致 exit 1
 *   node tools/sync-holidays.mjs --mirror         # 另把仓内 JSON 同步到 ~/.dsh/data/
 *   node tools/sync-holidays.mjs --from 其他.json  # 用别的数据文件（不推荐）
 *
 * 数据文件查找: --from → $DSH_PRICE_HOLIDAYS → <repo>/data/cn-holidays.json
 *               → ~/.dsh/data/cn-holidays.json（最后一项只为兼容旧布局）
 * 唯一真相在仓库里的 data/cn-holidays.json；改日期永远改它，再跑本脚本。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const CLIENT = join(ROOT, 'client.js');
const REPO_DATA = join(ROOT, 'data', 'cn-holidays.json');
const BEGIN = '/* <holidays:begin>';
const END = '/* <holidays:end> */';

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const option = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
};

const MIRROR = option('--mirror')
  || (flag('--mirror')
    ? (process.env.DSH_HOME
      ? join(process.env.DSH_HOME, 'data', 'cn-holidays.json')
      : join(homedir(), '.dsh', 'data', 'cn-holidays.json'))
    : null);

function dataPath() {
  const candidates = [
    option('--from'),
    process.env.DSH_PRICE_HOLIDAYS,
    REPO_DATA,
    (process.env.DSH_HOME
      ? join(process.env.DSH_HOME, 'data', 'cn-holidays.json')
      : join(homedir(), '.dsh', 'data', 'cn-holidays.json')),
  ].filter(Boolean);
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error(`cn-holidays.json not found (tried: ${candidates.join(', ')})`);
}

function renderBlock(dates, years) {
  const byYear = new Map();
  for (const d of [...dates].sort()) {
    const year = d.slice(0, 4);
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year).push(d);
  }
  const lines = [];
  for (const [year, days] of byYear) {
    lines.push(`      // ${year}`);
    for (let i = 0; i < days.length; i += 3) {
      lines.push(`      ${days.slice(i, i + 3).map((d) => `'${d}'`).join(', ')},`);
    }
  }
  return [
    `${BEGIN} — 由 tools/sync-holidays.mjs 从 data/cn-holidays.json 生成，别手改 */`,
    `    const HOLIDAYS_COVERED = [${years.join(', ')}];`,
    '    const HOLIDAYS = new Set([',
    ...lines,
    '    ]);',
    `    ${END}`,
  ].join('\n');
}

const source = dataPath();
const raw = JSON.parse(readFileSync(source, 'utf8'));
const dates = raw.dates ?? [];
const years = (raw.coveredYears ?? []).map(Number).sort((a, b) => a - b);
if (!dates.length) throw new Error(`${source} has no dates`);
if (!years.length) throw new Error(`${source} has no coveredYears`);
for (const d of dates) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error(`bad date: ${d}`);
  if (!years.includes(Number(d.slice(0, 4)))) {
    throw new Error(`date ${d} is outside coveredYears [${years.join(', ')}]`);
  }
}

const clientSource = readFileSync(CLIENT, 'utf8');
const eol = clientSource.includes('\r\n') ? '\r\n' : '\n';
const text = eol === '\n' ? clientSource : clientSource.replace(/\r\n/g, '\n');

const start = text.indexOf(BEGIN);
const end = text.indexOf(END, start);
if (start < 0 || end < 0) throw new Error(`markers ${BEGIN} / ${END} missing in client.js`);

const before = text.slice(0, start);
const after = text.slice(end + END.length);
const want = renderBlock(dates, years);
const current = text.slice(start, end + END.length);
const clientDrift = current !== want;

const mirrorDrift = MIRROR
  ? (!existsSync(MIRROR) || readFileSync(MIRROR, 'utf8') !== readFileSync(source, 'utf8'))
  : false;

if (flag('--check')) {
  if (clientDrift) {
    console.error('drift — client.js 的 HOLIDAYS 与 data/cn-holidays.json 不一致；跑 node tools/sync-holidays.mjs');
  }
  if (mirrorDrift) {
    console.error(`drift — ${MIRROR} 与 ${source} 不一致；跑 node tools/sync-holidays.mjs --mirror`);
  }
  if (!clientDrift && !mirrorDrift) {
    console.log(`ok — client.js 与 ${source} 一致（${dates.length} 天 / ${years.join(',')}）`);
  }
  process.exit(clientDrift || mirrorDrift ? 1 : 0);
}

if (clientDrift) {
  writeFileSync(CLIENT, (before + want + after).replace(/\n/g, eol), 'utf8');
  console.log(`written — ${dates.length} 天 / ${years.join(',')} → client.js`);
} else {
  console.log(`ok — client.js 已与 ${source} 一致（${dates.length} 天 / ${years.join(',')}）`);
}

if (MIRROR) {
  if (mirrorDrift) {
    mkdirSync(dirname(MIRROR), { recursive: true });
    writeFileSync(MIRROR, readFileSync(source, 'utf8'), 'utf8');
    console.log(`mirrored — ${source} → ${MIRROR}`);
  } else {
    console.log(`ok — ${MIRROR} 已与 ${source} 一致`);
  }
}
