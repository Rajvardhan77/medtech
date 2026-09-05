export interface TrendInputItem {
  test_name: string;
  unit: string | null;
  numeric_value: number | null;
  range_status: string | null;
  observation_date: Date | null;
}

export interface TrendDatapoint {
  date: Date | null;
  value: number | null;
  status: string | null;
}

export interface TestTrendSeries {
  test_name: string;
  unit: string | null;
  latest_value: number | null;
  latest_status: string | null;
  latest_date: Date | null;
  previous_value: number | null;
  direction: 'up' | 'down' | 'flat';
  datapoints: TrendDatapoint[];
}

/**
 * Compute longitudinal test trends from an array of tests sorted by observation_date asc.
 */
export function computeLongitudinalTrends(tests: TrendInputItem[]): TestTrendSeries[] {
  const byName: Record<string, TrendInputItem[]> = {};

  for (const t of tests) {
    if (!t.test_name) continue;
    const key = t.test_name.trim().toLowerCase();
    if (!byName[key]) byName[key] = [];
    byName[key].push(t);
  }

  return Object.entries(byName).map(([_, series]) => {
    // Ensure chronological order
    series.sort((a, b) => {
      const timeA = a.observation_date ? new Date(a.observation_date).getTime() : 0;
      const timeB = b.observation_date ? new Date(b.observation_date).getTime() : 0;
      return timeA - timeB;
    });

    const last = series[series.length - 1];
    const prev = series.length > 1 ? series[series.length - 2] : null;

    let direction: 'up' | 'down' | 'flat' = 'flat';
    if (prev && last.numeric_value !== null && prev.numeric_value !== null) {
      if (last.numeric_value > prev.numeric_value) {
        direction = 'up';
      } else if (last.numeric_value < prev.numeric_value) {
        direction = 'down';
      } else {
        direction = 'flat';
      }
    }

    return {
      test_name: last.test_name,
      unit: last.unit,
      latest_value: last.numeric_value,
      latest_status: last.range_status,
      latest_date: last.observation_date,
      previous_value: prev?.numeric_value ?? null,
      direction,
      datapoints: series.map((s) => ({
        date: s.observation_date,
        value: s.numeric_value,
        status: s.range_status,
      })),
    };
  });
}
