'use client';

import { useState } from 'react';
import { useCreateMarket } from '@/hooks/useContracts';

const DEMO_ACCOUNT = '0x0000000000000000000000000000000000000001' as `0x${string}`;

// Mẫu market câu hỏi định tính để gợi ý người dùng
const EXAMPLE_MARKETS = [
  {
    question: 'Will Christopher Nolan\'s next film be considered a masterpiece by critics?',
    sources: [
      'https://www.rottentomatoes.com',
      'https://www.metacritic.com',
      'https://letterboxd.com',
    ],
  },
  {
    question: 'Will Taylor Swift\'s 2025 tour be considered the biggest cultural event of the year?',
    sources: [
      'https://variety.com/music',
      'https://www.billboard.com',
      'https://pitchfork.com',
    ],
  },
  {
    question: 'Will the new season of a major fantasy series be considered a disappointment by fans?',
    sources: [
      'https://www.rottentomatoes.com',
      'https://www.reddit.com/r/television',
      'https://www.imdb.com',
    ],
  },
];

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateMarketModal({ onClose, onSuccess }: Props) {
  const { createMarket, loading, error } = useCreateMarket();

  const [question, setQuestion] = useState('');
  const [sourcesText, setSourcesText] = useState('');
  const [deadlineDays, setDeadlineDays] = useState('7');
  const [step, setStep] = useState<1 | 2>(1);

  const handleExample = (idx: number) => {
    const ex = EXAMPLE_MARKETS[idx];
    setQuestion(ex.question);
    setSourcesText(ex.sources.join('\n'));
  };

  const handleSubmit = async () => {
    const sources = sourcesText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    if (sources.length < 2) {
      alert('Cần ít nhất 2 URL nguồn');
      return;
    }

    if (question.trim().length < 10) {
      alert('Câu hỏi quá ngắn');
      return;
    }

    const daysNum = parseInt(deadlineDays);
    if (isNaN(daysNum) || daysNum < 1) {
      alert('Deadline phải ít nhất 1 ngày');
      return;
    }

    const deadlineTs = Math.floor(Date.now() / 1000) + daysNum * 86400;

    const result = await createMarket({
      question: question.trim(),
      sources,
      deadlineTimestamp: deadlineTs,
      account: DEMO_ACCOUNT,
    });

    if (result.success) {
      onSuccess();
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-labelledby="modal-title">
        <div className="modal-header">
          <h2 className="modal-title" id="modal-title">✨ Tạo Market Mới</h2>
          <button id="btn-close-modal" className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Step indicator */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          <div style={{
            flex: 1, height: 3, borderRadius: 2,
            background: step >= 1 ? 'var(--brand-purple)' : 'var(--border-subtle)',
            transition: 'background 250ms',
          }} />
          <div style={{
            flex: 1, height: 3, borderRadius: 2,
            background: step >= 2 ? 'var(--brand-purple)' : 'var(--border-subtle)',
            transition: 'background 250ms',
          }} />
        </div>

        {step === 1 && (
          <div>
            {/* Example suggestions */}
            <div style={{ marginBottom: 20 }}>
              <div className="form-label">💡 Gợi ý câu hỏi mẫu</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {EXAMPLE_MARKETS.map((ex, i) => (
                  <button
                    key={i}
                    id={`btn-example-${i}`}
                    onClick={() => handleExample(i)}
                    style={{
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      padding: '10px 14px',
                      textAlign: 'left',
                      cursor: 'pointer',
                      color: 'var(--text-secondary)',
                      fontSize: 13,
                      transition: 'all 150ms',
                      fontFamily: 'var(--font-sans)',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--brand-purple)')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}
                  >
                    {ex.question}
                  </button>
                ))}
              </div>
            </div>

            <div className="divider" />

            {/* Question input */}
            <div className="form-group">
              <label className="form-label" htmlFor="input-question">
                Câu hỏi dự đoán *
              </label>
              <textarea
                id="input-question"
                className="form-textarea"
                placeholder="Câu hỏi phải là định tính/chủ quan — ví dụ: 'Liệu phim X có được giới phê bình gọi là kiệt tác?'"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                style={{ minHeight: 120 }}
              />
              <div className="form-hint">
                ⚠️ Không dùng câu hỏi có đáp án số (giá BTC, tỷ số...)
                — đó là Oracle, không phải TruthMarket.
              </div>
            </div>

            <button
              id="btn-step-2"
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={() => setStep(2)}
              disabled={question.trim().length < 10}
            >
              Tiếp theo →
            </button>
          </div>
        )}

        {step === 2 && (
          <div>
            {/* Question preview */}
            <div style={{
              background: 'var(--gradient-brand-subtle)',
              border: '1px solid rgba(124,58,237,0.2)',
              borderRadius: 'var(--radius-md)',
              padding: '12px 16px',
              marginBottom: 20,
              fontSize: 14,
              color: 'var(--text-secondary)',
              lineHeight: 1.6,
            }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>Câu hỏi</div>
              {question}
            </div>

            {/* Sources */}
            <div className="form-group">
              <label className="form-label" htmlFor="input-sources">
                URL nguồn dữ liệu * (mỗi dòng 1 URL, tối thiểu 2)
              </label>
              <textarea
                id="input-sources"
                className="form-textarea"
                placeholder={
                  'https://www.rottentomatoes.com/m/ten-phim\n' +
                  'https://www.metacritic.com/movie/ten-phim\n' +
                  'https://letterboxd.com/film/ten-phim'
                }
                value={sourcesText}
                onChange={(e) => setSourcesText(e.target.value)}
                style={{ minHeight: 120, fontFamily: 'var(--font-mono)', fontSize: 13 }}
              />
              <div className="form-hint">
                AI sẽ đọc TẤT CẢ các URL này khi resolve. Chọn nguồn đáng tin cậy, có nội dung thật.
              </div>
            </div>

            {/* Deadline */}
            <div className="form-group">
              <label className="form-label" htmlFor="input-deadline">
                Thời hạn (ngày kể từ hôm nay)
              </label>
              <input
                id="input-deadline"
                type="number"
                className="form-input"
                min="1"
                max="365"
                value={deadlineDays}
                onChange={(e) => setDeadlineDays(e.target.value)}
              />
              <div className="form-hint">
                Sau {deadlineDays} ngày, bất kỳ ai cũng có thể trigger AI resolution.
              </div>
            </div>

            {error && (
              <div style={{
                background: 'var(--no-bg)',
                border: '1px solid var(--no-border)',
                borderRadius: 'var(--radius-md)',
                padding: '12px 16px',
                fontSize: 13,
                color: 'var(--no-color)',
                marginBottom: 16,
              }}>
                ❌ {error}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
              <button
                id="btn-back-step"
                className="btn btn-secondary"
                onClick={() => setStep(1)}
              >
                ← Quay lại
              </button>
              <button
                id="btn-create-submit"
                className="btn btn-primary"
                style={{ justifyContent: 'center' }}
                onClick={handleSubmit}
                disabled={loading}
              >
                {loading ? (
                  <><div className="loading-spinner" /> Đang tạo market...</>
                ) : (
                  '🚀 Tạo Market'
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
