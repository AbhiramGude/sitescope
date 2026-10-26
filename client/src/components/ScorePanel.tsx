import React from 'react';
import type { AccessibilityScore } from '../types';

interface ScorePanelProps {
  score: AccessibilityScore;
  loading?: boolean;
}

export const ScorePanel: React.FC<ScorePanelProps> = ({ score, loading }) => {
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score.overall / 100) * circumference;

  const getScoreColor = (s: number) => {
    if (s >= 70) return 'var(--accent)';
    if (s >= 45) return 'var(--yellow)';
    return 'var(--error)';
  };

  const getScoreLabel = (s: number) => {
    if (s >= 80) return 'Excellent';
    if (s >= 65) return 'Good';
    if (s >= 50) return 'Moderate';
    if (s >= 35) return 'Limited';
    return 'Poor';
  };

  if (loading) {
    return (
      <div className="panel__section">
        <div className="score-display">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div className="spinner spinner--lg" />
            <span className="text-sm text-secondary">Calculating score…</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Score ring */}
      <div className="panel__section">
        <div className="score-display">
          <div className="score-ring-wrapper">
            <svg className="score-ring" width="120" height="120" viewBox="0 0 120 120">
              <circle className="score-ring__track" cx="60" cy="60" r={radius} />
              <circle
                className="score-ring__progress"
                cx="60"
                cy="60"
                r={radius}
                style={{
                  strokeDasharray: circumference,
                  strokeDashoffset: offset,
                  stroke: getScoreColor(score.overall),
                }}
              />
            </svg>
            <div className="score-ring__text">
              <span className="score-number">{score.overall}</span>
              <span className="score-label">/ 100</span>
            </div>
          </div>
          <div style={{ fontWeight: 600, fontSize: 'var(--text-base)', color: getScoreColor(score.overall) }}>
            {getScoreLabel(score.overall)}
          </div>
          <div className="text-sm text-secondary" style={{ marginTop: 4 }}>
            Site Accessibility Score
          </div>
        </div>

        {/* Data completeness */}
        <div style={{ padding: '0 0 4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span className="text-xs text-muted uppercase" style={{ letterSpacing: '0.06em', fontWeight: 600 }}>
              Data Completeness
            </span>
            <span className="text-xs text-muted">{Math.round(score.dataCompleteness * 100)}%</span>
          </div>
          <div className="completeness-bar">
            <div className="completeness-bar__track" style={{ flex: 1 }}>
              <div
                className="completeness-bar__fill"
                style={{ width: `${score.dataCompleteness * 100}%` }}
              />
            </div>
          </div>
          {score.dataCompleteness < 0.5 && (
            <div className="text-xs text-muted" style={{ marginTop: 6 }}>
              Limited data — score reflects available OSM data
            </div>
          )}
        </div>
      </div>

      {/* Component breakdown */}
      <div className="panel__section">
        <div className="section-label">Score Breakdown</div>
        <div className="score-components">
          {score.components.map((comp) => (
            <div key={comp.key} className="score-component">
              <div className="score-component__header">
                <span className="score-component__label">{comp.label}</span>
                <span className="score-component__value" style={{ color: getScoreColor(comp.rawScore) }}>
                  {Math.round(comp.rawScore)}<span className="text-muted" style={{ fontWeight: 400 }}>/100</span>
                </span>
              </div>
              <div className="score-component__bar-track">
                <div
                  className="score-component__bar-fill"
                  style={{
                    width: `${comp.rawScore}%`,
                    background: getScoreColor(comp.rawScore),
                  }}
                />
              </div>
              <div className="score-component__measurement">
                {comp.measurement}
                {!comp.dataAvailable && (
                  <span style={{ color: 'var(--warning)', marginLeft: 4 }}>• data unavailable</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Weights note */}
      <div className="panel__section">
        <div
          style={{
            padding: '8px 10px',
            background: 'var(--surface-2)',
            borderRadius: 'var(--radius)',
            fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)',
            lineHeight: 1.5,
          }}
        >
          ℹ Weights: Diversity 25% · Essential 25% · Transport 20% · Daily 15% · Parks 10% · Civic 5%. Provisional prototype values — not validated standards.
        </div>
      </div>

      {/* Gaps */}
      {score.gaps.length > 0 && (
        <div className="panel__section">
          <div className="section-label">Service Gaps</div>
          <div className="gap-list">
            {score.gaps.map((gap, i) => (
              <div key={i} className="gap-item">{gap}</div>
            ))}
          </div>
        </div>
      )}
    </>
  );
};
