import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search, MapPin, Wallet, Bell, CheckCircle2, AlertTriangle,
  AlertOctagon, Clock, User, Package, Receipt, Truck,
  ChevronRight, X, Building2, ChevronDown, Check, Sun, Moon,
  CheckCheck, Trash2, Inbox, RotateCw, ExternalLink
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
  const [notifTab, setNotifTab] = useState('all'); // 'all' | 'unread'
  const [loadingNotifs, setLoadingNotifs] = useState(false);
  const notifRef = useRef(null);

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadNotifications = async () => {
    try {
      setLoadingNotifs(true);
      const res = await api.get('/admin/notifications');
      if (res.success) {
        setNotifications(res.data || []);
        setUnreadCount(res.unread_count || 0);
      }
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setLoadingNotifs(false);
    }
  };

  const handleMarkAsRead = async (id) => {
    try {
      await api.post(`/admin/notifications/${id}/read`);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: 1 } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {}
  };

  const handleMarkAllAsRead = async () => {
    try {
      await api.post('/admin/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Error marking all read:', err);
    }
  };

  const handleClearRead = async () => {
    try {
      await api.delete('/admin/notifications/clear-read');
      setNotifications(prev => prev.filter(n => !n.is_read));
    } catch (err) {
      console.error('Error clearing read:', err);
    }
  };

  const handleDeleteNotification = async (id, e) => {
    e.stopPropagation();
    try {
      await api.delete(`/admin/notifications/${id}`);
      setNotifications(prev => prev.filter(n => n.id !== id));
      setUnreadCount(prev => {
        const notif = notifications.find(n => n.id === id);
        return notif && !notif.is_read ? Math.max(0, prev - 1) : prev;
      });
    } catch (err) {
      console.error('Error deleting notification:', err);
    }
  };

  const handleNotificationClick = (n) => {
    if (!n.is_read) {
      handleMarkAsRead(n.id);
    }
    setShowNotifications(false);

    if (typeof onNavigate === 'function') {
      if (n.link?.includes('/inventory') || n.type === 'stock_low') {
        onNavigate('inventory');
      } else if (n.link?.includes('/finance') || n.type === 'overdue_invoice' || n.type === 'recurring_expense') {
        onNavigate('finance');
      } else if (n.link?.includes('/customers') || n.type === 'credit_exceeded') {
        onNavigate('customers');
      } else if (n.link?.includes('/sales') || n.type === 'sale') {
        onNavigate('sales');
      } else if (n.link?.includes('/security') || n.link?.includes('/authorizations') || n.type === 'authorization') {
        onNavigate('security');
      } else if (n.link?.includes('/purchases')) {
        onNavigate('purchases');
      }
    }
  };

  const filteredNotifications = useMemo(() => {
    if (notifTab === 'unread') {
      return notifications.filter(n => !n.is_read);
    }
    return notifications;
  }, [notifications, notifTab]);

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
        <button
          type="button"
          onClick={() => {
            if (typeof onOpenCashModal === 'function') {
              onOpenCashModal();
            } else if (typeof onNavigate === 'function') {
              onNavigate('cash-register');
            }
          }}
          title={activeSession ? 'Turno de Caja Abierto - Clic para ver arqueo y cuadres' : 'Caja Cerrada - Clic para aperturar turno de caja'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: activeSession ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
            border: `1px solid ${activeSession ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
            padding: '6px 12px',
            borderRadius: '8px',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
        >
          <Wallet size={15} color={activeSession ? 'var(--success)' : 'var(--danger)'} />
          <span style={{ fontSize: '0.76rem', fontWeight: 700, color: activeSession ? 'var(--success)' : 'var(--danger)' }}>
            {activeSession ? 'Caja Abierta' : 'Caja Cerrada'}
          </span>
        </button>

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
              width: '400px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '14px',
              boxShadow: 'var(--shadow-dropdown)',
              maxHeight: '520px',
              display: 'flex',
              flexDirection: 'column',
              zIndex: 50,
              overflow: 'hidden'
            }}>
              {/* Header */}
              <div style={{
                padding: '14px 16px',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: isLight ? '#f8fafc' : 'rgba(255,255,255,0.02)'
              }}>
                <div>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                    Centro de Notificaciones
                  </h4>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {unreadCount > 0 ? `${unreadCount} pendientes de atención` : 'Todo al día'}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button
                    onClick={loadNotifications}
                    disabled={loadingNotifs}
                    className="btn btn-secondary btn-sm"
                    title="Actualizar notificaciones"
                    style={{ padding: '5px 7px', height: '28px' }}
                  >
                    <RotateCw size={13} className={loadingNotifs ? 'animate-spin' : ''} />
                  </button>

                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllAsRead}
                      className="btn btn-secondary btn-sm"
                      title="Marcar todas como leídas"
                      style={{ padding: '5px 8px', height: '28px', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      <CheckCheck size={13} color="#10b981" />
                      <span>Leídas</span>
                    </button>
                  )}

                  {notifications.some(n => n.is_read) && (
                    <button
                      onClick={handleClearRead}
                      className="btn btn-secondary btn-sm"
                      title="Limpiar notificaciones leídas"
                      style={{ padding: '5px 8px', height: '28px', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      <Trash2 size={13} color="var(--text-muted)" />
                      <span>Limpiar</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Sub-tabs: Todas / No leídas */}
              <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', background: isLight ? '#f1f5f9' : 'rgba(0,0,0,0.15)', padding: '4px 8px', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => setNotifTab('all')}
                  style={{
                    flex: 1,
                    padding: '5px 8px',
                    borderRadius: '6px',
                    border: 'none',
                    background: notifTab === 'all' ? 'var(--bg-card)' : 'transparent',
                    color: notifTab === 'all' ? 'var(--accent-primary)' : 'var(--text-secondary)',
                    fontWeight: notifTab === 'all' ? 700 : 500,
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                >
                  Todas ({notifications.length})
                </button>
                <button
                  type="button"
                  onClick={() => setNotifTab('unread')}
                  style={{
                    flex: 1,
                    padding: '5px 8px',
                    borderRadius: '6px',
                    border: 'none',
                    background: notifTab === 'unread' ? 'var(--bg-card)' : 'transparent',
                    color: notifTab === 'unread' ? '#ef4444' : 'var(--text-secondary)',
                    fontWeight: notifTab === 'unread' ? 700 : 500,
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    transition: 'all 0.15s'
                  }}
                >
                  <span>No leídas</span>
                  {unreadCount > 0 && (
                    <span style={{ background: '#ef4444', color: '#fff', fontSize: '0.65rem', padding: '1px 6px', borderRadius: '10px', fontWeight: 800 }}>
                      {unreadCount}
                    </span>
                  )}
                </button>
              </div>

              {/* Notification Items List */}
              <div style={{ overflowY: 'auto', maxHeight: '380px', display: 'flex', flexDirection: 'column' }}>
                {filteredNotifications.length === 0 ? (
                  <div style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                    <Inbox size={32} style={{ margin: '0 auto 10px', opacity: 0.4 }} />
                    <p style={{ margin: 0, fontWeight: 600 }}>
                      {notifTab === 'unread' ? 'No tienes notificaciones pendientes.' : 'No hay notificaciones registradas.'}
                    </p>
                    <p style={{ fontSize: '0.74rem', marginTop: '4px', color: 'var(--text-secondary)' }}>
                      Las alertas automáticas de inventario, cobros y gastos aparecerán aquí.
                    </p>
                  </div>
                ) : (
                  filteredNotifications.map(n => {
                    const isUrgent = n.priority === 'urgent';
                    const isHigh = n.priority === 'high';
                    const isUnread = !n.is_read;

                    return (
                      <div
                        key={n.id}
                        onClick={() => handleNotificationClick(n)}
                        style={{
                          padding: '12px 16px',
                          borderBottom: '1px solid var(--border-color)',
                          background: isUnread ? (isLight ? 'rgba(59, 130, 246, 0.08)' : 'rgba(37, 99, 235, 0.12)') : 'transparent',
                          cursor: 'pointer',
                          position: 'relative',
                          transition: 'background 0.15s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = isLight ? '#f1f5f9' : 'rgba(255,255,255,0.06)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = isUnread ? (isLight ? 'rgba(59, 130, 246, 0.08)' : 'rgba(37, 99, 235, 0.12)') : 'transparent'}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                          <div style={{
                            padding: '6px',
                            borderRadius: '8px',
                            background: isUrgent ? 'rgba(239, 68, 68, 0.15)' : isHigh ? 'rgba(245, 158, 11, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                            marginTop: '2px',
                            flexShrink: 0
                          }}>
                            {isUrgent ? (
                              <AlertOctagon size={16} color="#ef4444" />
                            ) : isHigh ? (
                              <AlertTriangle size={16} color="#f59e0b" />
                            ) : (
                              <Bell size={16} color="#3b82f6" />
                            )}
                          </div>

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                              <p style={{
                                fontSize: '0.82rem',
                                fontWeight: isUnread ? 800 : 600,
                                color: isUnread ? 'var(--text-primary)' : 'var(--text-secondary)',
                                margin: 0,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}>
                                {n.title}
                              </p>

                              {isUnread && (
                                <span style={{
                                  width: '7px',
                                  height: '7px',
                                  borderRadius: '50%',
                                  background: '#3b82f6',
                                  flexShrink: 0,
                                  boxShadow: '0 0 6px #3b82f6'
                                }} />
                              )}
                            </div>

                            <p style={{ fontSize: '0.74rem', color: isUnread ? 'var(--text-primary)' : 'var(--text-muted)', margin: '3px 0 0', lineHeight: '1.35' }}>
                              {n.message}
                            </p>

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px' }}>
                              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                {new Date(n.created_at).toLocaleString('es-DO', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </span>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '0.7rem', color: 'var(--accent-primary)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                                  <span>Ir al módulo</span>
                                  <ExternalLink size={10} />
                                </span>

                                <button
                                  type="button"
                                  onClick={(e) => handleDeleteNotification(n.id, e)}
                                  title="Descartar notificación"
                                  style={{
                                    background: 'transparent',
                                    border: 'none',
                                    cursor: 'pointer',
                                    padding: '2px',
                                    color: 'var(--text-muted)',
                                    display: 'flex',
                                    alignItems: 'center'
                                  }}
                                  onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'}
                                  onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
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
