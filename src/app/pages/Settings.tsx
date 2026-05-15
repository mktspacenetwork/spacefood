import { useState, useRef, useEffect } from "react";
import { useAuth } from "../context/auth-context";
import { useNavigate } from "react-router";
import { Button } from "../components/ui/Button";
import { useTheme } from "next-themes";
import { Camera, User as UserIcon, LogOut, Sun, Moon, ChevronRight, Check, Loader2, ArrowLeft, Building2, Phone, Upload, ImagePlus, Bell, BellOff, BellRing, MapPin, ChevronDown, AlertTriangle, RotateCcw } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { compressImage } from "../lib/image-compress";
import { formatPhone, unformatPhone } from "../lib/utils";
import { usePWA } from "../lib/usePWA";
import { api } from "../lib/api";

export function Settings() {
  const { user, logout, updateUserProfile, uploadAvatar } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editName, setEditName] = useState(user?.name || "");
  const [editDepartment, setEditDepartment] = useState(user?.department || "");
  const [editPhone, setEditPhone] = useState(formatPhone(user?.phone || ""));
  const [editAvatar, setEditAvatar] = useState(user?.avatar || "");
  const [editLunchLocation, setEditLunchLocation] = useState(user?.lunchLocation || "");
  const [editDietaryRestrictions, setEditDietaryRestrictions] = useState(user?.dietaryRestrictions || "");
  const [availableUnits, setAvailableUnits] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const { pushPermission, subscribeToPush } = usePWA();
  const [pushLoading, setPushLoading] = useState(false);

  // Fetch available company units from admin settings
  useEffect(() => {
    api.get("/admin/settings")
      .then((settings) => {
        const rawUnits = settings?.units;
        if (Array.isArray(rawUnits) && rawUnits.length > 0) {
          if (typeof rawUnits[0] === "string") {
            setAvailableUnits(rawUnits as string[]);
          } else {
            setAvailableUnits((rawUnits as { name: string }[]).map((u) => u.name));
          }
        } else {
          // Fallback to defaults
          setAvailableUnits(["Sede Damasceno", "Sede Taipas", "Externo (Marmita)"]);
        }
      })
      .catch(() => {
        setAvailableUnits(["Sede Damasceno", "Sede Taipas", "Externo (Marmita)"]);
      });
  }, []);

  const hasChanges =
    editName !== (user?.name || "") ||
    editDepartment !== (user?.department || "") ||
    unformatPhone(editPhone) !== (user?.phone || "") ||
    editAvatar !== (user?.avatar || "") ||
    editLunchLocation !== (user?.lunchLocation || "") ||
    editDietaryRestrictions !== (user?.dietaryRestrictions || "");

  const handleSave = async () => {
    if (!hasChanges) return;
    setIsSaving(true);
    try {
      await updateUserProfile(editName, editAvatar, editDepartment, unformatPhone(editPhone), editLunchLocation, editDietaryRestrictions);
    } catch (_) {
      // toast handled in context
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Use JPEG, PNG, WebP ou GIF.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Arquivo muito grande. Máximo 10MB.");
      return;
    }

    // Show preview immediately
    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);

    setIsUploading(true);
    try {
      // Compress image before uploading (resizes to 512px, converts to WebP)
      const compressed = await compressImage(file, {
        maxSize: 512,
        quality: 0.8,
        outputType: "image/webp",
      });
      toast.info(
        `Imagem otimizada: ${(file.size / 1024).toFixed(0)}KB → ${(compressed.size / 1024).toFixed(0)}KB`
      );

      const url = await uploadAvatar(compressed);
      setEditAvatar(url);
      setPreviewUrl(null);
    } catch (err: any) {
      console.error("Avatar upload/compress error:", err);
      setPreviewUrl(null);
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleLogout = async () => {
    await logout();
  };

  if (!user) return null;

  const themeOptions = [
    { value: "light", label: "Claro", icon: Sun },
    { value: "dark", label: "Escuro", icon: Moon },
  ];

  const displayAvatar = previewUrl || editAvatar;

  return (
    <div className="max-w-lg mx-auto space-y-6 pb-32 md:pb-12 pt-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-foreground hover:bg-accent/80 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
      </div>

      {/* Profile Section */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-3xl border border-border bg-card p-6 shadow-sm"
      >
        <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-5">Perfil</h2>

        {/* Avatar with Upload */}
        <div className="flex flex-col items-center gap-3 mb-6">
          <div className="relative group">
            <img
              src={displayAvatar}
              alt={editName}
              className="h-24 w-24 rounded-full border-4 border-primary/20 object-cover shadow-lg"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            >
              {isUploading ? (
                <Loader2 size={24} className="text-white animate-spin" />
              ) : (
                <Camera size={24} className="text-white" />
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
          <span className="text-sm text-muted-foreground font-medium">{user.email}</span>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex items-center gap-2 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
          >
            <ImagePlus size={14} />
            {isUploading ? "Enviando..." : "Alterar foto"}
          </button>
        </div>

        {/* Form Fields */}
        <div className="space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground">Nome</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <UserIcon className="h-4 w-4 text-muted-foreground" />
              </div>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="block w-full rounded-2xl border border-border bg-background py-3.5 pl-11 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all outline-none"
                placeholder="Seu nome completo"
              />
            </div>
          </div>

          {/* Department */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground">Departamento</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Building2 className="h-4 w-4 text-muted-foreground" />
              </div>
              <input
                type="text"
                value={editDepartment}
                onChange={(e) => setEditDepartment(e.target.value)}
                className="block w-full rounded-2xl border border-border bg-background py-3.5 pl-11 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all outline-none"
                placeholder="Ex: TI, RH, Financeiro"
              />
            </div>
          </div>

          {/* Phone */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground">Telefone</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Phone className="h-4 w-4 text-muted-foreground" />
              </div>
              <input
                type="tel"
                value={editPhone}
                onChange={(e) => setEditPhone(formatPhone(e.target.value))}
                className="block w-full rounded-2xl border border-border bg-background py-3.5 pl-11 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all outline-none"
                placeholder="(11) 99999-9999"
                maxLength={16}
              />
            </div>
          </div>

          {/* Lunch Location */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground">Unidade de Almoco</label>
            <p className="text-xs text-muted-foreground -mt-1">
              A sede onde voce realiza o almoco. Determina as opcoes de pedido disponiveis para voce.
            </p>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <MapPin className="h-4 w-4 text-muted-foreground" />
              </div>
              <select
                value={editLunchLocation}
                onChange={(e) => setEditLunchLocation(e.target.value)}
                className="block w-full rounded-2xl border border-border bg-background py-3.5 pl-11 pr-10 text-sm text-foreground focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all outline-none appearance-none cursor-pointer"
              >
                <option value="">Selecione sua unidade...</option>
                {availableUnits.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
            {editLunchLocation && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/5 border border-primary/20"
              >
                <MapPin size={13} className="text-primary shrink-0" />
                <span className="text-xs font-medium text-primary">{editLunchLocation}</span>
              </motion.div>
            )}
          </div>

          {/* Dietary Restrictions */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground">Restrições Alimentares</label>
            <p className="text-xs text-muted-foreground -mt-1">
              Ex: Intolerância a Lactose, Alergia a Frutos do Mar, Sem Glúten, etc.
            </p>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              </div>
              <input
                type="text"
                value={editDietaryRestrictions}
                onChange={(e) => setEditDietaryRestrictions(e.target.value)}
                className="block w-full rounded-2xl border border-border bg-background py-3.5 pl-11 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all outline-none"
                placeholder="Ex: Vegetariano, Sem glúten"
              />
            </div>
          </div>

          {/* Save Button */}
          <AnimatePresence>
            {hasChanges && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
              >
                <Button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="w-full rounded-2xl h-12 bg-primary text-primary-foreground gap-2 shadow-md shadow-primary/20 hover:bg-primary/90"
                >
                  {isSaving ? (
                    <Loader2 className="animate-spin" size={18} />
                  ) : (
                    <Check size={18} />
                  )}
                  Salvar Alterações
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Appearance Section */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="rounded-3xl border border-border bg-card p-6 shadow-sm"
      >
        <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">Aparência</h2>
        <div className="grid grid-cols-2 gap-3">
          {themeOptions.map((opt) => {
            const isActive = theme === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setTheme(opt.value)}
                className={`flex items-center gap-3 rounded-2xl border-2 p-4 transition-all ${
                  isActive
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border bg-background hover:border-primary/30"
                }`}
              >
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                  isActive ? "bg-primary text-primary-foreground" : "bg-accent text-muted-foreground"
                }`}>
                  <opt.icon size={20} />
                </div>
                <div className="flex flex-col items-start">
                  <span className={`text-sm font-semibold ${isActive ? "text-primary" : "text-foreground"}`}>
                    {opt.label}
                  </span>
                </div>
                {isActive && <Check size={16} className="ml-auto text-primary" />}
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* Push Notifications Section */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.15 }}
        className="rounded-3xl border border-border bg-card p-6 shadow-sm"
      >
        <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">Notificações Push</h2>
        <div className="flex items-center gap-4">
          <div className={`flex h-12 w-12 items-center justify-center rounded-2xl transition-colors ${
            pushPermission === "granted" 
              ? "bg-green-500/10 text-green-500" 
              : pushPermission === "denied"
              ? "bg-red-500/10 text-red-500"
              : "bg-orange-500/10 text-orange-500"
          }`}>
            {pushPermission === "granted" ? (
              <BellRing size={22} />
            ) : pushPermission === "denied" ? (
              <BellOff size={22} />
            ) : (
              <Bell size={22} />
            )}
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">
              {pushPermission === "granted" 
                ? "Notificações ativas" 
                : pushPermission === "denied" 
                ? "Notificações bloqueadas" 
                : "Receber alertas de pedido"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {pushPermission === "granted"
                ? "Você receberá alertas quando seu pedido estiver pronto."
                : pushPermission === "denied"
                ? "Desbloqueie nas configurações do navegador."
                : "Seja notificado quando seu pedido mudar de status."}
            </p>
          </div>
          {pushPermission !== "granted" && pushPermission !== "denied" && (
            <button
              onClick={async () => {
                setPushLoading(true);
                try {
                  const ok = await subscribeToPush();
                  if (ok) {
                    toast.success("Notificações push ativadas!");
                  } else {
                    toast.error("Não foi possível ativar as notificações.");
                  }
                } catch (err) {
                  toast.error("Erro ao ativar notificações.");
                } finally {
                  setPushLoading(false);
                }
              }}
              disabled={pushLoading}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold shadow-md shadow-primary/20 hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {pushLoading ? <Loader2 size={16} className="animate-spin" /> : <Bell size={16} />}
              Ativar
            </button>
          )}
          {pushPermission === "granted" && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/10 text-green-600 text-xs font-bold">
              <Check size={14} />
              Ativo
            </div>
          )}
        </div>
      </motion.div>

      {/* General Section */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.18 }}
        className="rounded-3xl border border-border bg-card p-6 shadow-sm"
      >
        <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">Geral</h2>
        <button
          onClick={() => {
            localStorage.removeItem("spacefood_onboarding_done");
            toast.success("Tutorial reativado! Volte ao cardapio para reve-lo.");
            navigate("/");
          }}
          className="w-full flex items-center gap-4 rounded-2xl border border-border bg-background p-4 transition-all hover:bg-accent group"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
            <RotateCcw size={20} />
          </div>
          <div className="flex flex-col items-start flex-1 min-w-0">
            <span className="text-sm font-semibold text-foreground">Rever tutorial</span>
            <span className="text-xs text-muted-foreground">Reexibir o guia de como usar o app</span>
          </div>
          <ChevronRight size={18} className="text-muted-foreground shrink-0" />
        </button>
      </motion.div>

      {/* Logout Section */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
      >
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-4 rounded-3xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 p-5 transition-all hover:bg-red-100 dark:hover:bg-red-950/40 group"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 text-red-500 group-hover:bg-red-500/20 transition-colors">
            <LogOut size={20} />
          </div>
          <div className="flex flex-col items-start">
            <span className="text-sm font-bold text-red-600 dark:text-red-400">Sair da conta</span>
            <span className="text-xs text-red-400 dark:text-red-500">{user.email}</span>
          </div>
          <ChevronRight size={18} className="ml-auto text-red-300 dark:text-red-700" />
        </button>
      </motion.div>
    </div>
  );
}