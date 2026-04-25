import { useMemo, useState } from "react";
import { buildDailyTrend } from "../../../utils/dashboardMetrics";

const TREND_DAY_OPTIONS = [14, 30];
const TREND_SERIES = [
  { key: "productsCreated", className: "is-products", label: "상품 등록", offset: 1 / 6 },
  { key: "submissionsCreated", className: "is-submissions", label: "제출 등록", offset: 3 / 6 },
  { key: "depositVerified", className: "is-deposits", label: "입금 완료", offset: 5 / 6 }
];

function formatDayLabel(dayKey) {
  if (!dayKey) {
    return "-";
  }

  const [, month, day] = dayKey.split("-");
  return `${month}/${day}`;
}

function getBarHeight(value, maxValue) {
  if (!value || !maxValue) {
    return "0%";
  }

  return `${Math.max(8, Math.round((value / maxValue) * 100))}%`;
}

function getLinePoint(row, rowIndex, rowCount, seriesKey, seriesOffset, maxValue) {
  const x = rowCount <= 0 ? 50 : ((rowIndex + seriesOffset) / rowCount) * 100;
  const rawValue = Number(row?.[seriesKey] ?? 0);
  const y = rawValue > 0 && maxValue > 0 ? 100 - Math.max(8, Math.round((rawValue / maxValue) * 100)) : 100;

  return { x, y };
}

export default function DashboardTrendChart({ products = [], submissions = [], isLoading = false }) {
  const [trendDays, setTrendDays] = useState(14);
  const trendRows = useMemo(
    () =>
      buildDailyTrend({
        products,
        submissions,
        days: trendDays
      }),
    [products, submissions, trendDays]
  );
  const maxValue = trendRows.reduce(
    (max, row) => Math.max(max, row.productsCreated, row.submissionsCreated, row.depositVerified),
    0
  );
  const hasTrendData = maxValue > 0;
  const lineSeries = TREND_SERIES.map((series) => {
    const points = trendRows.map((row, index) =>
      getLinePoint(row, index, trendRows.length, series.key, series.offset, maxValue)
    );

    return {
      ...series,
      points,
      pointText: points.map((point) => `${point.x},${point.y}`).join(" ")
    };
  });

  return (
    <section className="dashboard-trend-panel" aria-label="기간별 추이">
      <div className="dashboard-section-heading">
        <div>
          <h2>기간별 추이</h2>
          <p>최근 {trendDays}일의 상품 등록, 제출 등록, 입금 완료 흐름을 비교합니다.</p>
        </div>
        <div className="dashboard-segmented-control" aria-label="추이 기간 선택">
          {TREND_DAY_OPTIONS.map((days) => (
            <button
              key={days}
              type="button"
              className={trendDays === days ? "active" : ""}
              onClick={() => setTrendDays(days)}
            >
              {days}일
            </button>
          ))}
        </div>
      </div>

      <div className="dashboard-trend-legend" aria-hidden="true">
        <span className="is-products">상품 등록</span>
        <span className="is-submissions">제출 등록</span>
        <span className="is-deposits">입금 완료</span>
      </div>

      {isLoading ? (
        <div className="dashboard-trend-empty">추이 데이터를 불러오는 중입니다.</div>
      ) : hasTrendData ? (
        <div className="dashboard-trend-scroll">
          <div className="dashboard-trend-chart">
            <svg className="dashboard-trend-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {lineSeries.map((series) => (
                <g key={series.key} className={series.className}>
                  <polyline points={series.pointText} />
                </g>
              ))}
            </svg>
            {trendRows.map((row) => (
              <div key={row.key} className="dashboard-trend-day" tabIndex={0}>
                <div className="dashboard-trend-bars">
                  <span
                    className="is-products"
                    style={{ "--bar-height": getBarHeight(row.productsCreated, maxValue) }}
                    title={`${formatDayLabel(row.key)} 상품 등록 ${row.productsCreated}건`}
                  />
                  <span
                    className="is-submissions"
                    style={{ "--bar-height": getBarHeight(row.submissionsCreated, maxValue) }}
                    title={`${formatDayLabel(row.key)} 제출 등록 ${row.submissionsCreated}건`}
                  />
                  <span
                    className="is-deposits"
                    style={{ "--bar-height": getBarHeight(row.depositVerified, maxValue) }}
                    title={`${formatDayLabel(row.key)} 입금 완료 ${row.depositVerified}건`}
                  />
                </div>
                <span className="dashboard-trend-label">{formatDayLabel(row.key)}</span>
                <div className="dashboard-trend-tooltip" role="tooltip">
                  <strong>{formatDayLabel(row.key)}</strong>
                  {TREND_SERIES.map((series) => (
                    <span key={series.key} className={series.className}>
                      {series.label} {Number(row[series.key] ?? 0).toLocaleString("ko-KR")}건
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="dashboard-trend-empty">선택한 기간에 표시할 추이 데이터가 없습니다.</div>
      )}
    </section>
  );
}
