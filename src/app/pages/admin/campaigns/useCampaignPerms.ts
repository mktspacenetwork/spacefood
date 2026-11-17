import { useEffect, useState } from "react";
import { fetchCampaignAdminMe } from "../../../lib/campaigns/api";

type Me = { isAdmin: boolean; permissions: Record<string, boolean>; name: string };

// Uma única consulta por sessão de página: /admin/me é leve, mas várias telas do módulo
// precisam do resultado ao mesmo tempo (lista, assistente, painel, abas).
let cache: Promise<Me> | null = null;

/** Descarta o cache (ex.: depois de alterar acessos). */
export function invalidateCampaignPerms() {
  cache = null;
}

export function useCampaignPerms() {
  const [state, setState] = useState<{ me: Me | null; loading: boolean }>({ me: null, loading: true });

  useEffect(() => {
    let alive = true;
    if (!cache) cache = fetchCampaignAdminMe();
    cache.then((me) => {
      // Se a verificação falhou/negou, não deixa o resultado "grudar": a próxima tela tenta de novo.
      if (!me.isAdmin) cache = null;
      if (alive) setState({ me, loading: false });
    });
    return () => {
      alive = false;
    };
  }, []);

  return {
    perms: state.me?.permissions ?? ({} as Record<string, boolean>),
    loading: state.loading,
    isAdmin: !!state.me?.isAdmin,
    name: state.me?.name ?? "",
  };
}
