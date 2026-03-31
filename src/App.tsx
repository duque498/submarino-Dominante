import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { AppLayout } from "@/components/layout/AppLayout";
import AuthPage from "@/pages/AuthPage";
import ResetPasswordPage from "@/pages/ResetPasswordPage";
import DashboardPage from "@/pages/DashboardPage";
import MarketPage from "@/pages/MarketPage";
import ChartPage from "@/pages/ChartPage";
import StrategiesPage from "@/pages/StrategiesPage";
import AlertsPage from "@/pages/AlertsPage";
import HistoryPage from "@/pages/HistoryPage";
import BacktestsPage from "@/pages/BacktestsPage";
import PaperTradingPage from "@/pages/PaperTradingPage";
import SettingsPage from "@/pages/SettingsPage";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoutes() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/auth" replace />;
  }

  return <AppLayout />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route element={<ProtectedRoutes />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/mercado" element={<MarketPage />} />
            <Route path="/grafico" element={<ChartPage />} />
            <Route path="/estrategias" element={<StrategiesPage />} />
            <Route path="/alertas" element={<AlertsPage />} />
            <Route path="/historico" element={<HistoryPage />} />
            <Route path="/backtests" element={<BacktestsPage />} />
            <Route path="/paper-trading" element={<PaperTradingPage />} />
            <Route path="/configuracoes" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
