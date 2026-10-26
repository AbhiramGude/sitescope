import React from 'react';
import type { CatchmentStats, AmenityCategory } from '../types';
import { CATEGORY_META } from '../types';

interface CatchmentComparisonProps {
  stats: CatchmentStats[];
}

export const CatchmentComparison: React.FC<CatchmentComparisonProps> = ({ stats }) => {
  const maxTotal = Math.max(...stats.map((s) => s.totalAmenities), 1);

  return (
    <div className="catchment-comparison">
      {stats.map((stat) => {
        const categories = CATEGORY_META.filter(
          (c) => (stat.byCategory[c.key] ?? 0) > 0,
        );

        return (
          <div key={stat.minutes} className="catchment-card">
            <div className="catchment-card__header">
              <div className="catchment-card__title">
                <div
                  className={`catchment-dot catchment-dot--${stat.minutes}`}
                />
                <span>{stat.minutes}-min walk</span>
              </div>
              <span className="catchment-card__total">{stat.totalAmenities}</span>
            </div>

            {/* Mini bar chart by category */}
            <div className="catchment-bars">
              {CATEGORY_META.map((cat) => {
                const count = stat.byCategory[cat.key as AmenityCategory] ?? 0;
                const pct = maxTotal > 0 ? (count / maxTotal) * 100 : 0;
                return (
                  <div key={cat.key} className="catchment-bar-row">
                    <span className="catchment-bar-row__label" title={cat.label}>
                      {cat.icon}
                    </span>
                    <div className="catchment-bar-row__track">
                      <div
                        className="catchment-bar-row__fill"
                        style={{
                          width: `${pct}%`,
                          background: count > 0 ? cat.color : 'transparent',
                          opacity: count > 0 ? 0.8 : 0,
                        }}
                      />
                    </div>
                    <span className="catchment-bar-row__value">{count > 0 ? count : '–'}</span>
                  </div>
                );
              })}
            </div>

            {/* Diversity */}
            <div
              style={{
                marginTop: 8,
                paddingTop: 8,
                borderTop: '1px solid var(--divider)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span className="text-xs text-muted">Diversity</span>
              <span className="text-xs" style={{ fontWeight: 600, color: 'var(--accent-deep)' }}>
                {stat.diversityScore}/100
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
