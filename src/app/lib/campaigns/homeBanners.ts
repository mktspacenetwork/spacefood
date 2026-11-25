import { campaignsApi } from "./api";
import { BANNER_DEFAULT_BG, BANNER_DEFAULT_TEXT, bannerHasText, readBannerText } from "./banner";
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
  /**
   * Marca o slide de campanha: o carrossel o desenha na MESMA caixa e com a MESMA regra de imagem dos banners comuns
   * (`object-cover`, posição padrão) e acrescenta o botão de envio (`cta`).
   */
  campaign: true;
  /**
   * Campanha com TEXTO configurado no cadastro (título, descrição, botão, fundo e cor do texto — o mesmo modelo do menu
   * Banners): o slide desenha o texto por cima da imagem, como os banners comuns. Sem isto, tudo segue como sempre.
   */
  styled?: true;
  /**
   * Botão "Envie sua receita": só existe enquanto a campanha aceita envio NO PRAZO (servidor: `can_submit` verdadeiro e
   * fora da janela de atraso). Quando a votação começa, o prazo acaba ou o limite de receitas é atingido, some sozinho.
   */
  cta?: { label: string; link: string };
};

const CTA_LABEL = "Envie sua receita";

const TTL_MS = 60_000;

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

/**
 * Chamada "Envie sua receita" do slide. Segue o servidor: `state.can_submit === true` e fora da janela de atraso
 * (`late_window`, que NÃO conta). Como a lista fica em cache por 60 s, confere também as datas da participação para
 * nunca mostrar o botão depois do prazo. Limite de receitas atingido ou votação aberta → o servidor manda `can_submit`
 * falso e o botão não aparece.
 */
export function submitCta(c: CollabCampaignListItem): HomeCampaignBanner["cta"] {
  const s = c.state as CollabCampaignListItem["state"] & { late_window?: boolean };
  if (s.can_submit !== true || s.late_window === true) return undefined;
  const reg = (c.stages ?? []).find((st) => st.key === "registration");
  const now = Date.now();
  if (reg?.starts_at && new Date(reg.starts_at).getTime() > now) return undefined;
  if (reg?.ends_at && new Date(reg.ends_at).getTime() <= now) return undefined;
  return { label: CTA_LABEL, link: `/campanhas/${c.slug}/enviar` };
}

/**
 * Dados do banner de UMA campanha — usados pela Home (carrossel), pela lista de Campanhas e pela página da campanha, para o
 * banner ser sempre o mesmo: mesma imagem, mesmo texto, mesmo botão (campanhas antigas inclusas). `i` só ordena o carrossel.
 */
export function campaignToBanner(c: CollabCampaignListItem, i = 0): HomeCampaignBanner {
  const cta = submitCta(c);
  const text = readBannerText(c.visibility?.banner);
  const base: HomeCampaignBanner = {
    id: `campaign-${c.id}`,
    link: `/campanhas/${c.slug}`,
    active: true,
    order: -100 + i, // campanhas na frente dos banners comuns
    alt: c.name,
    campaign: true, // mesma caixa e regra de imagem dos banners comuns; só acrescenta o botão de envio
    cta,
  };
  // Texto configurado: mesmo modelo dos banners comuns (a imagem é opcional; sem ela o fundo escolhido aparece).
  if (bannerHasText(text)) {
    return {
      ...base,
      ...(c.cover_url ? { imageUrl: c.cover_url } : {}),
      title: text.title,
      description: text.description,
      buttonText: text.button_text,
      backgroundColor: text.background ?? BANNER_DEFAULT_BG,
      textColor: text.text_color ?? BANNER_DEFAULT_TEXT,
      styled: true,
    };
  }
  if (c.cover_url) return { ...base, imageUrl: c.cover_url };
  // Sem capa: texto sobre o laranja do site (mesmo padrão do banner padrão). Com o botão de envio, o "Ver campanha" some.
  return {
    ...base,
    title: c.name,
    description: shorten(c.description, 90) || undefined,
    buttonText: cta ? undefined : "Ver campanha",
    backgroundColor: text.background ?? "#FF5A1F",
    textColor: text.text_color ?? "#FFFFFF",
  };
}

/**
 * Banners das campanhas visíveis para a pessoa. NUNCA lança erro (falha = lista vazia). Quem chama (o carrossel) é que decide
 * até quando o esqueleto espera: antes havia aqui um corte de 3 s que DESCARTAVA a resposta quando o servidor demorava, e o
 * slide da campanha simplesmente não aparecia naquela visita. Guarda o resultado por 60 s.
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
          .map((c, i) => campaignToBanner(c, i));
        cache = { key: userKey, ts: Date.now(), data };
        return data;
      })
      .catch(() => [] as HomeCampaignBanner[])
      .finally(() => {
        if (pending?.promise === promise) pending = null;
      });
    pending = { key: userKey, promise };
  }

  return pending.promise;
}
