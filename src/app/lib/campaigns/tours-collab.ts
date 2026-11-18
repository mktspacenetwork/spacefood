import { createElement } from "react";
import {
  Megaphone, CalendarDays, MousePointerClick, Camera, Send, Activity, Pencil, Vote, ShieldCheck, ListOrdered,
  Trophy, Images, ClipboardList, Info, UtensilsCrossed, ListChecks,
} from "lucide-react";
import type { TourStep } from "../../components/campaigns/CampaignTour";

const icon = (C: Parameters<typeof createElement>[0]) => createElement(C as never, { size: 20 });

/*
 * Regra única de todas as tours (colaborador e admin):
 *  - abre sozinha UMA vez, na primeira vez que a pessoa vê a tela com o conteúdo carregado;
 *  - depois só reabre pelo botão "Ver tour", que existe em toda tela.
 * Textos curtos (2–3 passos por tela). Telas que podem aparecer sem alvos (aviso, lista vazia, etapa fechada)
 * começam com um passo SEM `selector`: ele aparece centralizado e garante que o "Ver tour" sempre mostre algo.
 */

/** Lista de campanhas (/campanhas). */
export const LIST_TOUR: TourStep[] = [
  {
    icon: icon(Megaphone),
    title: "Campanhas",
    description: "Aqui ficam as campanhas do Space Food. Toque em uma para participar.",
  },
  {
    selector: "camp-card",
    icon: icon(CalendarDays),
    title: "Sua campanha",
    description: "Veja a situação e o período. Toque no cartão para abrir.",
  },
  {
    selector: "camp-card-action",
    icon: icon(MousePointerClick),
    title: "Ir direto à ação",
    description: "O botão leva ao que dá para fazer agora, como participar ou ver as suas receitas.",
  },
];

/**
 * Início da campanha. Os textos se adaptam: campanha sem votação nunca fala de voto, ranking ou resultado.
 */
export function homeTour(hasVoting: boolean): TourStep[] {
  return [
    {
      selector: "camp-cta",
      icon: icon(MousePointerClick),
      title: "Ação do momento",
      description: hasVoting
        ? "Este botão leva ao que dá para fazer agora: enviar sua receita, votar ou ver o resultado."
        : "Este botão leva ao que dá para fazer agora: enviar sua receita ou ver as suas receitas.",
    },
    {
      selector: "camp-period",
      icon: icon(CalendarDays),
      title: hasVoting ? "Períodos" : "Período",
      description: hasVoting
        ? "Aqui estão as datas para participar e para votar."
        : "Aqui estão as datas para participar.",
    },
    {
      selector: "camp-details",
      icon: icon(Info),
      title: "Mais informações",
      description: "Regras, datas e como funciona ficam em “Ver detalhes”.",
    },
  ];
}

/** Galeria de receitas. */
export const RECIPES_TOUR: TourStep[] = [
  {
    icon: icon(Images),
    title: "Receitas",
    description: "Aqui ficam as receitas aprovadas. Se ainda não houver nenhuma, você vê um aviso.",
  },
  {
    selector: "camp-recipe-card",
    icon: icon(UtensilsCrossed),
    title: "Abra uma receita",
    description: "Toque para ver a foto e os detalhes.",
  },
];

/** Uma receita da galeria. */
export const RECIPE_DETAIL_TOUR: TourStep[] = [
  {
    selector: "camp-recipe-media",
    icon: icon(Images),
    title: "A receita",
    description: "A foto e o nome de quem enviou.",
  },
  {
    selector: "camp-recipe-vote",
    icon: icon(Vote),
    title: "Votar",
    description: "Quando a votação estiver aberta, vote por aqui. O voto é definitivo.",
  },
];

/** Participar / editar. */
export const SUBMIT_TOUR: TourStep[] = [
  {
    selector: "camp-fields",
    icon: icon(ListChecks),
    title: "Título e história",
    description: "Dê um título à receita e, se quiser, conte a história e a memória afetiva por trás dela.",
  },
  {
    selector: "camp-photo",
    icon: icon(Camera),
    title: "Foto da receita",
    description: "Tire uma foto ou escolha da galeria. É uma foto da receita pronta.",
  },
  {
    selector: "camp-send",
    icon: icon(Send),
    title: "Enviar",
    description: "A equipe confere sua receita. Você acompanha em “Minhas receitas”.",
  },
];

/** Minhas receitas. */
export const MYENTRY_TOUR: TourStep[] = [
  {
    icon: icon(ClipboardList),
    title: "Minhas receitas",
    description: "Aqui você vê as receitas que enviou: em análise, aprovadas ou que precisam de ajuste.",
  },
  {
    selector: "camp-status",
    icon: icon(Activity),
    title: "Situação",
    description: "Se a receita não for aprovada, o motivo aparece aqui.",
  },
  {
    selector: "camp-edit",
    icon: icon(Pencil),
    title: "Editar",
    description: "Dá para editar enquanto ela não for aprovada.",
  },
  {
    selector: "camp-new-recipe",
    icon: icon(Send),
    title: "Enviar receita",
    description: "Use este botão para enviar uma receita. Quando a campanha permitir, dá para enviar outras.",
  },
];

/** Votação. */
export const VOTE_TOUR: TourStep[] = [
  {
    icon: icon(ShieldCheck),
    title: "Votação",
    description: "Escolha a sua receita favorita. É 1 voto por pessoa e não vale na sua própria receita.",
  },
  {
    selector: "camp-vote-button",
    icon: icon(Vote),
    title: "Votar",
    description: "Toque em Votar e confirme. Depois de confirmado, não dá para mudar.",
  },
];

/** Ranking. */
export const RANKING_TOUR: TourStep[] = [
  {
    icon: icon(ListOrdered),
    title: "Ranking",
    description: "Mostra a classificação das receitas por votos. Antes de ser liberado, você vê um aviso.",
  },
  {
    selector: "camp-ranking",
    icon: icon(ListOrdered),
    title: "Parcial ou oficial",
    description: "“Parcial” pode mudar. “Resultado oficial” é o final.",
  },
];

/** Resultado. */
export const RESULTS_TOUR: TourStep[] = [
  {
    icon: icon(Trophy),
    title: "Resultado",
    description: "Aqui aparece a receita vencedora, depois que o resultado for divulgado.",
  },
  {
    selector: "camp-winner",
    icon: icon(Trophy),
    title: "Receita vencedora",
    description: "Parabéns a todas as pessoas que participaram!",
  },
];
