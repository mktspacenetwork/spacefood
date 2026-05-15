import { useState } from "react";
import { useAuth } from "../context/Store";
import { Button } from "../components/ui/Button";
import { ArrowRight, User, Lock, Loader2, Mail, ChevronLeft, Check } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import Lottie from "lottie-react";
import foodAnimation from "../assets/food-animation.json";

type Mode = "login" | "register" | "forgot";

export function Login({ initialMode = "login" }: { initialMode?: Mode }) {
  const { login, loginWithGoogle, signup, forgotPassword } = useAuth();

  const [email, setEmail] = useState(() => {
    try {
      const raw = localStorage.getItem("spacefood_remember");
      if (raw) {
        const parsed = JSON.parse(raw);
        return parsed?.email ?? "";
      }
    } catch (_e) { /* ignore */ }
    return "";
  });
  const [password, setPassword] = useState(() => {
    try {
      const raw = localStorage.getItem("spacefood_remember");
      if (raw) {
        const parsed = JSON.parse(raw);
        return parsed?.password ?? "";
      }
    } catch (_e) { /* ignore */ }
    return "";
  });
  const [name, setName] = useState("");
  const [mode, setMode] = useState<Mode>(initialMode);
  const [isLoading, setIsLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => {
    try {
      return !!localStorage.getItem("spacefood_remember");
    } catch (_e) {
      return false;
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (mode === "forgot") {
      if (!email) { toast.error("Informe seu email."); return; }
      setIsLoading(true);
      try {
        await forgotPassword(email);
        setMode("login");
      } catch (_) {} finally { setIsLoading(false); }
      return;
    }

    if (!email || !password || (mode === "register" && !name)) {
      toast.error("Por favor, preencha todos os campos.");
      return;
    }
    setIsLoading(true);
    try {
      if (mode === "register") {
        await signup(email, password, name);
      } else {
        await login(email, password);
        if (rememberMe) {
          localStorage.setItem("spacefood_remember", JSON.stringify({ email, password }));
        } else {
          localStorage.removeItem("spacefood_remember");
        }
      }
    } catch (_) {} finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-orange-400 via-orange-500 to-orange-600 px-4 relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-white/10 rounded-full blur-[100px]" />
        <div className="absolute top-1/2 -left-40 w-80 h-80 bg-orange-300/20 rounded-full blur-[80px]" />
        <div className="absolute bottom-0 right-20 w-64 h-64 bg-white/5 rounded-full blur-[60px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-sm"
      >
        <div className="flex flex-col items-center gap-8 rounded-3xl border border-white/30 bg-white p-8 shadow-2xl md:p-10">
          {/* Logo / Branding */}
          <div className="flex flex-col items-center gap-4 text-center">
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring" }}
              className="flex h-20 w-20 items-center justify-center rounded-lg bg-orange-500 shadow-lg shadow-orange-500/30 rotate-3"
            >
              <Lottie animationData={foodAnimation} loop={false} style={{ height: 56, width: 56 }} />
            </motion.div>
            <div className="space-y-2">
              <h1 className="text-2xl tracking-tight font-[Space_Grotesk] text-gray-900">
                Space<span className="font-bold">Food</span>
              </h1>
              <p className="text-gray-500 text-sm font-medium">
                {mode === "register"
                  ? "Preencha seus dados para começar."
                  : mode === "forgot"
                  ? "Informe seu email para receber o link."
                  : "Acesse sua conta para continuar."}
              </p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
            <AnimatePresence mode="wait">
              {mode === "forgot" ? (
                <motion.div key="forgot" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Mail className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="email"
                      placeholder="Seu email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="block w-full rounded-2xl border border-gray-200 bg-gray-50 py-4 pl-12 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500/50 transition-all shadow-sm outline-none"
                      autoFocus
                    />
                  </div>
                </motion.div>
              ) : (
                <motion.div key="auth" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="space-y-4">
                  {mode === "register" && (
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <User className="h-5 w-5 text-gray-400" />
                      </div>
                      <input
                        type="text"
                        placeholder="Seu nome completo"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="block w-full rounded-2xl border border-gray-200 bg-gray-50 py-4 pl-12 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500/50 transition-all shadow-sm outline-none"
                        autoFocus
                      />
                    </div>
                  )}

                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Mail className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="email"
                      placeholder="Seu email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="block w-full rounded-2xl border border-gray-200 bg-gray-50 py-4 pl-12 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500/50 transition-all shadow-sm outline-none"
                      autoFocus={mode !== "register"}
                    />
                  </div>

                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Lock className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="password"
                      placeholder={mode === "register" ? "Crie uma senha (min 6 chars)" : "Sua senha"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="block w-full rounded-2xl border border-gray-200 bg-gray-50 py-4 pl-12 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500/50 transition-all shadow-sm outline-none"
                    />
                  </div>

                  {mode === "login" && (
                    <label className="flex items-center gap-2.5 cursor-pointer select-none group/check">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={rememberMe}
                        onClick={() => setRememberMe(!rememberMe)}
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all ${
                          rememberMe
                            ? "border-orange-500 bg-orange-500 text-white"
                            : "border-gray-300 bg-white group-hover/check:border-orange-400"
                        }`}
                      >
                        {rememberMe && <Check size={13} strokeWidth={3} />}
                      </button>
                      <span className="text-sm text-gray-500 group-hover/check:text-gray-700 transition-colors">
                        Lembrar senha
                      </span>
                    </label>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <Button
              type="submit"
              disabled={isLoading}
              className="group flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-orange-500 text-white px-4 shadow-lg shadow-orange-500/20 transition-all hover:scale-[1.02] hover:shadow-xl hover:bg-orange-600"
            >
              {isLoading ? (
                <Loader2 className="animate-spin" />
              ) : (
                <>
                  <span className="font-semibold text-base">
                    {mode === "register" ? "Cadastrar" : mode === "forgot" ? "Enviar Link" : "Entrar"}
                  </span>
                  <ArrowRight
                    size={18}
                    className="transition-transform group-hover:translate-x-1"
                  />
                </>
              )}
            </Button>

            {mode !== "forgot" && (
              <>
                <div className="relative flex py-1 items-center">
                  <div className="flex-grow border-t border-gray-200"></div>
                  <span className="flex-shrink-0 mx-4 text-gray-400 text-xs uppercase font-medium">Ou</span>
                  <div className="flex-grow border-t border-gray-200"></div>
                </div>
                
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => loginWithGoogle()}
                  className="w-full flex items-center justify-center gap-3 rounded-2xl border-gray-200 bg-white h-14 hover:bg-gray-50 text-gray-700 shadow-sm transition-all"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24">
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                  </svg>
                  <span className="font-semibold text-base">
                    {mode === "register" ? "Cadastrar com Google" : "Entrar com Google"}
                  </span>
                </Button>
              </>
            )}
          </form>

          <div className="flex flex-col items-center gap-2 text-center">
            {mode === "forgot" ? (
              <button
                onClick={() => setMode("login")}
                className="text-sm font-medium text-gray-500 hover:text-orange-500 transition-colors flex items-center gap-1"
              >
                <ChevronLeft size={14} /> Voltar ao login
              </button>
            ) : (
              <>
                <button
                  onClick={() => setMode(mode === "register" ? "login" : "register")}
                  className="text-sm font-medium text-gray-500 hover:text-orange-500 transition-colors"
                >
                  {mode === "register"
                    ? "Já tem uma conta? Faça login"
                    : "Não tem conta? Cadastre-se agora"}
                </button>
                {mode === "login" && (
                  <button
                    onClick={() => setMode("forgot")}
                    className="text-xs text-gray-400 hover:text-orange-500 transition-colors"
                  >
                    Esqueci minha senha
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}