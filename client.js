/**
 * dsh-price-period — Client half.
 *
 * One chip in `conversation.session.header.utilities`, the title-bar row's
 * right-hand tool seat: it sits immediately after the mode switcher, left of
 * the shipped icon buttons.
 *
 * The pricing clock follows the official DeepSeek rate card:
 *   peak      Mon–Fri 09:00–12:00 and 14:00–18:00 Asia/Shanghai,
 *             excluding Chinese public holidays
 *   off-peak  everything else (half price), including weekends and holidays
 *
 * Everything is computed from the browser clock, so there is no Host call and
 * nothing to keep in sync. When the next switch is under 30 minutes away the
 * chip appends a live countdown.
 */

window.__ModuleLoader__.load({
  id: 'dsh-price-period',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Locale namespace; the same name is passed to the Slot registration as `locale`. */
    const NS = 'price-period';
    const SLOT = 'conversation.session.header.utilities';

    /** The rate card is written in Beijing time; the machine may be anywhere. */
    const TZ = 'Asia/Shanghai';

    /** Peak windows as minutes after Beijing midnight: [start, end). */
    const PEAK_WINDOWS = [[9 * 60, 12 * 60], [14 * 60, 18 * 60]];

    /** Show the countdown only while the next switch is closer than this. */
    const COUNTDOWN_WINDOW_MS = 30 * 60 * 1000;

    /**
     * Chinese public holidays. Single source of truth: data/cn-holidays.json
     * in this repository. The block below is generated from it by
     * tools/sync-holidays.mjs (`--mirror` also copies that file to
     * ~/.dsh/data/ for the Python tooling that reads the same table).
     * Weekends are measured separately, and make-up working weekends stay
     * off-peak — the official wording makes every weekend half price.
     * A year missing from HOLIDAYS_COVERED falls back to "weekends only" and
     * is reported as `uncovered`, so the chip can say so instead of guessing.
     */
    /* <holidays:begin> — 由 tools/sync-holidays.mjs 从 data/cn-holidays.json 生成，别手改 */
    const HOLIDAYS_COVERED = [2026];
    const HOLIDAYS = new Set([
      // 2026
      '2026-01-01', '2026-01-02', '2026-01-03',
      '2026-02-15', '2026-02-16', '2026-02-17',
      '2026-02-18', '2026-02-19', '2026-02-20',
      '2026-02-21', '2026-02-22', '2026-02-23',
      '2026-04-04', '2026-04-05', '2026-04-06',
      '2026-05-01', '2026-05-02', '2026-05-03',
      '2026-05-04', '2026-05-05', '2026-06-19',
      '2026-06-20', '2026-06-21', '2026-09-25',
      '2026-09-26', '2026-09-27', '2026-10-01',
      '2026-10-02', '2026-10-03', '2026-10-04',
      '2026-10-05', '2026-10-06', '2026-10-07',
    ]);
    /* <holidays:end> */

    const DICT = {
      en: {
        'period.peak': 'Peak',
        'period.offpeak': 'Half price',
        'to.peak': 'peak in',
        'to.offpeak': 'half price in',
        'hint.schedule': 'Peak hours: Mon–Fri 09:00–12:00 and 14:00–18:00 (Beijing time), excluding Chinese public holidays. Every other hour is half price.',
        'hint.holiday': 'Today is a Chinese public holiday — half price all day.',
        'hint.uncovered': 'The {year} holiday calendar is not bundled yet: weekends only for now, so public holidays may show as peak.',
        'hint.next': 'Next switch at {time} → {state}.',
      },
      zh: {
        'period.peak': '高峰期',
        'period.offpeak': '半价期',
        'to.peak': '距高峰',
        'to.offpeak': '距半价',
        'hint.schedule': '高峰：周一至周五 09:00–12:00、14:00–18:00（北京时间），法定节假日除外；其余时间均为半价。',
        'hint.holiday': '今天是法定节假日，全天半价。',
        'hint.uncovered': '{year} 年的法定节假日表尚未收录：目前只按周末判断，法定假日可能显示为高峰期。',
        'hint.next': '下次切换：{time} → {state}。',
      },
    };

    const CSS = `
.dsh-price-period{display:inline-flex;align-items:center;gap:6px;height:26px;margin:0 4px 0 2px;padding:0 9px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:var(--dsw-alias-bg-layer-1);font:inherit;font-size:12px;line-height:1;white-space:nowrap;-webkit-user-select:none;user-select:none;max-width:100%;overflow:hidden}
.dsh-price-period__dot{flex:none;width:6px;height:6px;border-radius:50%;background:currentColor}
.dsh-price-period__label{font-weight:500;overflow:hidden;text-overflow:ellipsis}
.dsh-price-period__warn{flex:none;font-size:11px;line-height:1}
.dsh-price-period__count{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.dsh-price-period[data-state=peak]{color:var(--dsw-alias-state-warn-primary)}
.dsh-price-period[data-state=offpeak]{color:var(--dsw-alias-state-success-primary)}
`;

    const pad2 = (n) => String(n).padStart(2, '0');

    /** One formatter for the whole module: `Intl` construction is not free. */
    const CLOCK = new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    });

    /**
     * Beijing wall-clock readings for one instant, expressed as a pseudo-UTC
     * epoch (`stamp`) so day arithmetic and differences stay exact — China has
     * no daylight saving, so the wall clock and the instant move together.
     */
    function wallClock(ms) {
      const parts = {};
      for (const part of CLOCK.formatToParts(new Date(ms))) {
        if (part.type !== 'literal') parts[part.type] = part.value;
      }
      const y = Number(parts.year);
      const mo = Number(parts.month);
      const day = Number(parts.day);
      // Some engines report midnight as hour 24.
      const hour = Number(parts.hour) % 24;
      const minute = Number(parts.minute);
      const second = Number(parts.second);
      return {
        y, mo, day, hour, minute, second,
        key: `${y}-${pad2(mo)}-${pad2(day)}`,
        weekday: new Date(Date.UTC(y, mo - 1, day)).getUTCDay(),
        minutes: hour * 60 + minute,
        stamp: Date.UTC(y, mo - 1, day, hour, minute, second),
      };
    }

    const isHoliday = (clock) => HOLIDAYS.has(clock.key);

    function isPeakWorkday(clock) {
      return clock.weekday >= 1 && clock.weekday <= 5 && !isHoliday(clock);
    }

    /**
     * The first switch after `clock`, scanning forward far enough to cross a
     * weekend plus the longest holiday block (Spring Festival 9 days → up to
     * 12 days to the next workday). `peak` describes the period that starts
     * there.
     */
    function nextBoundary(clock) {
      const dayStart = Date.UTC(clock.y, clock.mo - 1, clock.day);
      for (let offset = 0; offset < 21; offset += 1) {
        const start = dayStart + offset * 86400000;
        const date = new Date(start);
        const y = date.getUTCFullYear();
        const mo = date.getUTCMonth() + 1;
        const day = date.getUTCDate();
        const weekday = date.getUTCDay();
        if (weekday < 1 || weekday > 5 || HOLIDAYS.has(`${y}-${pad2(mo)}-${pad2(day)}`)) continue;
        for (const [open, close] of PEAK_WINDOWS) {
          for (const [at, peak] of [[open, true], [close, false]]) {
            const stamp = start + at * 60000;
            if (stamp > clock.stamp) return { stamp, peak };
          }
        }
      }
      return null;
    }

    /** Everything the chip renders, for one instant. */
    function describe(ms) {
      const clock = wallClock(ms);
      const workday = isPeakWorkday(clock);
      const peak = workday && PEAK_WINDOWS.some(([open, close]) => clock.minutes >= open && clock.minutes < close);
      const next = nextBoundary(clock);
      return {
        peak,
        holiday: isHoliday(clock),
        /** This year is not in HOLIDAYS_COVERED: weekday holidays will read as peak. */
        uncovered: !HOLIDAYS_COVERED.includes(clock.y),
        next,
        remaining: next ? next.stamp - clock.stamp : Infinity,
        clock,
      };
    }

    /** mm:ss under an hour, h:mm:ss above it. */
    function remainingText(ms) {
      const total = Math.max(0, Math.ceil(ms / 1000));
      const hours = Math.floor(total / 3600);
      const minutes = Math.floor((total % 3600) / 60);
      const seconds = total % 60;
      return hours > 0
        ? `${hours}:${pad2(minutes)}:${pad2(seconds)}`
        : `${pad2(minutes)}:${pad2(seconds)}`;
    }

    /** Beijing hh:mm of a pseudo-UTC stamp. */
    function clockText(stamp) {
      const date = new Date(stamp);
      return `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}`;
    }

    function PricePeriodChip({ t }) {
      const [now, setNow] = React.useState(() => Date.now());

      React.useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
      }, []);

      const state = describe(now);
      const label = state.peak ? t('period.peak') : t('period.offpeak');
      const nextLabel = state.next && state.next.peak ? t('period.peak') : t('period.offpeak');
      const showCountdown = state.remaining > 0 && state.remaining < COUNTDOWN_WINDOW_MS;
      const uncoveredText = state.uncovered ? t('hint.uncovered').replace('{year}', String(state.clock.y)) : '';

      const hint = [
        t('hint.schedule'),
        state.holiday ? t('hint.holiday') : '',
        uncoveredText,
        state.next
          ? t('hint.next').replace('{time}', clockText(state.next.stamp)).replace('{state}', nextLabel)
          : '',
      ].filter(Boolean).join(' ');

      const spoken = [
        label,
        showCountdown ? `${nextLabel} ${remainingText(state.remaining)}` : '',
        state.uncovered ? '⚠' : '',
      ].filter(Boolean).join(' · ');

      return h(React.Fragment, null,
        h('style', { key: 'css' }, CSS),
        h('div', {
          key: 'chip',
          className: 'dsh-price-period',
          'data-state': state.peak ? 'peak' : 'offpeak',
          'data-price-period': '',
          'data-uncovered': state.uncovered ? 'true' : undefined,
          title: hint,
          'aria-label': spoken,
        },
          h('span', { className: 'dsh-price-period__dot', 'aria-hidden': true }),
          h('span', { className: 'dsh-price-period__label' }, label),
          state.uncovered
            ? h('span', { className: 'dsh-price-period__warn', 'aria-hidden': true, title: uncoveredText }, '⚠')
            : null,
          showCountdown
            ? h('span', { className: 'dsh-price-period__count' },
              `· ${state.next.peak ? t('to.peak') : t('to.offpeak')} ${remainingText(state.remaining)}`)
            : null,
        ),
      );
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { en: DICT.en, zh: DICT.zh }), 'price-period: dictionaries');
        ctx.effect(
          () => ctx.slots.inject(SLOT, () => ctx.slots.register({
            name: SLOT, id: 'dsh-price-period', order: -20, locale: NS,
          }, PricePeriodChip)),
          'price-period: header chip',
        );
      },
      /** Test seam: the pure clock helpers plus the component shell, exercised by test/period.test.mjs. */
      __period: {
        describe, nextBoundary, wallClock, remainingText,
        HOLIDAYS, HOLIDAYS_COVERED, PEAK_WINDOWS, PricePeriodChip,
      },
    };
  },
});
