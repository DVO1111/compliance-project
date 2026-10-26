/**
 *  FACILITY LOGS — TRENDS (W6·29, FL-06 and FL-07)
 *
 *  FL-06's own note is the specification, and it is unusually
 *  prescriptive about accessibility rather than about looks:
 *
 *      "One series per chart, no colour-only meaning: points change
 *       shape (filled circle, hollow square, solid square) and the
 *       limits differ by dash pattern and are labelled at the line
 *       end. Axes are labelled. 'Show as table' gives the same
 *       numbers for screen readers and print. FL-07 is this screen in
 *       greyscale."
 *
 *  FL-07 is not a second feature — it is the same screen checked in
 *  greyscale. So every rule above is load-bearing:
 *
 *    - A point's SHAPE is its meaning. Colour is applied too, but
 *      removing it loses nothing, which is what FL-07 verifies.
 *    - The two limit lines differ by DASH PATTERN (alert long-dash,
 *      action dotted) and each is labelled at its right-hand end,
 *      so neither depends on a legend swatch.
 *    - Both axes carry a written label, not just tick numbers.
 *    - The legend NAMES the shape in words — "Within limit (filled
 *      circle)" — so it reads correctly aloud.
 *    - "Show as table" renders a real <table> of the same numbers,
 *      taken from the same series the chart draws.
 *
 *  The weekly maximum, not the mean: FL-06's subtitle says "Highest
 *  settle-plate count per zone per week", and a mean would hide the
 *  single excursion that matters. `facility_log_trend()` does that
 *  aggregation in the database.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid,
  ReferenceLine, Tooltip, Label,
} from 'recharts';
import {
  ArrowLeft, Loader2, AlertTriangle, TrendingUp, Table as TableIcon, Download,
} from 'lucide-react';
import { logger } from '../../lib/logger';
import {
  listTrend, groupTrend, summariseTrend, trendToCsv,
  TREND_RANGES, TREND_LOG_TYPES, BAND_LEGEND, LOG_TYPE_LABELS,
  type FacilityLogType, type TrendSeries, type TrendBand,
} from '../../lib/facility/facilityLogService';

/*
 *  The three point shapes, drawn as SVG rather than chosen from a
 *  palette. A reader who cannot distinguish the colours — or who is
 *  looking at FL-07's greyscale print — still gets three visibly
 *  different marks.
 */
function BandDot(props: { cx?: number; cy?: number; band: TrendBand }) {
  const { cx, cy, band } = props;
  if (cx == null || cy == null) return null;
  const stroke = 'var(--color-text-primary)';
  if (band === 'within') {
    return <circle cx={cx} cy={cy} r={4} fill={stroke} stroke={stroke} strokeWidth={1.5} />;
  }
  if (band === 'above_alert') {
    //  Hollow: a white interior reads as hollow on paper too.
    return (
      <rect
        x={cx - 4} y={cy - 4} width={8} height={8}
        fill="var(--color-surface)" stroke={stroke} strokeWidth={2}
      />
    );
  }
  return (
    <rect x={cx - 4.5} y={cy - 4.5} width={9} height={9} fill={stroke} stroke={stroke} strokeWidth={1.5} />
  );
}

function LegendRow() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-[var(--color-text-secondary)]">
      {(Object.keys(BAND_LEGEND) as TrendBand[]).map((b) => (
        <li key={b} className="flex items-center gap-1.5">
          <svg width="12" height="12" aria-hidden="true" className="shrink-0">
            <BandDot cx={6} cy={6} band={b} />
          </svg>
          {BAND_LEGEND[b]}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <svg width="18" height="12" aria-hidden="true" className="shrink-0">
          <line x1="0" y1="6" x2="18" y2="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="6 3" />
        </svg>
        Alert limit (long dash)
      </li>
      <li className="flex items-center gap-1.5">
        <svg width="18" height="12" aria-hidden="true" className="shrink-0">
          <line x1="0" y1="6" x2="18" y2="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="1 3" />
        </svg>
        Action limit (dotted)
      </li>
    </ul>
  );
}

const BADGE_TONE: Record<TrendBand, string> = {
  within: 'bg-[var(--color-surface-alt)] text-[var(--color-text-secondary)]',
  above_alert: 'bg-amber-500/10 text-amber-700',
  outside_action: 'bg-red-500/10 text-red-700',
};

function fmtWeek(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

/** One zone, one series — which is what "one series per chart" means. */
function ZoneChart({ series, showTable }: { series: TrendSeries; showTable: boolean }) {
  const narrative = useMemo(() => summariseTrend(series), [series]);
  const unitLabel = series.unit ? `Highest count, ${series.unit}` : 'Highest count';
  const data = series.points.map((p) => ({ ...p, week: fmtWeek(p.weekStart) }));

  //  Headroom above the action limit, so a breach is not clipped at
  //  the top of the plot and read as merely touching the line.
  const peak = Math.max(
    ...series.points.map((p) => p.value),
    series.actionLimit ?? 0,
    series.alertLimit ?? 0,
  );
  const yMax = Math.ceil((peak * 1.15) / 20) * 20 || 20;

  /*
   *  Explicit ticks, because left to itself recharts divides the
   *  domain into five and produces steps like 35 and 105. FL-06's axis
   *  counts in twenties, and a reader checking a reading of 60 against
   *  a gridline should not have to interpolate between 35 and 70.
   *
   *  The step is the smallest multiple of 10 that keeps the axis to
   *  about seven labels, so a tall chart does not end up with forty.
   */
  const step = Math.max(10, Math.ceil(yMax / 7 / 10) * 10);
  const ticks = Array.from({ length: Math.floor(yMax / step) + 1 }, (_, i) => i * step);

  return (
    <section className="border border-[var(--color-border)] rounded-xl p-4">
      <header className="flex flex-wrap items-start justify-between gap-2 mb-1">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
          {series.zoneName}
          {series.zoneGrade && (
            <span className="font-normal text-[var(--color-text-tertiary)]"> · {series.zoneGrade}</span>
          )}
        </h3>
        <span className={`text-[11px] px-2 py-0.5 rounded-full ${BADGE_TONE[narrative.worstBand]}`}>
          {narrative.badge}
        </span>
      </header>

      {/*  The sentence is part of the design, not decoration: it states
          what the chart shows for anyone who cannot read the plot. */}
      <p className="text-xs text-[var(--color-text-secondary)] mb-3">{narrative.sentence}</p>

      {showTable ? (
        //  "Show as table gives the same numbers for screen readers and
        //  print" — a real table, from the same series.
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <caption className="sr-only">
              {`Weekly highest result for ${series.zoneName}`}
            </caption>
            <thead className="bg-[var(--color-surface-alt)]">
              <tr className="text-left text-[var(--color-text-tertiary)]">
                <th scope="col" className="px-2 py-1.5 font-semibold">Week starting</th>
                <th scope="col" className="px-2 py-1.5 font-semibold">Highest</th>
                <th scope="col" className="px-2 py-1.5 font-semibold">Readings</th>
                <th scope="col" className="px-2 py-1.5 font-semibold">Standing</th>
              </tr>
            </thead>
            <tbody>
              {series.points.map((p) => (
                <tr key={p.weekStart} className="border-t border-[var(--color-border)]">
                  <th scope="row" className="px-2 py-1.5 font-normal text-left">{fmtWeek(p.weekStart)}</th>
                  <td className="px-2 py-1.5 tabular-nums">
                    {p.value}{series.unit ? ` ${series.unit}` : ''}
                  </td>
                  <td className="px-2 py-1.5 tabular-nums">{p.samples}</td>
                  <td className="px-2 py-1.5">{BAND_LEGEND[p.band]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="h-[260px] -ml-2" role="img"
          aria-label={`${series.zoneName}. ${narrative.sentence} Use "Show as table" for the numbers.`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 64, bottom: 24, left: 8 }}>
              <CartesianGrid stroke="var(--color-border)" strokeOpacity={0.5} vertical={false} />
              <XAxis
                dataKey="week"
                tick={{ fontSize: 10, fill: 'var(--color-text-tertiary)' }}
                stroke="var(--color-border)"
                interval="preserveStartEnd"
              >
                {/*  Axes are labelled — FL-06 says so explicitly. */}
                <Label
                  value="Week starting"
                  position="insideBottom"
                  offset={-16}
                  style={{ fontSize: 11, fill: 'var(--color-text-secondary)' }}
                />
              </XAxis>
              <YAxis
                domain={[0, yMax]}
                ticks={ticks}
                tick={{ fontSize: 10, fill: 'var(--color-text-tertiary)' }}
                stroke="var(--color-border)"
                width={46}
              >
                <Label
                  value={unitLabel}
                  angle={-90}
                  position="insideLeft"
                  style={{ fontSize: 11, fill: 'var(--color-text-secondary)', textAnchor: 'middle' }}
                />
              </YAxis>
              <Tooltip
                contentStyle={{
                  fontSize: 11,
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 8,
                }}
                formatter={(v: number) => [
                  `${v}${series.unit ? ` ${series.unit}` : ''}`, 'Highest',
                ]}
              />

              {/*  Labelled AT THE LINE END, so the dash pattern never
                  has to be matched against a legend. */}
              {series.alertLimit != null && (
                <ReferenceLine
                  y={series.alertLimit}
                  stroke="var(--color-text-secondary)"
                  strokeDasharray="6 3"
                >
                  <Label
                    value={`Alert ${series.alertLimit}`}
                    position="right"
                    style={{ fontSize: 10, fill: 'var(--color-text-secondary)' }}
                  />
                </ReferenceLine>
              )}
              {series.actionLimit != null && (
                <ReferenceLine
                  y={series.actionLimit}
                  stroke="var(--color-text-primary)"
                  strokeDasharray="1 3"
                >
                  <Label
                    value={`Action ${series.actionLimit}`}
                    position="right"
                    style={{ fontSize: 10, fill: 'var(--color-text-primary)' }}
                  />
                </ReferenceLine>
              )}

              <Line
                type="linear"
                dataKey="value"
                stroke="var(--color-text-primary)"
                strokeWidth={1.75}
                isAnimationActive={false}
                dot={(p: { cx?: number; cy?: number; payload?: { band: TrendBand }; index?: number }) => (
                  <BandDot
                    key={p.index}
                    cx={p.cx}
                    cy={p.cy}
                    band={p.payload?.band ?? 'within'}
                  />
                )}
                activeDot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

export default function FacilityTrendsView({
  companyId, onBack,
}: {
  companyId: string;
  onBack: () => void;
}) {
  const [logType, setLogType] = useState<FacilityLogType>('environmental_air');
  const [weeks, setWeeks] = useState(12);
  const [series, setSeries] = useState<TrendSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSeries(groupTrend(await listTrend(companyId, logType, weeks)));
    } catch (err) {
      logger.error('[facility] trend load failed', { err: String(err) });
      setError(err instanceof Error ? err.message : 'The trends could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [companyId, logType, weeks]);

  useEffect(() => { void load(); }, [load]);

  const download = () => {
    //  Same series the charts draw, so the file cannot disagree with
    //  the screen.
    const blob = new Blob([trendToCsv(series)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `facility-trends-${logType}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.style.visibility = 'hidden';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] min-h-[32px]"
          >
            <ArrowLeft className="w-4 h-4" /> Back to the register
          </button>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)] mt-1 flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-[var(--color-accent)]" />
            Trends
          </h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1 max-w-2xl">
            Highest result per zone per week. Each chart has its own limits drawn as
            labelled lines.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowTable((v) => !v)}
            aria-pressed={showTable}
            className="flex items-center gap-1.5 px-3 py-2.5 min-h-[40px] rounded-xl text-sm border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)]"
          >
            <TableIcon className="w-4 h-4" />
            {showTable ? 'Show as charts' : 'Show as table'}
          </button>
          <button
            onClick={download}
            disabled={series.length === 0}
            className="flex items-center gap-1.5 px-3 py-2.5 min-h-[40px] rounded-xl text-sm border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)] disabled:opacity-50"
          >
            <Download className="w-4 h-4" /> Download CSV
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="flex gap-1 overflow-x-auto pb-1" role="tablist" aria-label="Log type">
          {TREND_LOG_TYPES.map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={logType === t}
              onClick={() => setLogType(t)}
              className={`px-3 py-2 min-h-[36px] rounded-lg text-sm font-medium whitespace-nowrap ${
                logType === t ? 'text-white' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)]'
              }`}
              style={logType === t ? { background: 'var(--color-accent)' } : undefined}
            >
              {LOG_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
        <div className="flex gap-1" role="group" aria-label="Period">
          {TREND_RANGES.map((r) => (
            <button
              key={r.weeks}
              aria-pressed={weeks === r.weeks}
              onClick={() => setWeeks(r.weeks)}
              className={`px-3 py-2 min-h-[36px] rounded-lg text-sm whitespace-nowrap border ${
                weeks === r.weeks
                  ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                  : 'border-[var(--color-border)] text-[var(--color-text-secondary)]'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {!loading && !error && series.length > 0 && <LegendRow />}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)] p-6">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading the trends…
        </div>
      ) : error ? (
        <div role="alert" className="border rounded-xl p-4 bg-red-500/10 border-red-500/30">
          <p className="text-sm text-red-700 font-medium flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{error}
          </p>
          <button onClick={() => void load()} className="mt-2 text-sm underline text-[var(--color-text-secondary)] min-h-[28px]">
            Try again
          </button>
        </div>
      ) : series.length === 0 ? (
        <div className="border border-[var(--color-border)] rounded-xl p-6">
          <p className="text-sm text-[var(--color-text-secondary)]">
            No measured readings of this type in the last {weeks} weeks, so there is
            nothing to trend yet. Only tests that record a number appear here — a
            cleaning record is done or not done rather than measured.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {series.map((s) => (
            <ZoneChart key={s.zoneId} series={s} showTable={showTable} />
          ))}
        </div>
      )}
    </div>
  );
}
