import React from "react";
import { createBrowserRouter, Navigate, Outlet } from "react-router";
import { LoginWrapper, SignupWrapper, ProtectedRoute, AdminRoute } from "./components/auth/AuthGuards";
import { RootLayout } from "./layouts/RootLayout";
import { RouteErrorBoundary } from "./components/ui/RouteErrorBoundary";
import { Menu } from "./pages/Menu";
import { Cart } from "./pages/Cart";
import { Profile } from "./pages/Profile";
import { Settings } from "./pages/Settings";
import { Notifications } from "./pages/Notifications";
import { AdminLayout } from "./layouts/AdminLayout";
import { AdminDashboard } from "./pages/admin/AdminDashboard";
import { AdminItems } from "./pages/admin/AdminItems";
import { AdminMenu } from "./pages/admin/AdminMenu";
import { AdminSettings } from "./pages/admin/AdminSettings";
import { KitchenDashboard } from "./pages/admin/KitchenDashboard";
import { AdminCheckin } from "./pages/admin/AdminCheckin";
import { AdminReviews } from "./pages/admin/AdminReviews";
import { AdminNotifications } from "./pages/admin/AdminNotifications";
import { AdminOrders } from "./pages/admin/AdminOrders";
import { AdminUsers } from "./pages/admin/AdminUsers";
import { AdminReports } from "./pages/admin/AdminReports";
import { CompleteProfile } from "./pages/CompleteProfile";
import { Measurements } from "./pages/Measurements";
import { FoodCare } from "./pages/FoodCare";
import { Team } from "./pages/Team";
import { Rate } from "./pages/Rate";
import { AdminBanners } from "./pages/admin/AdminBanners";
import { WasteControl } from "./pages/admin/WasteControl";
import { AdminLogs } from "./pages/admin/AdminLogs";
import { Recipes } from "./pages/Recipes";
import { AdminRecipes } from "./pages/admin/AdminRecipes";
// AdminPermissions removed – route now uses AdminUsers with defaultTab="permissions"

// Wrapper to add per-route error boundaries
function WithBoundary({ children, name }: { children: React.ReactNode; name: string }) {
  return <RouteErrorBoundary routeName={name}>{children}</RouteErrorBoundary>;
}

// Standalone error fallback that does NOT depend on any context providers.
// Used at the root route level so React Router's default error boundary never fires.
function RootErrorFallback() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-8 text-center">
      <div className="bg-red-100 dark:bg-red-950/30 p-4 rounded-full mb-4">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-600 dark:text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      </div>
      <h2 className="text-xl font-bold text-foreground mb-2">Algo deu errado</h2>
      <p className="text-muted-foreground mb-6 max-w-md text-sm">
        Ocorreu um erro inesperado ao carregar a aplicacao.
      </p>
      <button
        onClick={() => { window.location.href = "/"; }}
        className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:opacity-90 transition-opacity"
      >
        Voltar ao Inicio
      </button>
    </div>
  );
}

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    errorElement: <RootErrorFallback />,
    children: [
      {
        path: "/login",
        element: <LoginWrapper />,
      },
      {
        path: "/signup",
        element: <SignupWrapper />,
      },
      {
        path: "/",
        element: (
          <ProtectedRoute>
            <Outlet />
          </ProtectedRoute>
        ),
        errorElement: <WithBoundary name="Aplicacao"><div /></WithBoundary>,
        children: [
          { index: true, element: <WithBoundary name="Cardápio"><Menu /></WithBoundary> },
          { path: "complete-profile", element: <WithBoundary name="Cadastro"><CompleteProfile /></WithBoundary> },
          { path: "cart", element: <WithBoundary name="Sacola"><Cart /></WithBoundary> },
          { path: "orders", element: <WithBoundary name="Meus Pedidos"><Profile /></WithBoundary> },
          { path: "settings", element: <WithBoundary name="Configurações"><Settings /></WithBoundary> },
          { path: "notifications", element: <WithBoundary name="Notificações"><Notifications /></WithBoundary> },
          { path: "measurements", element: <WithBoundary name="Tabela de Medidas"><Measurements /></WithBoundary> },
          { path: "food-care", element: <WithBoundary name="Cuidados com sua comida"><FoodCare /></WithBoundary> },
          { path: "team", element: <WithBoundary name="Equipe Responsavel"><Team /></WithBoundary> },
          { path: "rate", element: <WithBoundary name="Avaliar Almoco"><Rate /></WithBoundary> },
          { path: "receitas", element: <WithBoundary name="Receitas"><Recipes /></WithBoundary> },
        ],
      },
      {
        path: "/admin",
        element: (
          <AdminRoute>
            <AdminLayout />
          </AdminRoute>
        ),
        errorElement: <WithBoundary name="Admin"><div /></WithBoundary>,
        children: [
          // Operational Group (First Priority)
          { index: true, element: <WithBoundary name="Dashboard"><AdminDashboard /></WithBoundary> },
          { path: "orders", element: <WithBoundary name="Pedidos"><AdminOrders /></WithBoundary> },
          { path: "kitchen", element: <WithBoundary name="Cozinha KDS"><KitchenDashboard /></WithBoundary> },
          { path: "checkin", element: <WithBoundary name="Check-in"><AdminCheckin /></WithBoundary> },
          { path: "waste", element: <WithBoundary name="Controle de Desperdício"><WasteControl /></WithBoundary> },
          
          // Management Group
          { path: "menu-planner", element: <WithBoundary name="Cardápio"><AdminMenu /></WithBoundary> },
          { path: "items", element: <WithBoundary name="Itens"><AdminItems /></WithBoundary> },
          { path: "reviews", element: <WithBoundary name="Avaliações"><AdminReviews /></WithBoundary> },
          { path: "reports", element: <WithBoundary name="Relatórios"><AdminReports /></WithBoundary> },
          { path: "users", element: <WithBoundary name="Usuários & Permissões"><AdminUsers /></WithBoundary> },
          // permissions route → same component, opens the Permissions tab
          { path: "permissions", element: <WithBoundary name="Funções & Permissões"><AdminUsers defaultTab="permissions" /></WithBoundary> },

          // Admin/System Group
          { path: "banners", element: <WithBoundary name="Banners"><AdminBanners /></WithBoundary> },
          { path: "notifications", element: <WithBoundary name="Notificacoes Admin"><AdminNotifications /></WithBoundary> },
          { path: "settings", element: <WithBoundary name="Configuracoes"><AdminSettings /></WithBoundary> },
          { path: "logs", element: <WithBoundary name="Log de Auditoria"><AdminLogs /></WithBoundary> },
          { path: "recipe-suggestions", element: <WithBoundary name="Sugestões de Receita"><AdminRecipes /></WithBoundary> },
        ],
      },
      {
        path: "*",
        element: <Navigate to="/" replace />,
      },
    ],
  },
]);