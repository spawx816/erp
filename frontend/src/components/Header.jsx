import React, { useState, useEffect, useRef } from 'react';
import {
  Search, MapPin, Wallet, Bell, CheckCircle2, AlertTriangle,
  AlertOctagon, Clock, User, Package, Receipt, Truck,
  ChevronRight, X, Building2, ChevronDown, Check, Sun, Moon
} from 'lucide-react';
import api from '../services/api';
import RncLookupModal from './RncLookupModal';
import { useTheme } from '../context/ThemeContext';

export default function Header({
  user,
  activeBranch,
  onBranchChange,
  onOpenCashModal,
  activeSession,
  onSelectGlobalItem,
  onNavigate
}) {
  const { theme, toggleTheme, isLight } = useTheme();

  // Global search state
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showRncModal, setShowRncModal] = useState(false);
  const searchRef = useRef(null);

  // Branch selector state
  const [showBranchDropdown, setShowBranchDropdown] = useState(false);
  const branchRef = useRef(null);

  // Notification center state
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const notifRef = useRef(null);

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadNotifications = async () => {
    try {
      const res = await api.get('/admin/notifications');
      if (res.success) {
        setNotifications(res.data || []);
        setUnreadCount(res.unread_count || 0);
      }
    } catch (err) {
      console.error('Failed to load notifications:', err);
    }
  };

  const handleMarkAsRead = async (id) => {
    try {
      await api.post(`/admin/notifications/${id}/read`);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: 1 } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {}
  };

  useEffect(() => {
    if (!searchTerm || searchTerm.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    const delayDebounce = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await api.get('/admin/search', { q: searchTerm });
        if (res.success) {
          setSearchResults(res.results || []);
        }
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 200);

    return () => clearTimeout(delayDebounce);
  }, [searchTerm]);

  // Click outside handlers
  useEffect(() => {
    function handleClickOutside(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowSearchModal(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setShowNotifications(false);
      }
      if (branchRef.current && !branchRef.current.contains(e.target)) {
        setShowBranchDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Group search results by category
  const groupedResults = searchResults.reduce((acc, item) => {
    const type = item.type || 'other';
    if (!acc[type]) acc[type] = [];
    acc[type].push(item);
    return acc;
  }, {});

  const getCategoryLabel = (type) => {
    switch (type) {
      case 'product': return { name: 'Productos & Tintes', icon: Package, color: '#3b82f6' };
      case 'customer': return { name: 'Clientes', icon: User, color: '#10b981' };
      case 'sale': return { name: 'Facturas & Ventas', icon: Receipt, color: '#f59e0b' };
      case 'supplier': return { name: 'Proveedores', icon: Truck, color: '#a855f7' };
      case 'salesperson': return { name: 'Vendedores', icon: User, color: '#06b6d4' };
      default: return { name: 'Otros', icon: Search, color: '#64748b' };
    }
  };

  const handleItemClick = (item) => {
    setShowSearchModal(false);
    setSearchTerm('');
    if (onSelectGlobalItem) {
      onSelectGlobalItem(item);
    } else if (onNavigate) {
      if (item.type === 'product') onNavigate('products');
      else if (item.type === 'customer') onNavigate('customers');
      else if (item.type === 'sale') onNavigate('sales');
      else if (item.type === 'supplier') onNavigate('suppliers');
      else if (item.type === 'salesperson') onNavigate('salespeople');
    }
  };

  return (
    <header className="top-navbar" style={{ height: '64px', background: 'var(--bg-header)', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', position: 'relative', zIndex: 40 }}>
      {/* Search Input Bar (Section 30: Buscador Global) */}
      <div ref={searchRef} style={{ position: 'relative', width: '380px' }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px' }} />
          <input
            type="text"
            className="input-control"
            placeholder="Buscar cliente, RNC, factura, NCF, tinte..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setShowSearchModal(true);
            }}
            onFocus={() => setShowSearchModal(true)}
            style={{
              paddingLeft: '38px',
              height: '38px',
              fontSize: '0.84rem',
              background: 'var(--bg-input)',
              borderColor: 'var(--border-subtle)',
              borderRadius: '8px',
              color: 'var(--text-primary)',
              width: '100%'
            }}
          />
          {isSearching && (
            <div style={{ position: 'absolute', right: '12px', width: '14px', height: '14px', border: '2px solid var(--accent-primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
          )}
        </div>

        {/* Grouped Live Search Results Modal Dropdown */}
        {showSearchModal && searchTerm.trim().length >= 2 && (
          <div style={{
            position: 'absolute',
            top: '44px',
            left: 0,
            width: '460px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            boxShadow: 'var(--shadow-dropdown)',
            maxHeight: '400px',
            overflowY: 'auto',
            padding: '10px 0',
            zIndex: 100
          }}>
            {Object.keys(groupedResults).length === 0 && !isSearching && (
              <div style={{ padding: '18px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                No se encontraron resultados para "{searchTerm}"
              </div>
            )}

            {Object.entries(groupedResults).map(([type, items]) => {
              const cat = getCategoryLabel(type);
              const CatIcon = cat.icon;
              return (
                <div key={type} style={{ marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', background: isLight ? '#f1f5f9' : 'rgba(0,0,0,0.25)', fontSize: '0.72rem', fontWeight: 800, color: cat.color, textTransform: 'uppercase' }}>
                    <CatIcon size={13} />
                    <span>{cat.name} ({items.length})</span>
                  </div>
                  {items.map((item, idx) => (
                    <div
                      key={idx}
                      onClick={() => handleItemClick(item)}
                      style={{
                        padding: '8px 16px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderBottom: '1px solid var(--border-color)',
                        transition: 'background 0.15s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ overflow: 'hidden' }}>
                        <p style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{item.title}</p>
                        <p style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', margin: '2px 0 0' }}>{item.subtitle}</p>
                      </div>
                      <ChevronRight size={14} color="var(--text-muted)" />
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Right Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* Theme Mode Toggle (Modo Claro / Modo Oscuro) */}
        <button
          type="button"
          onClick={toggleTheme}
          className="theme-toggle-btn"
          title={isLight ? 'Cambiar a Modo Oscuro' : 'Cambiar a Modo Claro'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '7px',
            background: isLight ? '#f8fafc' : 'rgba(255,255,255,0.04)',
            padding: '7px 12px',
            borderRadius: '8px',
            border: '1px solid var(--border-subtle)',
            cursor: 'pointer',
            color: 'var(--text-primary)',
            fontSize: '0.78rem',
            fontWeight: 700,
            transition: 'all 0.15s ease'
          }}
        >
          {isLight ? (
            <>
              <Sun size={15} color="#d97706" />
              <span style={{ color: '#0f172a' }}>Modo Claro</span>
            </>
          ) : (
            <>
              <Moon size={15} color="#60a5fa" />
              <span style={{ color: '#f8fafc' }}>Modo Oscuro</span>
            </>
          )}
        </button>

        {/* Custom Branch Selector */}
        {(() => {
          const branches = (user?.accessible_branches && user.accessible_branches.length > 0)
            ? user.accessible_branches
            : (activeBranch ? [activeBranch] : [
                { id: 1, name: 'Sucursal Principal Santo Domingo', code: 'SUC-01', is_main: 1 },
                { id: 2, name: 'Sucursal Santiago', code: 'SUC-02', is_main: 0 }
              ]);
          const currentBranch = branches.find(b => b.id === activeBranch?.id) || activeBranch || branches[0];

          return (
            <div ref={branchRef} style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setShowBranchDropdown(prev => !prev)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: isLight ? '#f8fafc' : 'rgba(255,255,255,0.04)',
                  padding: '7px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-subtle)',
                  cursor: 'pointer',
                  color: 'var(--text-primary)',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-subtle)'}
              >
                <MapPin size={15} color="var(--accent-primary)" />
                <span style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {currentBranch?.name || 'Sucursal Principal'}
                </span>
                <ChevronDown
                  size={14}
                  color="var(--text-muted)"
                  style={{
                    transition: 'transform 0.2s ease',
                    transform: showBranchDropdown ? 'rotate(180deg)' : 'none'
                  }}
                />
              </button>

              {showBranchDropdown && (
                <div style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  right: 0,
                  minWidth: '260px',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '10px',
                  boxShadow: 'var(--shadow-dropdown)',
                  zIndex: 100,
                  padding: '6px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px'
                }}>
                  <div style={{ padding: '6px 10px', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Sucursal Activa
                  </div>
                  {branches.map(b => {
                    const isSelected = b.id === currentBranch?.id;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => {
                          onBranchChange(b.id);
                          setShowBranchDropdown(false);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          width: '100%',
                          padding: '8px 10px',
                          borderRadius: '6px',
                          border: 'none',
                          background: isSelected ? 'rgba(37, 99, 235, 0.12)' : 'transparent',
                          color: isSelected ? 'var(--accent-primary)' : 'var(--text-primary)',
                          fontSize: '0.8rem',
                          fontWeight: isSelected ? 700 : 500,
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'background 0.15s'
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) e.currentTarget.style.background = 'var(--bg-hover)';
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <MapPin size={13} color={isSelected ? 'var(--accent-primary)' : 'var(--text-muted)'} />
                          <div>
                            <div style={{ fontWeight: isSelected ? 700 : 500 }}>{b.name}</div>
                            {b.code && <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{b.code}</div>}
                          </div>
                        </div>
                        {isSelected && <Check size={14} color="var(--accent-primary)" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* Quick RNC DGII Lookup Button */}
        <button
          onClick={() => setShowRncModal(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(37, 99, 235, 0.12)',
            border: '1px solid rgba(37, 99, 235, 0.35)',
            padding: '6px 12px',
            borderRadius: '8px',
            cursor: 'pointer',
            color: 'var(--accent-primary)',
            fontSize: '0.76rem',
            fontWeight: 700,
            transition: 'all 0.15s ease'
          }}
          title="Consulta Oficial de RNC / Cédula en DGII (Megaplus API)"
        >
          <Building2 size={15} />
          <span>RNC DGII</span>
        </button>

        {/* Cash Register Indicator */}
        <div
          onClick={onOpenCashModal}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: activeSession ? 'var(--success-bg)' : 'var(--danger-bg)',
            border: `1px solid ${activeSession ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
            padding: '6px 12px',
            borderRadius: '8px',
            cursor: 'pointer'
          }}
        >
          <Wallet size={15} color={activeSession ? 'var(--success)' : 'var(--danger)'} />
          <span style={{ fontSize: '0.76rem', fontWeight: 700, color: activeSession ? 'var(--success)' : 'var(--danger)' }}>
            {activeSession ? 'Caja Abierta' : 'Caja Cerrada'}
          </span>
        </div>

        {/* Notifications Center Bell (Section 31) */}
        <div ref={notifRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            style={{
              position: 'relative',
              background: isLight ? '#f8fafc' : 'rgba(255,255,255,0.04)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              padding: '8px',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute',
                top: '-4px',
                right: '-4px',
                background: '#ef4444',
                color: 'var(--text-primary)',
                fontSize: '0.66rem',
                fontWeight: 800,
                borderRadius: '50%',
                width: '18px',
                height: '18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid var(--bg-header)'
              }}>
                {unreadCount}
              </span>
            )}
          </button>

          {/* Notifications Dropdown Panel */}
          {showNotifications && (
            <div style={{
              position: 'absolute',
              top: '46px',
              right: 0,
              width: '360px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              boxShadow: 'var(--shadow-dropdown)',
              maxHeight: '450px',
              overflowY: 'auto',
              padding: '12px 0',
              zIndex: 50
            }}>
              <div style={{ padding: '0 16px 10px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-primary)' }}>Centro de Notificaciones</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{unreadCount} pendientes</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {notifications.length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
                    No hay notificaciones pendientes.
                  </div>
                ) : (
                  notifications.map(n => (
                    <div
                      key={n.id}
                      onClick={() => handleMarkAsRead(n.id)}
                      style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid var(--border-color)',
                        background: n.is_read ? 'transparent' : 'rgba(37, 99, 235, 0.08)',
                        cursor: 'pointer',
                        transition: 'background 0.15s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = n.is_read ? 'transparent' : 'rgba(37, 99, 235, 0.08)'}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                        {n.priority === 'urgent' ? (
                          <AlertOctagon size={16} color="#ef4444" style={{ marginTop: '2px', flexShrink: 0 }} />
                        ) : (
                          <AlertTriangle size={16} color="#f59e0b" style={{ marginTop: '2px', flexShrink: 0 }} />
                        )}
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{n.title}</p>
                          <p style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', margin: '3px 0 0' }}>{n.message}</p>
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                            {new Date(n.created_at).toLocaleDateString('es-DO', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Currency badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)', padding: '6px 10px', background: isLight ? '#f8fafc' : 'rgba(255,255,255,0.03)', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
          <span>🇩🇴 RD$ (DOP)</span>
        </div>
      </div>
      {/* RNC DGII Lookup Modal */}
      <RncLookupModal
        isOpen={showRncModal}
        onClose={() => setShowRncModal(false)}
      />
    </header>
  );
}
