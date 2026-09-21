import React, { useMemo } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

export default function Pagination({
  currentPage = 1,
  totalItems = 0,
  pageSize = 10,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  itemLabel = 'registros',
  disabled = false,
  className = '',
  style = {}
}) {
  const total = Number(totalItems) || 0;
  const size = Math.max(1, Number(pageSize) || 10);
  const totalPages = Math.max(1, Math.ceil(total / size));
  const page = Math.min(Math.max(1, Number(currentPage) || 1), totalPages);

  const startItem = total === 0 ? 0 : (page - 1) * size + 1;
  const endItem = Math.min(total, page * size);

  const pageNumbers = useMemo(() => {
    const pages = [];
    const maxButtons = 5;
    let start = Math.max(1, page - 2);
    let end = Math.min(totalPages, start + maxButtons - 1);

    if (end - start < maxButtons - 1) {
      start = Math.max(1, end - maxButtons + 1);
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  }, [page, totalPages]);

  return (
    <div
      className={`card ${className}`}
      style={{
        padding: '12px 18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        marginTop: '12px',
        background: 'var(--card-bg, rgba(30, 41, 59, 0.7))',
        border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
        borderRadius: '10px',
        ...style
      }}
    >
      {/* Left: Page Size Selector (optional) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {onPageSizeChange && (
          <>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #94a3b8)' }}>Mostrar</span>
            <select
              className="select-control"
              value={size}
              disabled={disabled}
              onChange={(e) => {
                const newSize = Number(e.target.value);
                if (onPageSizeChange) onPageSizeChange(newSize);
                if (onPageChange) onPageChange(1);
              }}
              style={{
                width: '75px',
                height: '32px',
                fontSize: '0.8rem',
                padding: '0 6px',
                background: 'var(--bg-subtle, rgba(15, 23, 42, 0.6))',
                border: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
                borderRadius: '6px',
                color: 'var(--text-primary, #f8fafc)',
                cursor: 'pointer'
              }}
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt} style={{ background: '#0f172a', color: '#f8fafc' }}>
                  {opt}
                </option>
              ))}
            </select>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #94a3b8)' }}>por página</span>
          </>
        )}
      </div>

      {/* Center: Counter summary */}
      <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary, #94a3b8)' }}>
        Mostrando <strong style={{ color: 'var(--text-primary, #f8fafc)' }}>{startItem}</strong> - <strong style={{ color: 'var(--text-primary, #f8fafc)' }}>{endItem}</strong> de <strong style={{ color: 'var(--text-primary, #f8fafc)' }}>{total}</strong> {itemLabel}
      </div>

      {/* Right: Navigation Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <button
          type="button"
          onClick={() => onPageChange && onPageChange(1)}
          disabled={page <= 1 || disabled}
          className="btn btn-secondary btn-sm"
          style={{
            padding: '6px 8px',
            height: '32px',
            opacity: (page <= 1 || disabled) ? 0.4 : 1,
            cursor: (page <= 1 || disabled) ? 'not-allowed' : 'pointer'
          }}
          title="Primera página"
        >
          <ChevronsLeft size={14} />
        </button>

        <button
          type="button"
          onClick={() => onPageChange && onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1 || disabled}
          className="btn btn-secondary btn-sm"
          style={{
            padding: '6px 8px',
            height: '32px',
            opacity: (page <= 1 || disabled) ? 0.4 : 1,
            cursor: (page <= 1 || disabled) ? 'not-allowed' : 'pointer'
          }}
          title="Página anterior"
        >
          <ChevronLeft size={14} />
        </button>

        {pageNumbers.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPageChange && onPageChange(p)}
            disabled={disabled}
            style={{
              minWidth: '32px',
              height: '32px',
              borderRadius: '6px',
              border: p === page ? '1px solid #3b82f6' : '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
              background: p === page ? '#3b82f6' : 'var(--bg-subtle, rgba(15, 23, 42, 0.6))',
              color: p === page ? '#ffffff' : 'var(--text-primary, #f8fafc)',
              fontWeight: p === page ? 700 : 500,
              fontSize: '0.82rem',
              cursor: disabled ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s'
            }}
          >
            {p}
          </button>
        ))}

        <button
          type="button"
          onClick={() => onPageChange && onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages || disabled}
          className="btn btn-secondary btn-sm"
          style={{
            padding: '6px 8px',
            height: '32px',
            opacity: (page >= totalPages || disabled) ? 0.4 : 1,
            cursor: (page >= totalPages || disabled) ? 'not-allowed' : 'pointer'
          }}
          title="Página siguiente"
        >
          <ChevronRight size={14} />
        </button>

        <button
          type="button"
          onClick={() => onPageChange && onPageChange(totalPages)}
          disabled={page >= totalPages || disabled}
          className="btn btn-secondary btn-sm"
          style={{
            padding: '6px 8px',
            height: '32px',
            opacity: (page >= totalPages || disabled) ? 0.4 : 1,
            cursor: (page >= totalPages || disabled) ? 'not-allowed' : 'pointer'
          }}
          title="Última página"
        >
          <ChevronsRight size={14} />
        </button>
      </div>
    </div>
  );
}
