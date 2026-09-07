import React, { useState, useEffect } from 'react';
import {
  Grid3X3, Search, Filter, ShoppingCart, AlertCircle,
  CheckCircle2, Sparkles, Layers, ArrowRight, RefreshCw
} from 'lucide-react';
import api from '../services/api';
import { useToast } from '../context/ToastContext';

export default function DyeMatrixPage({ onNavigateToPos }) {
  const { addToast } = useToast();
  const [dyesData, setDyesData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedBrand, setSelectedBrand] = useState('ALL');
  const [selectedFamily, setSelectedFamily] = useState('ALL');
  const [search, setSearch] = useState('');
  const [selectedShade, setSelectedShade] = useState(null);

  useEffect(() => {
    loadDyeMatrix();
  }, []);

  const loadDyeMatrix = async () => {
    setLoading(true);
    try {
      const res = await api.get('/catalog/dyes/matrix');
      if (res.success) {
        setDyesData(res.data);
      }
    } catch (err) {
      console.error('Failed to load dye matrix:', err);
      addToast('Error cargando matriz de tintes.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const shades = dyesData?.shades || [];
  const groupedFamilies = dyesData?.grouped_by_family || {};

  // Extract unique brands
  const brands = Array.from(new Set(shades.map(s => s.brand_name).filter(Boolean)));
  const families = Object.keys(groupedFamilies);

  // Filtered shades
  const filteredShades = shades.filter(s => {
    const matchBrand = selectedBrand === 'ALL' || s.brand_name === selectedBrand;
    const matchFamily = selectedFamily === 'ALL' || s.family === selectedFamily;
    const matchSearch = !search ||
      (s.shade_number && s.shade_number.toLowerCase().includes(search.toLowerCase())) ||
      (s.name && s.name.toLowerCase().includes(search.toLowerCase())) ||
      (s.sku && s.sku.toLowerCase().includes(search.toLowerCase()));
    return matchBrand && matchFamily && matchSearch;
  });

  // Re-group filtered shades by family
  const displayGroups = {};
  filteredShades.forEach(s => {
    const fam = s.family || 'Otros Tonos';
    if (!displayGroups[fam]) displayGroups[fam] = [];
    displayGroups[fam].push(s);
  });

  // KPI calculations
  const totalShadesCount = shades.length;
  const availableCount = shades.filter(s => s.stock_status === 'available').length;
  const lowStockCount = shades.filter(s => s.stock_status === 'low_stock').length;
  const outOfStockCount = shades.filter(s => s.stock_status === 'out_of_stock').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      {/* Header Banner */}
      <div style={{
        background: 'var(--bg-banner)',
        border: '1px solid rgba(139, 92, 246, 0.3)',
        borderRadius: '16px',
        padding: '24px 28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px',
        boxShadow: 'var(--shadow-card)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '52px',
            height: '52px',
            borderRadius: '14px',
            background: 'linear-gradient(135deg, #ec4899, #8b5cf6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 20px rgba(236, 72, 153, 0.4)'
          }}>
            <Grid3X3 size={28} color="#fff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                Matriz de Tintes & Carta de Color
              </h2>
              <span className="badge" style={{ background: 'rgba(236, 72, 153, 0.2)', color: '#f472b6', border: '1px solid rgba(236, 72, 153, 0.4)' }}>
                Sección 18
              </span>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Control visual de numeración (1.0 - 10.1), familias reflejas, colores de muestra y semáforos de stock
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={loadDyeMatrix} className="btn btn-secondary btn-sm">
            <RefreshCw size={15} />
            <span>Refrescar</span>
          </button>
          {onNavigateToPos && (
            <button onClick={() => onNavigateToPos()} className="btn btn-primary btn-sm">
              <ShoppingCart size={15} />
              <span>Ir a Facturar</span>
            </button>
          )}
        </div>
      </div>

      {/* Stock Semaphores KPI Bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px 20px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(139, 92, 246, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Layers size={20} color="#a78bfa" />
          </div>
          <div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>Total Tonos</p>
            <h4 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>{totalShadesCount}</h4>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px 20px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircle2 size={20} color="var(--success)" />
          </div>
          <div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>Disponible Óptimo</p>
            <h4 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--success)' }}>{availableCount}</h4>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px 20px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(245, 158, 11, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertCircle size={20} color="var(--warning)" />
          </div>
          <div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>Stock Bajo (Mínimo)</p>
            <h4 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--warning)' }}>{lowStockCount}</h4>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px 20px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertCircle size={20} color="var(--danger)" />
          </div>
          <div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>Agotados (Quiebre)</p>
            <h4 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--danger)' }}>{outOfStockCount}</h4>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: '1 1 240px' }}>
            <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '13px' }} />
            <input
              type="text"
              className="input-control"
              placeholder="Buscar tono por número (ej: 6.0, 7.1) o nombre..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: '38px', height: '42px' }}
            />
          </div>

          {/* Brand Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Marca:</span>
            <select
              className="select-control"
              value={selectedBrand}
              onChange={(e) => setSelectedBrand(e.target.value)}
              style={{ width: '180px', height: '42px' }}
            >
              <option value="ALL">Todas las marcas</option>
              {brands.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          {/* Family Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Familia:</span>
            <select
              className="select-control"
              value={selectedFamily}
              onChange={(e) => setSelectedFamily(e.target.value)}
              style={{ width: '180px', height: '42px' }}
            >
              <option value="ALL">Todas las familias</option>
              {families.map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Family Quick Pills */}
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
          <button
            onClick={() => setSelectedFamily('ALL')}
            className={`btn btn-sm ${selectedFamily === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: '9999px', fontSize: '0.75rem' }}
          >
            Todas las Familias ({shades.length})
          </button>
          {families.map(f => {
            const count = groupedFamilies[f]?.length || 0;
            return (
              <button
                key={f}
                onClick={() => setSelectedFamily(f)}
                className={`btn btn-sm ${selectedFamily === f ? 'btn-primary' : 'btn-secondary'}`}
                style={{ borderRadius: '9999px', fontSize: '0.75rem', whiteSpace: 'nowrap' }}
              >
                {f} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* MATRIX DISPLAY */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px' }}>
          <div style={{ width: '32px', height: '32px', border: '3px solid #ec4899', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
        </div>
      ) : Object.keys(displayGroups).length === 0 ? (
        <div className="card" style={{ padding: '60px', textAlign: 'center' }}>
          <Grid3X3 size={40} color="var(--text-muted)" style={{ margin: '0 auto 16px' }} />
          <h4 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>No se encontraron tonos con los filtros aplicados</h4>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
            Intenta cambiar el término de búsqueda o la familia seleccionada.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {Object.entries(displayGroups).map(([familyName, groupShades]) => (
            <div
              key={familyName}
              className="card"
              style={{
                padding: '20px',
                background: 'rgba(15, 23, 42, 0.6)',
                borderColor: 'var(--border-color)'
              }}
            >
              {/* Family Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ec4899', boxShadow: '0 0 10px #ec4899' }} />
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                    Serie {familyName}
                  </h3>
                  <span className="badge" style={{ background: 'var(--bg-subtle-2)', color: 'var(--text-secondary)' }}>
                    {groupShades.length} tonos
                  </span>
                </div>
              </div>

              {/* Grid of Shades */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '14px' }}>
                {groupShades.map(shade => {
                  const isAvail = shade.stock_status === 'available';
                  const isLow = shade.stock_status === 'low_stock';
                  const isOut = shade.stock_status === 'out_of_stock';

                  const badgeBg = isAvail ? 'rgba(16, 185, 129, 0.15)' : isLow ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.15)';
                  const badgeColor = isAvail ? 'var(--success)' : isLow ? 'var(--warning)' : 'var(--danger)';
                  const statusText = isAvail ? 'En Stock' : isLow ? 'Stock Bajo' : 'Agotado';

                  return (
                    <div
                      key={shade.id}
                      onClick={() => setSelectedShade(shade)}
                      style={{
                        background: 'var(--bg-subtle)',
                        border: selectedShade?.id === shade.id ? '2px solid var(--accent-primary)' : '1px solid var(--border-color)',
                        borderRadius: '12px',
                        padding: '14px',
                        cursor: 'pointer',
                        transition: 'all 0.18s ease',
                        position: 'relative',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: '12px'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-3px)';
                        e.currentTarget.style.borderColor = 'rgba(236, 72, 153, 0.5)';
                        e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.4)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'none';
                        e.currentTarget.style.borderColor = selectedShade?.id === shade.id ? 'var(--accent-primary)' : 'var(--border-color)';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      {/* Top: Shade Color Swatch & Number */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div
                          style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '50%',
                            background: shade.color_hex || '#333',
                            border: '2px solid rgba(255, 255, 255, 0.3)',
                            boxShadow: `0 0 12px ${shade.color_hex || '#000'}40`,
                            flexShrink: 0
                          }}
                        />
                        <div>
                          <span style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.02em', display: 'block', lineHeight: 1.1 }}>
                            {shade.shade_number || 'N/A'}
                          </span>
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            {shade.brand_name || 'Línea Color'}
                          </span>
                        </div>
                      </div>

                      {/* Middle: Tone Name */}
                      <div>
                        <p style={{ fontSize: '0.82rem', fontWeight: 600, color: '#e2e8f0', lineHeight: '1.25', minHeight: '32px' }}>
                          {shade.name}
                        </p>
                      </div>

                      {/* Bottom: Stock Semaphore & Price */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
                        <span style={{ fontSize: '0.92rem', fontWeight: 800, color: '#60a5fa' }}>
                          RD$ {Number(shade.price).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                        </span>

                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          background: badgeBg,
                          padding: '3px 8px',
                          borderRadius: '6px'
                        }}>
                          <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: badgeColor, boxShadow: `0 0 6px ${badgeColor}` }} />
                          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: badgeColor }}>
                            {shade.stock} u.
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* SHADE DETAIL MODAL */}
      {selectedShade && (
        <div className="modal-overlay" onClick={() => setSelectedShade(null)}>
          <div className="modal-content" style={{ maxWidth: '440px', padding: '24px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '18px' }}>
              <div style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: selectedShade.color_hex || '#333',
                border: '3px solid rgba(255, 255, 255, 0.4)',
                boxShadow: `0 0 20px ${selectedShade.color_hex || '#000'}60`
              }} />
              <div>
                <h3 style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--text-primary)' }}>
                  Tono {selectedShade.shade_number}
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  {selectedShade.name} • {selectedShade.brand_name}
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
              <div style={{ padding: '12px', background: 'var(--bg-main)', borderRadius: '10px' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Precio Venta</span>
                <p style={{ fontSize: '1.15rem', fontWeight: 800, color: '#60a5fa', marginTop: '2px' }}>
                  RD$ {Number(selectedShade.price).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                </p>
              </div>

              <div style={{ padding: '12px', background: 'var(--bg-main)', borderRadius: '10px' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Existencia Actual</span>
                <p style={{ fontSize: '1.15rem', fontWeight: 800, color: selectedShade.stock > 0 ? 'var(--success)' : 'var(--danger)', marginTop: '2px' }}>
                  {selectedShade.stock} unidades
                </p>
              </div>

              <div style={{ padding: '12px', background: 'var(--bg-main)', borderRadius: '10px' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>SKU / Código</span>
                <p style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                  {selectedShade.sku || 'N/A'}
                </p>
              </div>

              <div style={{ padding: '12px', background: 'var(--bg-main)', borderRadius: '10px' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Stock Mínimo Alerta</span>
                <p style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f59e0b', marginTop: '2px' }}>
                  {selectedShade.stock_min} unidades
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(selectedShade.sku || selectedShade.shade_number);
                  addToast(`SKU ${selectedShade.sku} copiado al portapapeles.`, 'success');
                }}
                className="btn btn-secondary"
                style={{ flex: 1 }}
              >
                Copiar SKU
              </button>
              {onNavigateToPos && (
                <button
                  onClick={() => {
                    setSelectedShade(null);
                    onNavigateToPos();
                  }}
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                >
                  <ShoppingCart size={16} />
                  <span>Facturar</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
