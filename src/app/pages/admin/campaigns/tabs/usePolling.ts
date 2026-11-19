import { useCallback, useEffect, useRef, useState } from "react";
import { errMsg } from "../../../../lib/campaigns/api";

/** Depois de uma falha, a próxima tentativa não espera mais que isto. */
const RETRY_MS = 30_000;

type Options = {
  /** Intervalo entre atualizações (ms). Padrão 20 s. */
  intervalMs?: number;
  /** Troque (ex.: id da campanha) para zerar os dados e recarregar do início. */
  resetKey?: string;
  /** false = carrega uma vez e não repete (ex.: campanha encerrada, dados finais). */
  autoRefresh?: boolean;
  /** false = não carrega nada (ex.: sem permissão). */
  enabled?: boolean;
};

export type Polling<T> = {
  data: T | null;
  /** Primeira carga em andamento (ainda sem dados). */
  loading: boolean;
  /** Mensagem do último erro; some na próxima atualização que der certo. Os dados antigos continuam em `data`. */
  error: string | null;
  /** Instante (ms) em que a última resposta chegou. */
  fetchedAt: number | null;
  /** Há uma busca em andamento agora (inclusive as silenciosas). */
  refreshing: boolean;
  reload: () => void;
};

/**
 * Atualização automática SÓ com a aba visível: um temporizador encadeado (nunca duas buscas ao mesmo tempo) que para
 * quando a página fica oculta e, ao voltar, atualiza na hora se já passou do intervalo. Respostas atrasadas são
 * descartadas. Em erro mantém os últimos dados e tenta de novo no próximo ciclo.
 */
export function usePolling<T>(fetcher: () => Promise<T>, opts: Options = {}): Polling<T> {
  const { intervalMs = 20_000, resetKey = "", autoRefresh = true, enabled = true } = opts;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchRef = useRef(fetcher);
  fetchRef.current = fetcher;
  const seq = useRef(0);
  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAt = useRef(0);
  const alive = useRef(true);
  const failed = useRef(false);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const visible = () => typeof document === "undefined" || document.visibilityState === "visible";

  const run = useCallback(async (generation: number) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    try {
      const d = await fetchRef.current();
      if (!alive.current || generation !== seq.current) return;
      setData(d);
      setError(null);
      failed.current = false;
      lastAt.current = Date.now();
      setFetchedAt(lastAt.current);
    } catch (e) {
      if (!alive.current || generation !== seq.current) return;
      failed.current = true;
      setError(errMsg(e, "Não foi possível atualizar agora."));
    } finally {
      inFlight.current = false;
      if (alive.current && generation === seq.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    const generation = ++seq.current;
    inFlight.current = false;
    failed.current = false;
    setData(null);
    setError(null);
    setFetchedAt(null);
    lastAt.current = 0;
    clear();
    if (!enabled) {
      setLoading(false);
      setRefreshing(false);
      return () => { alive.current = false; clear(); };
    }
    setLoading(true);

    const schedule = () => {
      clear();
      if (!autoRefresh || !alive.current || generation !== seq.current) return;
      // Depois de uma falha, tenta de novo mais cedo (no máximo 30 s), mesmo em ciclos longos.
      timer.current = setTimeout(tick, failed.current ? Math.min(intervalMs, RETRY_MS) : intervalMs);
    };
    const tick = async () => {
      timer.current = null;
      if (!alive.current || generation !== seq.current) return;
      // Aba oculta: não busca; o evento de visibilidade retoma o ciclo.
      if (!visible()) return;
      await run(generation);
      schedule();
    };
    const onVisibility = () => {
      if (!autoRefresh || generation !== seq.current) return;
      if (!visible()) {
        clear();
        return;
      }
      // Voltou para a aba: se já passou do intervalo, atualiza agora; senão espera o que falta.
      const every = failed.current ? Math.min(intervalMs, RETRY_MS) : intervalMs;
      const wait = Math.max(0, every - (Date.now() - lastAt.current));
      clear();
      timer.current = setTimeout(tick, wait > 0 ? wait : 0);
    };

    (async () => {
      await run(generation);
      schedule();
    })();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      alive.current = false;
      clear();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [resetKey, intervalMs, autoRefresh, enabled, run]);

  /** Atualização manual: busca agora (o ciclo automático segue como está; nunca há duas buscas juntas). */
  const reload = useCallback(() => {
    void run(seq.current);
  }, [run]);

  return { data, loading, error, fetchedAt, refreshing, reload };
}
