import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { ChatHeader } from './components/ChatHeader';
import { MessageList } from './components/MessageList';
import { ChatComposer } from './components/ChatComposer';
import { EmptyState } from './components/EmptyState';
import { IdentityModal } from './components/IdentityModal';
import { LoginPage } from './pages/LoginPage';
import { useChatStore } from './store/useChatStore';
import { useAuthStore } from './store/useAuthStore';

const TelemetryPage = React.lazy(() => import('./pages/TelemetryPage').then((m) => ({ default: m.TelemetryPage })));
const AdminPage = React.lazy(() => import('./pages/AdminPage').then((m) => ({ default: m.AdminPage })));

const PageFallback: React.FC = () => (
  <div className="flex-1 flex items-center justify-center bg-[#14151a]">
    <div className="flex items-center space-x-3 text-slate-400">
      <div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      <span className="text-sm font-medium">Carregando painel...</span>
    </div>
  </div>
);

const AdminGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAdmin } = useAuthStore();
  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
};

const MainChatView: React.FC = () => {
  const { activeConversation, startNewChat } = useChatStore();

  React.useEffect(() => {
    if (!activeConversation) {
      startNewChat();
    }
  }, []);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-gradient-to-br from-[#3d1e13]/60 via-[#181922] to-[#0c0d12] relative">
      {/* Background warm radial mesh aura */}
      <div className="absolute top-0 left-1/4 w-[600px] h-[400px] bg-gradient-to-br from-[#c86234]/25 via-[#6a301e]/15 to-transparent rounded-full blur-[130px] pointer-events-none" />

      <ChatHeader />
      <div className="flex-1 overflow-y-auto flex flex-col relative z-10">
        {activeConversation && activeConversation.messages.length > 0 ? (
          <MessageList />
        ) : (
          <EmptyState />
        )}
      </div>
      <ChatComposer />
    </div>
  );
};

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Uncaught React Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-screen bg-[#0d0e12] text-slate-100 p-6 text-center">
          <div className="max-w-md bg-[#181920] border border-red-500/30 rounded-2xl p-6 shadow-2xl space-y-4">
            <h2 className="text-lg font-bold text-red-400">Ocorreu um erro no aplicativo</h2>
            <p className="text-xs text-slate-400">
              {this.state.error?.message || 'Falha inesperada de renderização.'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl transition"
            >
              Recarregar Página
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export const App: React.FC = () => {
  const { isAuthenticated, checkSession } = useAuthStore();

  useEffect(() => {
    checkSession();
  }, []);

  if (!isAuthenticated) {
    return (
      <ErrorBoundary>
        <LoginPage />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <div className="flex items-center justify-center min-h-screen bg-[#0a0b0f] p-0 sm:p-4 text-slate-100 font-sans antialiased select-none">
          <IdentityModal />
          <div className="w-full max-w-[1536px] h-screen sm:h-[94vh] bg-[#14151a] border border-white/10 rounded-none sm:rounded-[32px] overflow-hidden shadow-2xl flex relative">
            <Sidebar />
            <main className="flex-1 flex flex-col h-full overflow-hidden relative">
              <React.Suspense fallback={<PageFallback />}>
                <Routes>
                  <Route path="/" element={<MainChatView />} />
                  <Route
                    path="/telemetry"
                    element={
                      <AdminGuard>
                        <TelemetryPage />
                      </AdminGuard>
                    }
                  />
                  <Route
                    path="/admin"
                    element={
                      <AdminGuard>
                        <AdminPage />
                      </AdminGuard>
                    }
                  />
                </Routes>
              </React.Suspense>
            </main>
          </div>
        </div>
      </BrowserRouter>
    </ErrorBoundary>
  );
};

export default App;
