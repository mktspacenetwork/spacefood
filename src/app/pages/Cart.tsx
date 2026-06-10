import { useNavigate } from "react-router";
import { Button } from "../components/ui/Button";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { Trash2, ChevronLeft, ArrowRight, CheckCircle, ShoppingBag, Minus, Plus, MapPin, Phone, ChevronDown, ChevronUp, Lightbulb, ClipboardList } from "lucide-react";
import { useAuth } from "../context/auth-context";
import { useCart } from "../context/cart-context";
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";
import { toast } from "sonner";
import Lottie from "lottie-react";
import fryingPanAnimation from "../assets/frying-pan.json";
import { hapticSuccess, hapticHeavy } from "../lib/haptics";

export function Cart() {
  const { user } = useAuth();
  const { items, removeFromCart, updateQuantity, clearCart, totalCalories, submitOrder, consumptionMode, setConsumptionMode, setSelectedUnit, isManualLog, editingOrderId } = useCart();
  const isEditing = !!editingOrderId;
  const navigate = useNavigate();
  const [isSuccess, setIsSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [orderPhase, setOrderPhase] = useState<'idle' | 'sending' | 'success'>('idle');
  
  // External order fields
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [isLocationOpen, setIsLocationOpen] = useState(false);

  const handleConfirm = async () => {
    if (consumptionMode === 'takeout_external') {
      if (!address || !phone) {
        toast.error("Para pedidos externos, informe endereço e telefone.");
        return;
      }
    }
    
    setLoading(true);
    setOrderPhase('sending');
    
    const success = await submitOrder(consumptionMode, address, phone, user?.name);
    
    if (success) {
      hapticSuccess();
      setOrderPhase('success');
      // Show success animation for 2 seconds before redirecting
      await new Promise(resolve => setTimeout(resolve, 2200));
      setLoading(false);
      setOrderPhase('idle');
      navigate("/");
    } else {
      setLoading(false);
      setOrderPhase('idle');
    }
  };

  if (items.length === 0 && !isSuccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] text-center px-6">
        <div className="mb-8 flex h-24 w-24 items-center justify-center rounded-full bg-accent text-muted-foreground">
          <ShoppingBag size={40} />
        </div>
        <h2 className="mb-3 text-2xl font-bold text-foreground">Sua sacola está vazia</h2>
        <p className="mb-10 max-w-xs text-muted-foreground">
          Adicione itens do cardápio para fazer seu pedido.
        </p>
        <Button onClick={() => navigate("/")} className="h-12 px-8 rounded-xl font-bold bg-primary hover:bg-primary/90">
          Ir para o Cardápio
        </Button>
      </div>
    );
  }

  return (
    <>
      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={`fixed inset-0 z-[100] flex flex-col items-center justify-center ${isManualLog ? "bg-blue-600" : "bg-orange-500"}`}
          >
            <AnimatePresence mode="wait">
              {orderPhase === 'sending' && (
                <motion.div
                  key="sending"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.2 } }}
                  className="flex flex-col items-center"
                >
                  {isManualLog ? (
                    <div className="w-24 h-24 rounded-full bg-white/20 flex items-center justify-center mb-4">
                      <ClipboardList size={48} className="text-white" />
                    </div>
                  ) : (
                    <div className="w-56 h-56 filter brightness-0 invert">
                      <Lottie animationData={fryingPanAnimation} loop={true} />
                    </div>
                  )}
                  <motion.p
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="text-xl font-bold mt-4 font-space-grotesk tracking-tight text-white"
                  >
                    {isManualLog ? "Salvando registro..." : "Enviando pedido para a cozinha..."}
                  </motion.p>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.6 }}
                    className="flex gap-1.5 mt-6"
                  >
                    {[0, 1, 2].map((i) => (
                      <motion.div
                        key={i}
                        className="w-2.5 h-2.5 rounded-full bg-white/80"
                        animate={{ scale: [1, 1.4, 1], opacity: [0.5, 1, 0.5] }}
                        transition={{ repeat: Infinity, duration: 1, delay: i * 0.2 }}
                      />
                    ))}
                  </motion.div>
                </motion.div>
              )}
              {orderPhase === 'success' && (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: "spring", stiffness: 200, damping: 15 }}
                  className="flex flex-col items-center"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 300, damping: 15, delay: 0.1 }}
                    className="w-24 h-24 rounded-full bg-white/20 flex items-center justify-center mb-6 backdrop-blur-sm"
                  >
                    <CheckCircle size={56} className="text-white" strokeWidth={2.5} />
                  </motion.div>
                  <motion.h2
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 }}
                    className="text-2xl font-bold font-space-grotesk tracking-tight text-white"
                  >
                    {isManualLog ? "Refeição Registrada!" : "Pedido Enviado!"}
                  </motion.h2>
                  <motion.p
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="text-white/80 mt-2 text-sm font-medium"
                  >
                    {isManualLog ? "Seu consumo foi salvo no perfil 📋" : "Seu almoço está garantido 🎉"}
                  </motion.p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mx-auto max-w-2xl pb-32 md:pb-12 pt-2 px-4">
          <div className="mb-4 flex items-center gap-3">
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => navigate(-1)}>
              <ChevronLeft size={20} />
            </Button>
            <h1 className="text-xl font-bold text-foreground">
              {isManualLog ? "Registrar Refeição" : "Revisar Pedido"}
            </h1>
          </div>

          <div className="flex flex-col gap-4">
            {/* Compact Items List */}
            <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-accent/30 flex items-center justify-between">
                <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                  {isManualLog
                    ? <ClipboardList size={14} className="text-blue-600" />
                    : <ShoppingBag size={14} className="text-primary" />
                  }
                  {isManualLog ? "O que você comeu" : "Itens"} ({items.length})
                </h3>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={clearCart} 
                  className="text-muted-foreground hover:text-destructive text-[10px] h-6 px-2"
                >
                  Limpar
                </Button>
              </div>
              <ul className="divide-y divide-border">
                <AnimatePresence mode="popLayout">
                  {items.map((item) => (
                    <motion.li
                      key={item.id}
                      layout
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="bg-card"
                    >
                      <div className="flex items-center gap-3 p-3">
                        <img
                          src={item.image}
                          alt={item.name}
                          className="h-12 w-12 rounded-lg object-cover bg-muted flex-shrink-0 shadow-sm"
                        />
                      
                        <div className="flex flex-col flex-1 min-w-0">
                          <span className="font-bold text-sm text-foreground truncate">{item.name}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {item.calories} kcal / {item.unit}
                          </span>
                        </div>
                      
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1 bg-accent rounded-lg p-0.5">
                            <button 
                              onClick={() => item.quantity === 1 ? removeFromCart(item.id) : updateQuantity(item.id, -1)}
                              className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-background shadow-sm transition-all text-foreground"
                            >
                              {item.quantity === 1 ? <Trash2 size={12} className="text-destructive" /> : <Minus size={12} />}
                            </button>
                            <span className="text-xs font-bold w-6 text-center tabular-nums text-foreground">{item.quantity}</span>
                            <button 
                              onClick={() => updateQuantity(item.id, 1)} 
                              disabled={item.quantity >= item.limit}
                              className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-background shadow-sm transition-all text-foreground disabled:opacity-50"
                            >
                              <Plus size={12} />
                            </button>
                          </div>
                          <div className="text-right min-w-[50px]">
                            <span className="block font-bold text-sm text-foreground tabular-nums">
                              {item.calories * item.quantity} <span className="text-[10px] font-normal text-muted-foreground">kcal</span>
                            </span>
                          </div>
                        </div>
                      </div>
                      {/* tip removed from individual items – shown only in summary */}
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </div>

            {/* Consumption Mode & Summary Combined */}
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Consumption Mode — hidden for manual log (Taipas); info card shown instead */}
              {!isManualLog ? (
                <div className="rounded-2xl border border-border bg-card p-4 shadow-sm transition-all duration-300">
                  <div className="w-full flex items-center justify-between group">
                    <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                      <MapPin size={14} className="text-primary" />
                      Local de Consumo
                    </h3>
                    <div className="flex items-center gap-2 bg-primary/5 px-2 py-1.5 rounded-lg border border-primary/10">
                      <span className="text-xs font-semibold text-primary">
                        {consumptionMode === 'dine_in_damasceno' && 'Sede Damasceno'}
                        {consumptionMode === 'dine_in_taipas' && 'Sede Taipas'}
                        {consumptionMode === 'takeout_external' && 'Externo (Marmita)'}
                      </span>
                    </div>
                  </div>

                  {/* External Order Details */}
                  <AnimatePresence>
                    {consumptionMode === 'takeout_external' && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-3 space-y-2 overflow-hidden border-t border-dashed pt-3"
                      >
                        <input
                          type="text"
                          value={address}
                          onChange={(e) => setAddress(e.target.value)}
                          placeholder="Endereço (Ex: Bloco C)"
                          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-xs focus:ring-1 focus:ring-primary outline-none transition-all"
                        />
                        <input
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="Telefone (WhatsApp)"
                          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-xs focus:ring-1 focus:ring-primary outline-none transition-all"
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                /* Manual log info card for Taipas */
                <div className="rounded-2xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 p-4 shadow-sm flex flex-col justify-center gap-2">
                  <div className="flex items-center gap-2">
                    <ClipboardList size={14} className="text-blue-600 dark:text-blue-400 shrink-0" />
                    <h3 className="font-bold text-sm text-blue-900 dark:text-blue-100">Diário Alimentar</h3>
                  </div>
                  <p className="text-xs text-blue-700/80 dark:text-blue-300/70 leading-relaxed">
                    Seu consumo será registrado no perfil para acompanhamento de calorias e macros. Nenhum pedido será enviado à cozinha.
                  </p>
                </div>
              )}

              {/* Summary Compact */}
              <div className="rounded-2xl border border-border bg-card p-4 shadow-sm flex flex-col justify-between">
                <div className="space-y-2">
                  <h3 className="font-bold text-sm text-foreground mb-2">Resumo</h3>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Itens</span>
                    <span>{items.length}</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Calorias</span>
                    <span>{totalCalories} kcal</span>
                  </div>
                  {items.some(i => i.protein) && (
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Proteínas</span>
                      <span>{items.reduce((acc, item) => acc + (item.protein || 0) * item.quantity, 0).toFixed(0)}g</span>
                    </div>
                  )}
                  {items.some(i => i.carbs) && (
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Carboidratos</span>
                      <span>{items.reduce((acc, item) => acc + (item.carbs || 0) * item.quantity, 0).toFixed(0)}g</span>
                    </div>
                  )}
                  {items.some(i => i.fat) && (
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Gorduras</span>
                      <span>{items.reduce((acc, item) => acc + (item.fat || 0) * item.quantity, 0).toFixed(0)}g</span>
                    </div>
                  )}
                  <div className="h-px bg-border border-dashed my-1" />
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-foreground">Total</span>
                    <span className="text-base font-bold text-primary">{totalCalories} <span className="text-[10px] font-normal text-muted-foreground">kcal</span></span>
                  </div>
                  <p className="text-[10px] text-muted-foreground/70 leading-tight italic">
                    * Valores nutricionais sao estimativas baseadas em medidas padrao e podem variar conforme o preparo.
                  </p>

                  {/* Tips from selected items */}
                  {items.some(i => i.tip) && (
                    <>
                      <div className="h-px bg-border border-dashed my-1" />
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                          <Lightbulb size={10} /> Dicas
                        </span>
                        {items.filter(i => i.tip).map(item => (
                          <p key={item.id} className="text-[10px] text-muted-foreground leading-tight">
                            <span className="font-medium text-foreground">{item.name}:</span> {item.tip}
                          </p>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                <Button
                  onClick={() => setConfirmOpen(true)}
                  disabled={loading}
                  size="sm"
                  className={`w-full mt-4 h-10 text-sm font-bold rounded-xl shadow-lg ${isManualLog ? "bg-blue-600 hover:bg-blue-700 shadow-blue-500/20" : "shadow-primary/20"}`}
                >
                  {loading
                    ? (isManualLog ? "Salvando..." : isEditing ? "Salvando..." : "Enviando...")
                    : (isManualLog ? "Salvar Registro" : isEditing ? "Salvar Alterações" : "Confirmar Pedido")
                  }
                  {!loading && <ArrowRight size={16} className="ml-2" />}
                </Button>
              </div>
            </div>
          </div>

          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title={isManualLog ? "Salvar Registro?" : "Confirmar Pedido?"}
            description={isManualLog
              ? `Seu consumo de ${items.length} item(ns) (${totalCalories} kcal) será salvo no perfil para acompanhamento nutricional.`
              : `Você está prestes a confirmar ${items.length} item(ns) totalizando ${totalCalories} kcal.`
            }
            confirmLabel={isManualLog ? "Sim, Registrar" : "Sim, Confirmar"}
            cancelLabel="Voltar"
            onConfirm={() => {
              setConfirmOpen(false);
              handleConfirm();
            }}
          />
      </div>
    </>
  );
}