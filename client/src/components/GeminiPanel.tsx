import React, { useState } from 'react';
import type { GeminiAnalysis } from '../types';

interface GeminiPanelProps {
  analysis: GeminiAnalysis | null;
  loading: boolean;
  error?: string;
  onAnalyse: () => void;
  canAnalyse: boolean;
}

export const GeminiPanel: React.FC<GeminiPanelProps> = ({
  analysis,
  loading,
  error,
  onAnalyse,
  canAnalyse,
}) => {
  const [expanded, setExpanded] = useState<number | null>(0);

  if (loading) {
    return (
      <div className="panel__section">
        <div className="gemini-status">
          <div className="spinner spinner--lg" />
          <div className="gemini-status__title">Analysing with Gemini</div>
          <div className="gemini-status__desc">
            Interpreting accessibility profile and recommending building typologies…
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="panel__section">
        <div className="alert-banner alert-banner--error">
          <span>⚠</span>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>AI Analysis Failed</div>
            <div style={{ fontSize: 'var(--text-xs)' }}>{error}</div>
          </div>
        </div>
        {canAnalyse && (
          <button className="analyse-btn" style={{ marginTop: 12 }} onClick={onAnalyse}>
            Retry Analysis
          </button>
        )}
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="panel__section">
        <div className="gemini-status">
          <div className="gemini-status__icon">✦</div>
          <div className="gemini-status__title">AI Interpretation</div>
          <div className="gemini-status__desc">
            Select a site and run analysis to receive Gemini-powered building typology recommendations.
          </div>
          {canAnalyse && (
            <button className="analyse-btn" onClick={onAnalyse}>
              <span>✦</span> Run AI Analysis
            </button>
          )}
          {!canAnalyse && (
            <div className="text-xs text-muted" style={{ marginTop: 8 }}>
              Complete site analysis first
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="gemini-panel">
      {/* Interpretation */}
      <div className="panel__section">
        <div className="section-label">Gemini Interpretation</div>
        <div className="gemini-interpretation">
          <p>{analysis.accessibility_interpretation}</p>
        </div>
      </div>

      {/* Strengths */}
      <div className="panel__section">
        <div className="section-label">Key Strengths</div>
        <div className="insight-list">
          {analysis.key_strengths.map((s, i) => (
            <div key={i} className="insight-item insight-item--strength">{s}</div>
          ))}
        </div>
      </div>

      {/* Gaps */}
      <div className="panel__section">
        <div className="section-label">Key Deficiencies</div>
        <div className="insight-list">
          {analysis.key_gaps.map((g, i) => (
            <div key={i} className="insight-item insight-item--gap">{g}</div>
          ))}
        </div>
      </div>

      {/* Typology recommendations */}
      <div className="panel__section">
        <div className="section-label">Building Typology Recommendations</div>
        <div className="typology-cards">
          {analysis.typology_recommendations.map((rec, idx) => (
            <div key={idx} className="typology-card">
              <div
                className="typology-card__header"
                onClick={() => setExpanded(expanded === idx ? null : idx)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && setExpanded(expanded === idx ? null : idx)}
              >
                <div
                  className="typology-card__rank"
                  style={idx > 0 ? { background: idx === 1 ? 'var(--text-secondary)' : 'var(--text-muted)' } : {}}
                >
                  {idx + 1}
                </div>
                <div className="typology-card__name">{rec.typology}</div>
                <div className="typology-score-pill">{Math.round(rec.suitability_score)}</div>
                <span style={{ color: 'var(--text-muted)', fontSize: 12, flexShrink: 0 }}>
                  {expanded === idx ? '▲' : '▼'}
                </span>
              </div>

              {expanded === idx && (
                <div className="typology-card__body">
                  <div className="typology-card__summary">{rec.recommendation_summary}</div>

                  {rec.evidence.length > 0 && (
                    <div>
                      <div className="typology-section-title">Evidence</div>
                      <div className="tag-list">
                        {rec.evidence.map((e, i) => (
                          <span key={i} className="tag tag--evidence">{e}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {rec.advantages.length > 0 && (
                    <div>
                      <div className="typology-section-title">Advantages</div>
                      <div className="insight-list">
                        {rec.advantages.map((a, i) => (
                          <div key={i} className="insight-item insight-item--strength">{a}</div>
                        ))}
                      </div>
                    </div>
                  )}

                  {rec.limitations.length > 0 && (
                    <div>
                      <div className="typology-section-title">Limitations</div>
                      <div className="tag-list">
                        {rec.limitations.map((l, i) => (
                          <span key={i} className="tag tag--limitation">{l}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {rec.missing_information.length > 0 && (
                    <div>
                      <div className="typology-section-title">Additional Data Needed</div>
                      <div className="tag-list">
                        {rec.missing_information.map((m, i) => (
                          <span key={i} className="tag tag--missing">{m}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Confidence & limitations */}
      <div className="panel__section">
        <div
          style={{
            padding: '10px 12px',
            background: 'var(--surface-2)',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--divider)',
            fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)',
            lineHeight: 1.5,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>Confidence & Limitations</div>
          <p style={{ color: 'inherit', fontSize: 'inherit' }}>{analysis.confidence_explanation}</p>
          {analysis.data_limitations && (
            <p style={{ color: 'inherit', fontSize: 'inherit', marginTop: 6 }}>{analysis.data_limitations}</p>
          )}
        </div>
      </div>

      {/* Re-run */}
      <div className="panel__section">
        <button className="btn btn--secondary w-full" onClick={onAnalyse}>
          ↺ Re-run AI Analysis
        </button>
      </div>
    </div>
  );
};
