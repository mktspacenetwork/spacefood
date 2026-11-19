import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { ChevronLeft, ChevronRight, X, Rocket, Sparkles, HelpCircle } from "lucide-react";
import { cn } from "../../lib/utils";
import { supabase } from "../../lib/supabase";
import { campaignsApi } from "../../lib/campaigns/api";
import type { ToursSeen } from "../../lib/campaigns/types";

/**
 * Tour guiada do módulo Campanhas (colaborador e admin).
 *
 * Reaproveita o padrão visual do tutorial do cardápio (sobreposição escura, destaque
 * com anel, cartão com progresso, teclado e deslize no celular), mas é um componente
 * novo e independente: o `OnboardingTutorial` existente NÃO é alterado.
 *
 * - Alvos: elementos com `data-tutorial="camp-..."` (prefixo `camp-` evita colisão).
 * - Passo cujo alvo não existe na tela é pulado; passo sem `selector` aparece centralizado.
 * - Nunca bloqueia o uso: "Pular" a qualquer momento; Esc fecha.
 * - Histórico por usuário: servidor (`/tours`, por pessoa) + localStorage como cache/plano B;
 *   chave por pessoa + tela + campanha + versão da tour (nada é compartilhado entre usuários).
 */

export type TourStep = {
  /** valor do atributo data-tutorial do alvo; sem valor = cartão centralizado, sem destaque */
  selector?: string;
  title: string;
  description: string;
  icon?: React.ReactNode;
  placement?: "top" | "bottom";
};

export type TourController = {
  open: boolean;
  /** abre a tour (botão "Ver tour") */
  start: () => void;
  /** a pessoa concluiu ou pulou: grava como vista */
  close: () => void;
  /** não havia o que mostrar (alvos ausentes): fecha sem gravar como vista */
  cancel: () => void;
};

type Rect = { top: number; left: number; width: number; height: number; bottom: number; right: number };

const PAD = 8;
const RADIUS = 14;

/** Chave estável: spacefood_camp_tour_{papel}_{usuário}_{campanha|global}_{tela}_v{versão} */
export function tourKey(
  role: "admin" | "collab",
  userId: string | undefined,
  screen: string,
  campaignId?: string,
  version = 1,
): string {
  return `spacefood_camp_tour_${role}_${userId ?? "anon"}_${campaignId ?? "global"}_${screen}_v${version}`;
}

// ───────── Histórico de tours vistas, por usuário ─────────
// Fonte de verdade: o servidor (`GET/POST /tours`, atrelado ao usuário logado pelo token — nunca compartilhado
// entre pessoas, e acompanha a pessoa em outro aparelho). O localStorage é cache e plano B: se o servidor
// não responder, a regra "abre uma vez" continua valendo neste aparelho.

let seenCache: { uid: string; set: Set<string> } | null = null;
let seenInflight: Promise<Set<string> | null> | null = null;
let seenFailedAt = 0;
const SEEN_TIMEOUT_MS = 3000;
const SEEN_RETRY_AFTER_MS = 60_000;

async function currentUid(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

/** Conjunto de chaves já vistas pelo usuário logado (null = servidor indisponível: vale só o localStorage). */
function getServerSeen(): Promise<Set<string> | null> {
  if (seenInflight) return seenInflight;
  seenInflight = (async () => {
    const uid = await currentUid();
    if (!uid) return null;
    if (seenCache && seenCache.uid === uid) return seenCache.set;
    if (Date.now() - seenFailedAt < SEEN_RETRY_AFTER_MS) return null;
    try {
      const res = await Promise.race([
        campaignsApi.get<ToursSeen>("/tours"),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), SEEN_TIMEOUT_MS)),
      ]);
      if (!res || !Array.isArray(res.seen)) { seenFailedAt = Date.now(); return null; }
      seenCache = { uid, set: new Set(res.seen) };
      return seenCache.set;
    } catch {
      seenFailedAt = Date.now();
      return null;
    }
  })().finally(() => { seenInflight = null; });
  return seenInflight;
}

/** Registra no servidor (sem bloquear a tela; falha de rede/rota não atrapalha: o localStorage já guardou). */
function markSeenRemote(key: string): void {
  void (async () => {
    const uid = await currentUid();
    if (!uid) return;
    if (seenCache?.uid === uid) {
      if (seenCache.set.has(key)) return;
      seenCache.set.add(key);
    }
    try { await campaignsApi.post("/tours", { key }); } catch { /* o localStorage segura */ }
  })();
}

function readLocalSeen(key: string): boolean {
  try { return localStorage.getItem(key) === "1"; } catch { return false; /* storage indisponível: trata como não vista */ }
}
function writeLocalSeen(key: string): void {
  try { localStorage.setItem(key, "1"); } catch { /* ignora */ }
}

/**
 * Controla a abertura. Abre sozinha UMA vez por usuário (se `enabled` e ainda não vista),
 * depois de um pequeno atraso, e nunca por cima de um diálogo aberto.
 * "Ver tour" (`start`) sempre reabre, sem alterar o histórico.
 */
export function useTour({ storageKey, enabled, delay = 1100 }: { storageKey: string; enabled: boolean; delay?: number }): TourController {
  const [open, setOpen] = useState(false);
  // true quando a abertura automática já gravou "vista" e o cartão ainda não foi de fato exibido
  const autoMarked = useRef(false);

  useEffect(() => {
    if (!enabled || !storageKey) return;
    if (readLocalSeen(storageKey)) return;
    let alive = true;
    let openTimer: ReturnType<typeof setTimeout> | undefined;
    let remoteTimer: ReturnType<typeof setTimeout> | undefined;
    void (async () => {
      const server = await getServerSeen();
      if (!alive) return;
      // Já vista em outro aparelho: sincroniza o cache local e não abre.
      if (server?.has(storageKey)) { writeLocalSeen(storageKey); return; }
      openTimer = setTimeout(() => {
        if (!alive) return;
        if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
        // Regra única para todos os perfis: mostrou uma vez, não volta a abrir sozinha.
        // Grava ao ABRIR (não só ao fechar), para não reaparecer se a pessoa sair da tela no meio.
        writeLocalSeen(storageKey);
        autoMarked.current = true;
        setOpen(true);
        // No servidor só depois de confirmar que o cartão realmente apareceu (se não havia alvo, `cancel` desfaz).
        remoteTimer = setTimeout(() => { if (autoMarked.current) markSeenRemote(storageKey); }, 900);
      }, delay);
    })();
    return () => {
      alive = false;
      clearTimeout(openTimer);
      clearTimeout(remoteTimer);
      // Saiu da tela com a tour aberta automaticamente: ela foi exibida, então entra no histórico.
      if (autoMarked.current) markSeenRemote(storageKey);
    };
  }, [storageKey, enabled, delay]);

  const start = useCallback(() => { autoMarked.current = false; setOpen(true); }, []);
  const close = useCallback(() => {
    autoMarked.current = false;
    writeLocalSeen(storageKey);
    markSeenRemote(storageKey);
    setOpen(false);
  }, [storageKey]);
  // Não havia o que mostrar (alvos ausentes): desfaz a marcação automática para tentar na próxima visita.
  const cancel = useCallback(() => {
    if (autoMarked.current) {
      try { localStorage.removeItem(storageKey); } catch { /* ignora */ }
      autoMarked.current = false;
    }
    setOpen(false);
  }, [storageKey]);
  return { open, start, close, cancel };
}

/** Primeiro elemento VISÍVEL com o seletor (o mesmo alvo pode existir no menu lateral e na barra do celular). */
function findTarget(selector: string): Element | null {
  const all = document.querySelectorAll(`[data-tutorial="${selector}"]`);
  for (const el of Array.from(all)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

function getRect(selector: string): Rect | null {
  const el = findTarget(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom, right: r.right };
}

function tooltipPosition(rect: Rect, placement: "top" | "bottom" | undefined, vw: number, vh: number): React.CSSProperties {
  const W = Math.min(320, vw - 32);
  const GAP = 16;
  const below = vh - rect.bottom - PAD;
  const above = rect.top - PAD;
  const where = placement === "top" && above > 220 ? "top" : below > 220 ? "bottom" : above > below ? "top" : "bottom";
  let left = Math.max(16, rect.left - PAD);
  if (left + W > vw - 16) left = Math.max(16, vw - 16 - W);
  return where === "top"
    ? { position: "fixed", bottom: vh - (rect.top - PAD - GAP), left, width: W, zIndex: 10002 }
    : { position: "fixed", top: rect.bottom + PAD + GAP, left, width: W, zIndex: 10002 };
}

export function CampaignTour({ steps, tour }: { steps: TourStep[]; tour: TourController }) {
  const { open, close, cancel } = tour;
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const [active, setActive] = useState<TourStep[]>([]);
  const [rect, setRect] = useState<Rect | null>(null);
  const [view, setView] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const touchX = useRef<number | null>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const reduce = useMemo(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false, []);

  // Ao abrir: mantém só os passos cujo alvo existe (ou que são centralizados).
  useEffect(() => {
    if (!open) return;
    const visible = steps.filter((s) => !s.selector || getRect(s.selector) !== null);
    if (visible.length === 0) { cancel(); return; }
    setActive(visible);
    setIndex(0);
    setDirection(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  useEffect(() => {
    const onResize = () => setView({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const step = active[index];

  // Mede o alvo a cada passo, rolagem ou redimensionamento.
  useEffect(() => {
    if (!open || !step) return;
    let raf = 0;
    const measure = () => setRect(step.selector ? getRect(step.selector) : null);
    if (step.selector) {
      findTarget(step.selector)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    }
    const t = setTimeout(measure, 120);
    const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      clearTimeout(t);
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, step, reduce]);

  useEffect(() => { if (open) nextRef.current?.focus({ preventScroll: true }); }, [open, index]);

  const isLast = index === active.length - 1;
  const next = useCallback(() => {
    if (isLast) { close(); return; }
    setDirection(1);
    setIndex((i) => i + 1);
  }, [isLast, close]);
  const prev = useCallback(() => {
    if (index === 0) return;
    setDirection(-1);
    setIndex((i) => i - 1);
  }, [index]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, next, prev, close]);

  const cardStyle = useMemo<React.CSSProperties>(() => {
    if (!step) return {};
    if (!rect) {
      return { position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: Math.min(320, view.w - 32), zIndex: 10002 };
    }
    return tooltipPosition(rect, step.placement, view.w, view.h);
  }, [rect, step, view]);

  if (!open || !step) return null;

  const progress = ((index + 1) / active.length) * 100;
  const sx = rect ? rect.left - PAD : 0;
  const sy = rect ? rect.top - PAD : 0;
  const sw = rect ? rect.width + PAD * 2 : 0;
  const sh = rect ? rect.height + PAD * 2 : 0;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="camp-tour"
        role="dialog"
        aria-modal="true"
        aria-label="Tour guiada"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: reduce ? 0 : 0.3 }}
        className="fixed inset-0"
        style={{ zIndex: 10000 }}
      >
        <svg className="fixed inset-0" style={{ zIndex: 10000, pointerEvents: "none" }} width="100%" height="100%" aria-hidden="true">
          <defs>
            <mask id="camp-tour-mask">
              <rect width="100%" height="100%" fill="white" />
              {rect && (
                <motion.rect
                  initial={false}
                  animate={{ x: sx, y: sy, width: sw, height: sh }}
                  transition={reduce ? { duration: 0 } : { type: "spring", damping: 30, stiffness: 300 }}
                  rx={RADIUS}
                  ry={RADIUS}
                  fill="black"
                />
              )}
            </mask>
          </defs>
          <rect width="100%" height="100%" fill="rgba(0,0,0,0.72)" mask="url(#camp-tour-mask)" />
        </svg>

        {rect && (
          <motion.div
            initial={false}
            animate={{ top: sy - 3, left: sx - 3, width: sw + 6, height: sh + 6 }}
            transition={reduce ? { duration: 0 } : { type: "spring", damping: 30, stiffness: 300 }}
            className="fixed rounded-[17px] pointer-events-none"
            style={{ zIndex: 10001, boxShadow: "0 0 0 2px rgba(255,255,255,0.5), 0 0 20px 4px rgba(255,255,255,0.15)" }}
          />
        )}

        {/* Toque fora do destaque avança, como no tutorial do cardápio */}
        <div className="fixed inset-0" style={{ zIndex: 10001, cursor: "pointer" }} onClick={next} aria-hidden="true" />

        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={index}
            custom={direction}
            initial={{ opacity: 0, y: reduce ? 0 : direction >= 0 ? 20 : -20, scale: reduce ? 1 : 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: reduce ? 0 : direction >= 0 ? -20 : 20, scale: reduce ? 1 : 0.95 }}
            transition={reduce ? { duration: 0 } : { type: "spring", damping: 28, stiffness: 300 }}
            style={cardStyle}
            onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
            onTouchEnd={(e) => {
              if (touchX.current === null) return;
              const diff = touchX.current - e.changedTouches[0].clientX;
              if (Math.abs(diff) > 50) { if (diff > 0) next(); else prev(); }
              touchX.current = null;
            }}
          >
            <div className="relative bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
              <div className="h-1 bg-border/30">
                <motion.div
                  className="h-full bg-gradient-to-r from-orange-500 to-amber-600"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: reduce ? 0 : 0.4 }}
                />
              </div>
              <div className="p-4">
                <div className="flex items-center gap-3 mb-2.5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 text-white shadow-md shrink-0">
                    {step.icon ?? <Sparkles size={20} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[15px] font-extrabold text-foreground tracking-tight leading-tight">{step.title}</h3>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                      {index + 1} / {active.length}
                    </span>
                  </div>
                </div>
                <p className="text-[13px] text-muted-foreground leading-relaxed mb-4">{step.description}</p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5" aria-hidden="true">
                    {active.map((_, i) => (
                      <div
                        key={i}
                        className={cn(
                          "h-1.5 rounded-full transition-all duration-300",
                          i === index ? "w-5 bg-gradient-to-r from-orange-500 to-amber-600" : i < index ? "w-1.5 bg-muted-foreground/40" : "w-1.5 bg-border",
                        )}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    {index > 0 && (
                      <button
                        type="button"
                        aria-label="Passo anterior"
                        onClick={(e) => { e.stopPropagation(); prev(); }}
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:bg-accent transition-all"
                      >
                        <ChevronLeft size={16} />
                      </button>
                    )}
                    <button
                      ref={nextRef}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); next(); }}
                      className="flex items-center gap-1.5 h-9 px-4 rounded-lg text-xs font-bold text-white transition-all active:scale-[0.97] shadow-md bg-gradient-to-r from-orange-500 to-amber-600 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    >
                      {isLast ? (<><Rocket size={14} /> Entendi!</>) : (<>Próximo <ChevronRight size={14} /></>)}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        <button
          type="button"
          onClick={close}
          className="fixed top-4 right-4 flex items-center gap-1.5 text-white/70 hover:text-white text-xs font-medium transition-colors bg-black/30 backdrop-blur-sm px-3 py-2 rounded-full"
          style={{ zIndex: 10003 }}
        >
          Pular tour
          <X size={12} />
        </button>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}

/** Botão discreto para reabrir a tour da tela atual. */
export function TourButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Ver a tour guiada desta tela"
      className={cn(
        "inline-flex items-center gap-1.5 h-11 sm:h-9 px-3 rounded-xl border border-border bg-background text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring",
        className,
      )}
    >
      <HelpCircle size={14} />
      Ver tour
    </button>
  );
}
