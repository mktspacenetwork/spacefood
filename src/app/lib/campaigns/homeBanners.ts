import { campaignsApi } from "./api";
import type { CollabCampaignListItem } from "./types";

/**
 * Campanhas publicadas viram slides do carrossel de banners da Home — sem cadastrar imagem duas vezes:
 * a capa da campanha É o banner. O servidor só devolve campanhas visíveis para a pessoa (publicada, não
 * despublicada, no público certo), então despublicar/encerrar tira o slide sozinho.
 *
 * Formato compatível com o `Banner` do BannerCarousel.
 */
export type HomeCampaignBanner = {
  id: string;
  link: string;
  active: true;
  order: number;
  imageUrl?: string;
  title?: string;
  description?: string;
  backgroundColor?: string;
  textColor?: string;
  buttonText?: string;
  alt?: string;
  objectPosition?: string;
};

const TTL_MS = 60_000;
const TIMEOUT_MS = 3_000;

let cache: { key: string; ts: number; data: HomeCampaignBanner[] } | null = null;
let pending: { key: string; promise: Promise<HomeCampaignBanner[]> } | null = null;

/**
 * Já acabou? Usa o `ended` do servidor e, como segurança, as datas (inscrições e, se houver, votação).
 * Sem datas = continua. Encerrada, o slide some da Home (a campanha segue na lista de Campanhas).
 */
function hasEnded(c: CollabCampaignListItem): boolean {
  if (c.ended === true) return true;
  const ends = (c.stages ?? [])
    .filter((s) => s.key === "registration" || (s.key === "voting" && c.features?.voting))
    .map((s) => s.ends_at)
    .filter((x): x is string => !!x)
    .map((x) => new Date(x).getTime());
  return ends.length > 0 && Math.max(...ends) <= Date.now();
}

function shorten(text: string, max: number): string {
  const t = (text || "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

function toBanner(c: CollabCampaignListItem, i: number): HomeCampaignBanner {
  const base: HomeCampaignBanner = {
    id: `campaign-${c.id}`,
    link: `/campanhas/${c.slug}`,
    active: true,
    order: -100 + i, // campanhas na frente dos banners comuns
    alt: c.name,
    // sem `objectPosition`: o slide usa o recorte padrão dos banners ("center right"), igual ao menu Banners
  };
  if (c.cover_url) return { ...base, imageUrl: c.cover_url }; // imagem pura, como os banners só de imagem
  // Sem capa: texto sobre o laranja do site (mesmo padrão do banner padrão).
  return {
    ...base,
    title: c.name,
    description: shorten(c.description, 90) || undefined,
    buttonText: "Ver campanha",
    backgroundColor: "#FF5A1F",
    textColor: "#FFFFFF",
  };
}

/**
 * Banners das campanhas visíveis para a pessoa. NUNCA lança erro (falha = lista vazia) e nunca demora
 * mais que alguns segundos, para jamais atrapalhar a Home. Guarda o resultado por 60 s.
 * `userKey` evita reaproveitar o cache de outra pessoa na mesma aba.
 */
export async function fetchHomeCampaignBanners(userKey = "anon"): Promise<HomeCampaignBanner[]> {
  if (cache && cache.key === userKey && Date.now() - cache.ts < TTL_MS) return cache.data;

  if (!pending || pending.key !== userKey) {
    const promise = campaignsApi
      .get<CollabCampaignListItem[]>("/campaigns")
      .then((list) => {
        const data = (Array.isArray(list) ? list : [])
          .filter((c) => c?.state?.released && c.state.stage !== "closed" && !hasEnded(c))
          .map(toBanner);
        cache = { key: userKey, ts: Date.now(), data };
        return data;
      })
      .catch(() => [] as HomeCampaignBanner[])
      .finally(() => {
        if (pending?.promise === promise) pending = null;
      });
    pending = { key: userKey, promise };
  }

  const timeout = new Promise<HomeCampaignBanner[]>((resolve) => setTimeout(() => resolve([]), TIMEOUT_MS));
  return Promise.race([pending.promise, timeout]);
}
