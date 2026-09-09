import React, { useState, useEffect, lazy, Suspense } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import LoginModal from './components/LoginModal';
import { ToastProvider } from './context/ToastContext';
import api from './services/api';

// Code-splitting with React.lazy
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const POSPage = lazy(() => import('./pages/POSPage'));
const ProductsPage = lazy(() => import('./pages/ProductsPage'));
const DyeMatrixPage = lazy(() => import('./pages/DyeMatrixPage'));
const InventoryPage = lazy(() => import('./pages/InventoryPage'));
const PurchasesPage = lazy(() => import('./pages/PurchasesPage'));
const SalesHistoryPage = lazy(() => import('./pages/SalesHistoryPage'));
const CreditNotesPage = lazy(() => import('./pages/CreditNotesPage'));
const CashRegisterPage = lazy(() => import('./pages/CashRegisterPage'));
const FinancePage = lazy(() => import('./pages/FinancePage'));
const ThirdPartiesPage = lazy(() => import('./pages/ThirdPartiesPage'));
const SalespeoplePage = lazy(() => import('./pages/SalespeoplePage'));
const RecurringExpensesPage = lazy(() => import('./pages/RecurringExpensesPage'));
const MonthlyClosingPage = lazy(() => import('./pages/MonthlyClosingPage'));
const FiscalPage = lazy(() => import('./pages/FiscalPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const SecurityPage = lazy(() => import('./pages/SecurityPage'));
const ImportsPage = lazy(() => import('./pages/ImportsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

function PageLoader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', gap: '12px' }}>
      <div style={{ width: '28px', height: '28px', border: '3px solid var(--border-color)', borderTopColor: 'var(--accent-primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Cargando módulo...</span>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [activeBranch, setActiveBranch] = useState(null);
  const [activeSession, setActiveSession] = useState(null);
  const [loadingInitial, setLoadingInitial] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const token = localStorage.getItem('sgc_token');
    if (!token) {
      setLoadingInitial(false);
      return;
    }

    try {
      const res = await api.get('/auth/me');
      if (res.success) {
        setUser(res.user);
        const branches = res.user.accessible_branches || [];
        const savedBranchId = localStorage.getItem('sgc_branch_id');
        let branch = branches.find(b => b.id === parseInt(savedBranchId, 10)) || branches[0];
        if (!branch) {
          branch = { id: 1, name: 'Sucursal Principal Santo Domingo', code: 'SUC-01', is_main: 1 };
        }
        setActiveBranch(branch);
        setActiveSession(res.user.active_cash_session);
      }
    } catch (err) {
      console.error('Session verification failed:', err);
      localStorage.removeItem('sgc_token');
      localStorage.removeItem('sgc_user');
      setUser(null);
    } finally {
      setLoadingInitial(false);
    }
  };

  const handleBranchChange = (branch) => {
    setActiveBranch(branch);
    localStorage.setItem('sgc_branch_id', String(branch.id));
  };

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (err) {
      console.warn('Logout notification error:', err);
    }
    localStorage.removeItem('sgc_token');
    localStorage.removeItem('sgc_user');
    localStorage.removeItem('sgc_branch_id');
    setUser(null);
  };

  if (loadingInitial) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-app)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '32px', height: '32px', border: '3px solid var(--border-color)', borderTopColor: 'var(--accent-primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>Iniciando Nexus ERP...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginModal onLoginSuccess={(u) => setUser(u)} />;
  }

  return (
    <ToastProvider>
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-app)' }}>
        {/* Responsive Desktop / Mobile Sidebar */}
        <Sidebar
          currentTab={currentTab}
          setCurrentTab={setCurrentTab}
          user={user}
        />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
          <Header
            user={user}
            activeBranch={activeBranch}
            branches={user?.accessible_branches || []}
            onBranchChange={handleBranchChange}
            onLogout={handleLogout}
            onNavigate={setCurrentTab}
          />

          <main style={{ flex: 1, overflowY: 'auto', padding: '24px', background: 'var(--bg-app)' }}>
            <Suspense fallback={<PageLoader />}>
              {/* Dashboard & POS */}
              {currentTab === 'dashboard' && <DashboardPage user={user} activeBranch={activeBranch} />}
              {currentTab === 'pos' && (
                <POSPage
                  user={user}
                  activeBranch={activeBranch}
                  activeSession={activeSession}
                  onRefreshSession={checkAuth}
                />
              )}

              {/* Ventas & Historial */}
              {currentTab === 'sales-history' && (
                <SalesHistoryPage user={user} activeBranch={activeBranch} />
              )}
              {currentTab === 'credit-notes' && (
                <CreditNotesPage user={user} activeBranch={activeBranch} />
              )}

              {/* Clientes & Proveedores (Terceros) */}
              {currentTab === 'customers' && <ThirdPartiesPage user={user} initialMode="customers" onNavigate={setCurrentTab} />}
              {currentTab === 'customer-statement' && <ThirdPartiesPage user={user} initialMode="customer-statement" onNavigate={setCurrentTab} />}
              {currentTab === 'credit-risk' && <ThirdPartiesPage user={user} initialMode="credit-risk" onNavigate={setCurrentTab} />}
              {currentTab === 'suppliers' && <ThirdPartiesPage user={user} initialMode="suppliers" onNavigate={setCurrentTab} />}
              {currentTab === 'third-parties' && <ThirdPartiesPage user={user} initialMode="customers" onNavigate={setCurrentTab} />}

              {/* Cobros & Finanzas */}
              {currentTab === 'collections' && <FinancePage user={user} activeBranch={activeBranch} initialTab="cxc" />}
              {currentTab === 'aging' && <FinancePage user={user} activeBranch={activeBranch} initialTab="aging" />}
              {currentTab === 'collection-history' && <FinancePage user={user} activeBranch={activeBranch} initialTab="cxc" />}
              {currentTab === 'collection-promises' && <ThirdPartiesPage user={user} initialMode="customers" />}
              {currentTab === 'cxc-dashboard' && <FinancePage user={user} activeBranch={activeBranch} initialTab="cxc" />}
              {currentTab === 'cxp-dashboard' && <FinancePage user={user} activeBranch={activeBranch} initialTab="cxp" />}
              {currentTab === 'expenses' && <FinancePage user={user} activeBranch={activeBranch} initialTab="expenses" />}
              {currentTab === 'finance' && <FinancePage user={user} activeBranch={activeBranch} initialTab="cxc" />}

              {/* Inventario & Tintes */}
              {currentTab === 'products' && <ProductsPage user={user} />}
              {currentTab === 'dye-matrix' && <DyeMatrixPage user={user} onNavigateToPos={() => setCurrentTab('pos')} />}
              {currentTab === 'inventory' && <InventoryPage user={user} initialTab="stock" />}
              {currentTab === 'inventory-lots' && <InventoryPage user={user} initialTab="lots" />}
              {currentTab === 'inventory-analysis' && <InventoryPage user={user} initialTab="analysis" />}

              {/* Compras */}
              {currentTab === 'purchases' && <PurchasesPage user={user} activeBranch={activeBranch} />}

              {/* Gastos & Caja Chica & Pagos Fijos */}
              {currentTab === 'cash-register' && (
                <CashRegisterPage
                  user={user}
                  activeBranch={activeBranch}
                  activeSession={activeSession}
                  onRefreshUser={checkAuth}
                />
              )}
              {currentTab === 'fixed-expenses' && <RecurringExpensesPage user={user} />}

              {/* Vendedores & Comisiones */}
              {currentTab === 'salespeople' && <SalespeoplePage user={user} initialTab="salespeople" />}
              {currentTab === 'commissions' && <SalespeoplePage user={user} initialTab="commissions" />}

              {/* Reportes & Cierre Mensual */}
              {currentTab === 'reports' && <ReportsPage activeBranch={activeBranch} />}
              {currentTab === 'monthly-closing' && <MonthlyClosingPage />}

              {/* Fiscal & Administración */}
              {currentTab === 'fiscal' && <FiscalPage activeBranch={activeBranch} />}
              {currentTab === 'users' && <SecurityPage activeBranch={activeBranch} initialTab="users" />}
              {currentTab === 'authorizations' && <SecurityPage activeBranch={activeBranch} initialTab="roles" />}
              {currentTab === 'roles' && <SecurityPage activeBranch={activeBranch} initialTab="roles" />}
              {(currentTab === 'audit-logs' || currentTab === 'audit-log' || currentTab === 'audit') && <SecurityPage activeBranch={activeBranch} initialTab="audit" />}
              {currentTab === 'security' && <SecurityPage activeBranch={activeBranch} initialTab="users" />}
              {currentTab === 'imports' && <ImportsPage />}
              {currentTab === 'settings' && <SettingsPage />}
            </Suspense>
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
