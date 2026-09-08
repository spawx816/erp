import React, { useState } from 'react';
import {
  LayoutDashboard, ShoppingCart, Receipt, RotateCcw,
  Users, FileText, ShieldAlert, Map,
  HandCoins, History, CalendarClock, DollarSign,
  Package, Grid3X3, Warehouse, Layers, Activity,
  ShoppingBag, Truck, CreditCard,
  ReceiptText, Wallet, CalendarDays,
  UserCheck, Percent,
  FileSpreadsheet, Calculator,
  KeyRound, ShieldCheck, FileClock, Settings,
  LogOut, ChevronDown, ChevronRight
} from 'lucide-react';

export default function Sidebar({ currentTab, setCurrentTab, user, onLogout }) {
  // Expanded sections state
  const [openSections, setOpenSections] = useState({
    ventas: true,
    clientes: true,
    cobros: true,
    inventario: true,
    compras: false,
    gastos: false,
    vendedores: false,
    reportes: false,
    admin: false
  });

  const toggleSection = (key) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Define all available menu sections
  const allSections = [
    {
      id: 'dashboard',
      label: 'DASHBOARD',
      icon: LayoutDashboard,
      single: true
    },
    {
      id: 'ventas',
      label: 'VENTAS',
      icon: Receipt,
      roles: ['admin', 'gerente', 'cajero', 'vendedor'],
      items: [
        { id: 'pos', label: 'Facturación (POS)', icon: ShoppingCart, highlight: true },
        { id: 'sales', label: 'Historial de Facturas', icon: Receipt },
        { id: 'credit-notes', label: 'Notas de Crédito (NCF B04)', icon: RotateCcw }
      ]
    },
    {
      id: 'clientes',
      label: 'CLIENTES',
      icon: Users,
      roles: ['admin', 'gerente', 'cajero', 'vendedor', 'cobros'],
      items: [
        { id: 'customers', label: 'Directorio de Clientes', icon: Users },
        { id: 'customer-statement', label: 'Estados de Cuenta', icon: FileText },
        { id: 'credit-risk', label: 'Límites & Riesgo', icon: ShieldAlert, roles: ['admin', 'gerente', 'cobros'] }
      ]
    },
    {
      id: 'cobros',
      label: 'COBROS & CxC',
      icon: HandCoins,
      roles: ['admin', 'gerente', 'cajero', 'cobros', 'vendedor'],
      items: [
        { id: 'collections', label: 'Cuentas por Cobrar & Cobros', icon: HandCoins },
        { id: 'aging', label: 'Antigüedad de Saldos (0-120+)', icon: CalendarClock, roles: ['admin', 'gerente', 'cobros'] }
      ]
    },
    {
      id: 'inventario',
      label: 'INVENTARIO',
      icon: Warehouse,
      items: [
        { id: 'products', label: 'Catálogo de Productos', icon: Package },
        { id: 'dye-matrix', label: 'Matriz de Tintes', icon: Grid3X3, highlight: true },
        { id: 'inventory', label: 'Existencias & Kardex', icon: Warehouse, roles: ['admin', 'gerente', 'almacen'] },
        { id: 'inventory-lots', label: 'Lotes & Vencimientos', icon: Layers, roles: ['admin', 'gerente', 'almacen'] },
        { id: 'inventory-analysis', label: 'Rotación & Análisis ABC', icon: Activity, roles: ['admin', 'gerente', 'almacen'] }
      ]
    },
    {
      id: 'compras',
      label: user?.role_slug === 'almacen' ? 'RECEPCIONES & COMPRAS' : 'COMPRAS & CxP',
      icon: ShoppingBag,
      roles: ['admin', 'gerente', 'almacen'],
      items: [
        { id: 'suppliers', label: 'Proveedores', icon: Truck },
        { id: 'purchases', label: user?.role_slug === 'almacen' ? 'Recepción de Mercancía' : 'Compras / Órdenes', icon: ShoppingBag },
        { id: 'cxp-dashboard', label: 'Cuentas por Pagar (CxP)', icon: CreditCard, roles: ['admin', 'gerente'] }
      ]
    },
    {
      id: 'gastos',
      label: 'CONTROL DE GASTOS',
      icon: ReceiptText,
      roles: ['admin', 'gerente', 'cajero'],
      items: [
        { id: 'expenses', label: 'Gastos Operativos', icon: ReceiptText, roles: ['admin', 'gerente'] },
        { id: 'cash-register', label: 'Caja Chica & Cuadres', icon: Wallet },
        { id: 'fixed-expenses', label: 'Gastos Fijos / Recurrentes', icon: CalendarDays, roles: ['admin', 'gerente'] }
      ]
    },
    {
      id: 'vendedores',
      label: user?.role_slug === 'vendedor' ? 'MIS COMISIONES' : 'FUERZA DE VENTAS',
      icon: UserCheck,
      roles: ['admin', 'gerente', 'vendedor'],
      items: [
        { id: 'salespeople', label: 'Vendedores & Metas', icon: UserCheck, roles: ['admin', 'gerente'] },
        { id: 'commissions', label: user?.role_slug === 'vendedor' ? 'Mis Comisiones' : 'Liquidación Comisiones', icon: Percent }
      ]
    },
    {
      id: 'reportes',
      label: 'REPORTES & FISCAL',
      icon: FileSpreadsheet,
      roles: ['admin', 'gerente'],
      items: [
        { id: 'reports', label: 'Reportes Gerenciales', icon: FileSpreadsheet },
        { id: 'fiscal', label: 'Comprobantes Fiscales (NCF)', icon: FileText },
        { id: 'monthly-closing', label: 'Cierre Mensual', icon: Calculator, highlight: true }
      ]
    },
    {
      id: 'admin',
      label: 'ADMINISTRACIÓN',
      icon: Settings,
      roles: ['admin', 'gerente'],
      items: [
        { id: 'users', label: 'Usuarios', icon: KeyRound },
        { id: 'authorizations', label: 'Roles & Permisos', icon: ShieldCheck },
        { id: 'audit-logs', label: 'Auditoría', icon: FileClock },
        { id: 'imports', label: 'Importación Masiva Excel', icon: Layers },
        { id: 'settings', label: 'Configuración General', icon: Settings }
      ]
    }
  ];

  const userRole = user?.role_slug || 'admin';

  // Filter sections and their items according to user's role
  const menuSections = allSections
    .filter(section => {
      if (section.roles && !section.roles.includes(userRole)) return false;
      return true;
    })
    .map(section => {
      if (section.items) {
        const filteredItems = section.items.filter(item => {
          if (item.roles && !item.roles.includes(userRole)) return false;
          return true;
        });
        return { ...section, items: filteredItems };
      }
      return section;
    })
    .filter(section => section.single || (section.items && section.items.length > 0));

  return (
    <aside className="sidebar" style={{ width: '265px', minWidth: '265px', background: 'var(--bg-sidebar)', borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Brand Header */}
      <div style={{ padding: '18px 18px 14px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-sidebar)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '10px',
            background: 'var(--accent-gradient)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'var(--accent-glow)'
          }}>
            <ShoppingCart size={22} color="#fff" />
          </div>
          <div>
            <h1 style={{ fontSize: '1.05rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)', margin: 0 }}>Nexus ERP</h1>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '2px 0 0' }}>Comercial Cambri SRL 🇩🇴</p>
          </div>
        </div>
      </div>

      {/* Navigation Sections (Hierarchical Accordion) */}
      <div style={{ flex: 1, padding: '14px 10px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {menuSections.map(section => {
          if (section.single) {
            const Icon = section.icon;
            const isActive = currentTab === section.id;
            return (
              <button
                key={section.id}
                onClick={() => setCurrentTab(section.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: 'none',
                  background: isActive ? 'var(--accent-primary)' : 'transparent',
                  color: isActive ? '#fff' : 'var(--text-secondary)',
                  fontWeight: isActive ? 700 : 600,
                  fontSize: '0.84rem',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
              >
                <Icon size={18} color={isActive ? '#fff' : 'var(--text-muted)'} />
                <span>{section.label}</span>
              </button>
            );
          }

          const isOpen = openSections[section.id];
          const hasActiveChild = section.items?.some(it => it.id === currentTab);
          const SectionIcon = section.icon;

          return (
            <div key={section.id} style={{ display: 'flex', flexDirection: 'column' }}>
              <button
                onClick={() => toggleSection(section.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  background: hasActiveChild ? 'rgba(37, 99, 235, 0.1)' : 'transparent',
                  color: hasActiveChild ? 'var(--accent-primary)' : 'var(--text-muted)',
                  fontSize: '0.74rem',
                  fontWeight: 800,
                  letterSpacing: '0.06em',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.15s ease'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = hasActiveChild ? 'rgba(37, 99, 235, 0.1)' : 'transparent'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <SectionIcon size={15} color={hasActiveChild ? 'var(--accent-primary)' : 'var(--text-muted)'} />
                  <span>{section.label}</span>
                </div>
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>

              {/* Sub-items */}
              {isOpen && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingLeft: '12px', marginTop: '2px' }}>
                  {section.items.map(subItem => {
                    const SubIcon = subItem.icon;
                    const isSubActive = currentTab === subItem.id;
                    return (
                      <button
                        key={subItem.id}
                        onClick={() => setCurrentTab(subItem.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '7px 12px',
                          borderRadius: '6px',
                          border: 'none',
                          background: isSubActive
                            ? (subItem.highlight ? 'var(--accent-gradient)' : 'rgba(37, 99, 235, 0.14)')
                            : 'transparent',
                          color: isSubActive ? '#fff' : 'var(--text-primary)',
                          fontWeight: isSubActive ? 600 : 500,
                          fontSize: '0.82rem',
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={(e) => { if (!isSubActive) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                        onMouseLeave={(e) => { if (!isSubActive) e.currentTarget.style.background = 'transparent'; }}
                      >
                        <SubIcon size={15} color={isSubActive ? '#fff' : (subItem.highlight ? 'var(--accent-primary)' : 'var(--text-muted)')} />
                        <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{subItem.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* User profile & quick session footer */}
      <div style={{ padding: '14px 16px', borderTop: '1px solid var(--border-color)', background: 'var(--bg-sidebar)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ overflow: 'hidden', flex: 1 }}>
            <p style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0, whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
              {user ? `${user.first_name} ${user.last_name}` : 'Usuario'}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
              <span className="badge badge-info" style={{ fontSize: '0.66rem', padding: '1px 6px' }}>
                {user?.role_name || 'Admin'}
              </span>
            </div>
          </div>
          <button
            onClick={onLogout}
            title="Cerrar Sesión"
            style={{
              background: 'var(--danger-bg)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              borderRadius: '8px',
              padding: '7px',
              color: 'var(--danger)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.15s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.25)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'var(--danger-bg)'}
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
