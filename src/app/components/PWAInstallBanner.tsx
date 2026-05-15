import { X, Download, Share, Plus } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { usePWA } from "../lib/usePWA";

export function PWAInstallBanner() {
  const {
    canInstall,
    showBanner,
    showIOSInstructions,
    setShowIOSInstructions,
    isIOS,
    installApp,
    dismissBanner,
  } = usePWA();

  if (!canInstall) return null;

  return (
    <>
      {/* Main Install Banner */}
      <AnimatePresence>
        {showBanner && !showIOSInstructions && (
          <motion.div
            initial={{ opacity: 0, y: 100, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 100, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 350, damping: 30 }}
            className="fixed bottom-20 md:bottom-6 left-3 right-3 md:left-auto md:right-6 md:max-w-sm z-[60]"
          >
            <div className="relative overflow-hidden rounded-2xl bg-card border border-border shadow-xl shadow-black/10">
              {/* Accent top bar */}
              <div className="h-1 w-full bg-gradient-to-r from-orange-500 via-red-500 to-orange-400" />

              <div className="p-4">
                {/* Close button */}
                <button
                  onClick={dismissBanner}
                  className="absolute top-3 right-3 h-7 w-7 flex items-center justify-center rounded-full bg-accent/80 hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Fechar"
                >
                  <X size={14} strokeWidth={2.5} />
                </button>

                <div className="flex items-start gap-3.5 pr-6">
                  {/* App Icon */}
                  <div className="flex-shrink-0 h-12 w-12 rounded-xl overflow-hidden shadow-lg shadow-orange-500/20">
                    <img src="/icon.svg" alt="SpaceFood" className="h-full w-full object-cover" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-foreground leading-tight">
                      Instale o SpaceFood
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      Acesse mais rápido direto da sua tela inicial
                    </p>
                  </div>
                </div>

                {/* Install Button */}
                <button
                  onClick={installApp}
                  className="w-full mt-3.5 flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-sm py-2.5 rounded-xl shadow-md shadow-primary/20 active:scale-[0.98] transition-all"
                >
                  <Download size={16} strokeWidth={2.5} />
                  Adicionar à Tela Inicial
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* iOS Instructions Sheet */}
      <AnimatePresence>
        {showIOSInstructions && (
          <motion.div
            key="ios-sheet"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70]"
          >
            {/* Backdrop */}
            <div
              onClick={() => {
                setShowIOSInstructions(false);
                dismissBanner();
              }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />

            {/* Bottom Sheet */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 350, damping: 35 }}
              className="absolute bottom-0 left-0 right-0 pb-safe"
            >
              <div className="bg-card rounded-t-3xl border-t border-border shadow-2xl mx-auto max-w-lg">
                {/* Handle */}
                <div className="flex justify-center pt-3 pb-1">
                  <div className="h-1 w-10 rounded-full bg-border" />
                </div>

                <div className="px-6 pb-8 pt-2">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="text-lg font-bold text-foreground">
                      Instalar SpaceFood
                    </h3>
                    <button
                      onClick={() => {
                        setShowIOSInstructions(false);
                        dismissBanner();
                      }}
                      className="h-8 w-8 flex items-center justify-center rounded-full bg-accent text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {/* Steps */}
                  <div className="space-y-4">
                    {/* Step 1 */}
                    <div className="flex items-start gap-3.5">
                      <div className="flex-shrink-0 h-10 w-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center border border-blue-100 dark:border-blue-800">
                        <Share size={18} className="text-blue-500" />
                      </div>
                      <div className="flex-1 pt-0.5">
                        <p className="text-sm font-semibold text-foreground">
                          1. Toque em <span className="text-blue-500">Compartilhar</span>
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          O ícone de compartilhamento na barra do Safari
                        </p>
                      </div>
                    </div>

                    {/* Divider */}
                    <div className="ml-5 h-4 border-l-2 border-dashed border-border" />

                    {/* Step 2 */}
                    <div className="flex items-start gap-3.5">
                      <div className="flex-shrink-0 h-10 w-10 rounded-xl bg-green-50 dark:bg-green-900/20 flex items-center justify-center border border-green-100 dark:border-green-800">
                        <Plus size={18} className="text-green-500" />
                      </div>
                      <div className="flex-1 pt-0.5">
                        <p className="text-sm font-semibold text-foreground">
                          2. Toque em <span className="text-green-600">"Adicionar à Tela de Início"</span>
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Role para baixo no menu e selecione a opção
                        </p>
                      </div>
                    </div>

                    {/* Divider */}
                    <div className="ml-5 h-4 border-l-2 border-dashed border-border" />

                    {/* Step 3 */}
                    <div className="flex items-start gap-3.5">
                      <div className="flex-shrink-0 h-10 w-10 rounded-xl overflow-hidden border border-orange-100 dark:border-orange-800">
                        <img src="/icon.svg" alt="SpaceFood" className="h-full w-full object-cover" />
                      </div>
                      <div className="flex-1 pt-0.5">
                        <p className="text-sm font-semibold text-foreground">
                          3. Confirme tocando em <span className="text-primary">"Adicionar"</span>
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Pronto! O SpaceFood ficará na sua tela inicial
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Done Button */}
                  <button
                    onClick={() => {
                      setShowIOSInstructions(false);
                      dismissBanner();
                    }}
                    className="w-full mt-6 flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-sm py-3 rounded-xl shadow-md shadow-primary/20 active:scale-[0.98] transition-all"
                  >
                    Entendi!
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}