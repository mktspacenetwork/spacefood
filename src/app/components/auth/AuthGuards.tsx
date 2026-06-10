import React, { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { useAuth } from "../../context/auth-context";
import { AppLayout } from "../layout/AppLayout";
import { Login } from "../../pages/Login";
import { Loader2, ShieldCheck, LogOut, Home } from "lucide-react";
import { Button } from "../ui/Button";
import { api } from "../../lib/api";
import { supabase } from "../../lib/supabase";
import { toast } from "sonner";
import Lottie from "lottie-react";
import noPermissionAnimation from "../../assets/no-permission-animation.json";

function FullScreenLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground font-medium">Carregando...</span>
      </div>
    </div>
  );
}

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  
  if (isLoading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace />;

  if (!user.onboardingCompleted && location.pathname !== '/complete-profile') {
    return <Navigate to="/complete-profile" replace />;
  }

  if (location.pathname === '/complete-profile') {
     return <>{children}</>;
  }

  return <AppLayout>{children}</AppLayout>;
}

export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading, logout } = useAuth();
  const [promoting, setPromoting] = useState(false);
  
  if (isLoading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace />;
  
  if (user.role !== 'admin' && user.role !== 'kitchen' && user.role !== 'master') {
    return <AccessDeniedScreen user={user} promoting={promoting} onPromote={async () => {
      setPromoting(true);
      try {
        const result = await api.authPost("/setup-admin", {});
        // Pull a fresh JWT so the updated `role` in user_metadata is applied
        // right away. This triggers onAuthStateChange → mapUser, which updates
        // the auth context and re-renders this guard with the new role — no
        // manual logout/login required.
        await supabase.auth.refreshSession();
        toast.success(result.message || "Você agora é administrador!");
      } catch (e: any) {
        toast.error(e.message || "Erro ao promover");
      } finally {
        setPromoting(false);
      }
    }} onLogout={async () => {
      await logout();
    }} />;
  }
  
  return <>{children}</>;
}

function AccessDeniedScreen({ user, promoting, onPromote, onLogout }: {
  user: { name: string; email: string; role: string };
  promoting: boolean;
  onPromote: () => void;
  onLogout: () => void;
}) {
  const navigate = useNavigate();

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <div className="max-w-sm w-full text-center space-y-5">
        {/* Lottie Animation */}
        <div className="mx-auto w-40 h-40">
          <Lottie animationData={noPermissionAnimation} loop className="w-full h-full" />
        </div>
        
        <div className="space-y-2">
          <h1 className="text-xl font-bold text-foreground">
            Ops! Você não tem permissão para acessar essa área.
          </h1>
          <p className="text-sm text-muted-foreground">
            Sua conta (<strong className="text-foreground">{user.email}</strong>) possui o papel <strong className="text-foreground">"{user.role}"</strong>. Apenas administradores podem acessar este painel.
          </p>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 text-left space-y-2">
          <p className="text-sm font-medium text-foreground flex items-center gap-2">
            <ShieldCheck size={16} className="text-primary" />
            Configuração Inicial
          </p>
          <p className="text-xs text-muted-foreground">
            Se nenhum admin existe ainda, clique abaixo para se promover. O acesso é aplicado <strong>automaticamente</strong>.
          </p>
        </div>
        
        <div className="space-y-3 pt-1">
          <Button 
            onClick={onPromote} 
            disabled={promoting}
            className="w-full h-11 gap-2 text-sm font-bold"
          >
            {promoting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <ShieldCheck size={16} />
            )}
            Tornar-me Administrador
          </Button>
          
          <Button 
            variant="outline"
            onClick={onLogout}
            className="w-full h-10 gap-2 text-sm"
          >
            <LogOut size={14} />
            Sair e Fazer Login Novamente
          </Button>

          <button
            onClick={() => navigate("/")}
            className="w-full flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
          >
            <Home size={14} />
            Voltar para o início
          </button>
        </div>
      </div>
    </div>
  );
}

export function LoginWrapper() {
  const { user, isLoading } = useAuth();
  
  if (isLoading) return <FullScreenLoader />;
  if (user) return <Navigate to="/" replace />;
  return <Login />;
}

export function SignupWrapper() {
  const { user, isLoading } = useAuth();
  
  if (isLoading) return <FullScreenLoader />;
  if (user) return <Navigate to="/" replace />;
  return <Login initialMode="register" />;
}