import React, { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate, Outlet } from "react-router";
import { Loader2 } from "lucide-react";
import { LoginWrapper, SignupWrapper, ProtectedRoute, AdminRoute } from "./components/auth/AuthGuards";
import { RootLayout } from "./layouts/RootLayout";
import { RouteErrorBoundary } from "./components/ui/RouteErrorBoundary";
import { Menu } from "./pages/Menu";
import { Cart } from "./pages/Cart";
import { Profile } from "./pages/Profile";
import { Settings } from "./pages/Settings";
import { Notifications } from "./pages/Notifications";
import { AdminLayout } from "./layouts/AdminLayout";
import { CompleteProfile } from "./pages/CompleteProfile";
import { Measurements } from "./pages/Measurements";
import { FoodCare } from "./pages/FoodCare";
import { Team } from "./pages/Team";
import { Rate } from "./pages/Rate";
import { Recipes } from "./pages/Recipes";

// Admin pages are lazy-loaded: regular employees ordering lunch never open
// these, so they shouldn't pay for them in the initial bundle.
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard").then(m => ({ default: m.AdminDashboard })));
const AdminItems = lazy(() => import("./pages/admin/AdminItems").then(m => ({ default: m.AdminItems })));
const AdminMenu = lazy(() => import("./pages/admin/AdminMenu").then(m => ({ default: m.AdminMenu })));
const AdminSettings = lazy(() => import("./pages/admin/AdminSettings").then(m => ({ default: m.AdminSettings })));
const KitchenDashboard = lazy(() => import("./pages/admin/KitchenDashboard").then(m => ({ default: m.KitchenDashboard })));
const AdminCheckin = lazy(() => import("./pages/admin/AdminCheckin").then(m => ({ default: m.AdminCheckin })));
const AdminReviews = lazy(() => import("./pages/admin/AdminReviews").then(m => ({ default: m.AdminReviews })));
const AdminNotifications = lazy(() => import("./pages/admin/AdminNotifications").then(m => ({ default: m.AdminNotifications })));
const AdminOrders = lazy(() => import("./pages/admin/AdminOrders").then(m => ({ default: m.AdminOrders })));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers").then(m => ({ default: m.AdminUsers })));
const AdminReports = lazy(() => import("./pages/admin/AdminReports").then(m => ({ default: m.AdminReports })));
const AdminCheckinReport = lazy(() => import("./pages/admin/AdminCheckinReport").then(m => ({ default: m.AdminCheckinReport })));
const AdminBanners = lazy(() => import("./pages/admin/AdminBanners").then(m => ({ default: m.AdminBanners })));
const WasteControl = lazy(() => import("./pages/admin/WasteControl").then(m => ({ default: m.WasteControl })));
const AdminLogs = lazy(() => import("./pages/admin/AdminLogs").then(m => ({ default: m.AdminLogs })));
const AdminRecipes = lazy(() => import("./pages/admin/AdminRecipes").then(m => ({ default: m.AdminRecipes })));
// AdminPermissions removed – route now uses AdminUsers with defaultTab="permissions"

// Shown briefly while an admin page chunk downloads (fast on repeat visits — cached by the browser).
function AdminPageFallback() {
  return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="animate-spin text-muted-foreground" size={28} />
    </div>
  );
}

function LazyAdminPage({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<AdminPageFallback />}>{children}</Suspense>;
}

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
          { index: true, element: <WithBoundary name="Dashboard"><LazyAdminPage><AdminDashboard /></LazyAdminPage></WithBoundary> },
          { path: "orders", element: <WithBoundary name="Pedidos"><LazyAdminPage><AdminOrders /></LazyAdminPage></WithBoundary> },
          { path: "kitchen", element: <WithBoundary name="Cozinha KDS"><LazyAdminPage><KitchenDashboard /></LazyAdminPage></WithBoundary> },
          { path: "checkin", element: <WithBoundary name="Check-in"><LazyAdminPage><AdminCheckin /></LazyAdminPage></WithBoundary> },
          { path: "waste", element: <WithBoundary name="Controle de Desperdício"><LazyAdminPage><WasteControl /></LazyAdminPage></WithBoundary> },

          // Management Group
          { path: "menu-planner", element: <WithBoundary name="Cardápio"><LazyAdminPage><AdminMenu /></LazyAdminPage></WithBoundary> },
          { path: "items", element: <WithBoundary name="Itens"><LazyAdminPage><AdminItems /></LazyAdminPage></WithBoundary> },
          { path: "reviews", element: <WithBoundary name="Avaliações"><LazyAdminPage><AdminReviews /></LazyAdminPage></WithBoundary> },
          { path: "reports", element: <WithBoundary name="Relatórios"><LazyAdminPage><AdminReports /></LazyAdminPage></WithBoundary> },
          { path: "checkin-report", element: <WithBoundary name="Relatório de Check-in"><LazyAdminPage><AdminCheckinReport /></LazyAdminPage></WithBoundary> },
          { path: "users", element: <WithBoundary name="Usuários & Permissões"><LazyAdminPage><AdminUsers /></LazyAdminPage></WithBoundary> },
          // permissions route → same component, opens the Permissions tab
          { path: "permissions", element: <WithBoundary name="Funções & Permissões"><LazyAdminPage><AdminUsers defaultTab="permissions" /></LazyAdminPage></WithBoundary> },

          // Admin/System Group
          { path: "banners", element: <WithBoundary name="Banners"><LazyAdminPage><AdminBanners /></LazyAdminPage></WithBoundary> },
          { path: "notifications", element: <WithBoundary name="Notificacoes Admin"><LazyAdminPage><AdminNotifications /></LazyAdminPage></WithBoundary> },
          { path: "settings", element: <WithBoundary name="Configuracoes"><LazyAdminPage><AdminSettings /></LazyAdminPage></WithBoundary> },
          { path: "logs", element: <WithBoundary name="Log de Auditoria"><LazyAdminPage><AdminLogs /></LazyAdminPage></WithBoundary> },
          { path: "recipe-suggestions", element: <WithBoundary name="Sugestões de Receita"><LazyAdminPage><AdminRecipes /></LazyAdminPage></WithBoundary> },
        ],
      },
      {
        path: "*",
        element: <Navigate to="/" replace />,
      },
    ],
  },
]);