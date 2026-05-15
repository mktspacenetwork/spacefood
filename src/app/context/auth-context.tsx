import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { toast } from "sonner";
import { User } from "../types";
import { supabase } from "../lib/supabase";
import { api } from "../lib/api";

export { supabase };

interface AuthContextType {
  user: User | null;
  login: (email: string, password?: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  updateUserProfile: (name?: string, avatar?: string, department?: string, phone?: string, lunchLocation?: string, dietaryRestrictions?: string) => Promise<void>;
  uploadAvatar: (file: File) => Promise<string>;
  submitRating: (orderId: string, stars: number, comment?: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        mapUser(session.user);
      } else {
        setIsLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        mapUser(session.user);
      } else {
        setUser(null);
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const mapUser = async (authUser: any) => {
    // Auto-fix typo in lunch_location: "Damaceno" → "Damasceno"
    if (authUser.user_metadata?.lunch_location === "Sede Damaceno") {
      try {
        await supabase.auth.updateUser({
          data: {
            ...authUser.user_metadata,
            lunch_location: "Sede Damasceno"
          }
        });
        console.log("Auto-corrected lunch_location typo");
      } catch (e) {
        console.warn("Failed to auto-correct lunch_location:", e);
      }
    }

    const userData: User = {
      id: authUser.id,
      name: authUser.user_metadata?.name || authUser.email?.split('@')[0] || "Usuário",
      email: authUser.email || "",
      avatar: authUser.user_metadata?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(authUser.user_metadata?.name || "U")}&background=random`,
      role: authUser.user_metadata?.role || "user",
      department: authUser.user_metadata?.department || "",
      phone: authUser.user_metadata?.phone || "",
      onboardingCompleted: authUser.user_metadata?.onboarding_completed === true,
      lunchLocation: authUser.user_metadata?.lunch_location || "",
      dietaryRestrictions: authUser.user_metadata?.dietary_restrictions || "",
    };
    setUser(userData);
    setIsLoading(false);
  };

  const login = async (email: string, password?: string) => {
    if (!password) {
      toast.error("Senha obrigatória");
      return;
    }
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("Login realizado com sucesso!");
    } catch (error: any) {
      console.error("Login error:", error);
      toast.error(error.message || "Erro ao realizar login");
      throw error;
    }
  };

  const loginWithGoogle = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin
        }
      });
      if (error) throw error;
    } catch (error: any) {
      console.error("Google login error:", error);
      toast.error(error.message || "Erro ao realizar login com Google");
      throw error;
    }
  };

  const signup = async (email: string, password: string, name: string) => {
    try {
      await api.post("/signup", { email, password, name });
      toast.success("Conta criada com sucesso! Fazendo login...");
      await login(email, password);
    } catch (error: any) {
      console.error("Signup error:", error);
      toast.error(error.message || "Erro ao criar conta");
      throw error;
    }
  };

  const forgotPassword = async (email: string) => {
    try {
      await api.post("/forgot-password", { email });
      toast.success("Email de recuperação enviado! Verifique sua caixa de entrada.");
    } catch (error: any) {
      console.error("Forgot password error:", error);
      toast.error(error.message || "Erro ao enviar email de recuperação");
      throw error;
    }
  };

  const logout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setUser(null);
      localStorage.removeItem("space-food-cart");
      toast.info("Você saiu do sistema.");
    } catch (error: any) {
      toast.error("Erro ao sair");
    }
  };

  const updateUserProfile = async (name?: string, avatar?: string, department?: string, phone?: string, lunchLocation?: string, dietaryRestrictions?: string) => {
    if (!user) return;
    try {
      await api.authPut("/users/me", { name, avatar, department, phone, lunchLocation, dietaryRestrictions });
      
      // Refresh the Supabase session so updated user_metadata is cached locally.
      // Without this, a page reload would show stale values (e.g. old lunchLocation).
      await supabase.auth.refreshSession();
      
      setUser(prev => prev ? ({
        ...prev,
        name: name || prev.name,
        avatar: avatar || prev.avatar,
        department: department !== undefined ? department : prev.department,
        phone: phone !== undefined ? phone : prev.phone,
        lunchLocation: lunchLocation !== undefined ? lunchLocation : prev.lunchLocation,
        dietaryRestrictions: dietaryRestrictions !== undefined ? dietaryRestrictions : prev.dietaryRestrictions,
      }) : null);
      toast.success("Perfil atualizado com sucesso!");
    } catch (error: any) {
      toast.error("Erro ao atualizar perfil");
      throw error;
    }
  };

  const uploadAvatar = async (file: File) => {
    if (!user) return "";
    try {
      const result = await api.upload("/users/me/avatar", file);
      if (result.avatarUrl) {
        setUser(prev => prev ? ({ ...prev, avatar: result.avatarUrl }) : null);
        toast.success("Foto de perfil atualizada!");
        return result.avatarUrl;
      }
      throw new Error("URL do avatar não retornada");
    } catch (error: any) {
      console.error("Avatar upload error:", error);
      toast.error(error.message || "Erro ao carregar foto");
      throw error;
    }
  };

  const submitRating = async (orderId: string, stars: number, comment?: string) => {
    try {
      await api.authPost("/ratings", { orderId, stars, comment });
      toast.success("Avaliação enviada! Obrigado pelo feedback.");
    } catch (e: any) {
      toast.error("Erro ao enviar avaliação.");
      throw e;
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, loginWithGoogle, signup, logout, forgotPassword, updateUserProfile, uploadAvatar, submitRating, isAuthenticated: !!user, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}