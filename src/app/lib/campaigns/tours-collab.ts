import { createElement } from "react";
import {
  Megaphone, CalendarDays, MousePointerClick, Camera, Send, Activity, Pencil, Vote, ShieldCheck, ListOrdered,
  Trophy, Images, ClipboardList, Info, UtensilsCrossed, ListChecks, BookOpen, Sparkles,
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
export function homeTour(hasVoting: boolean, hasBook = false): TourStep[] {
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
    ...(hasBook
      ? [{
          selector: "camp-book",
          icon: icon(BookOpen),
          title: "Livro de Receitas",
          description: "As receitas da campanha reunidas em um livro. Dá para ler aqui e baixar em PDF.",
        } satisfies TourStep]
      : []),
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
    description: "A foto, o nome de quem enviou, os ingredientes e o modo de preparo.",
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
    title: "Sua receita",
    description: "Dê um título e escreva os ingredientes e o modo de preparo. A história e a memória afetiva são opcionais.",
  },
  {
    selector: "camp-photo",
    icon: icon(Camera),
    title: "Fotos da receita",
    description: "Tire uma foto ou escolha da galeria. Dá para enviar de 1 a 3 fotos da receita pronta.",
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
    icon: icon(UtensilsCrossed),
    title: "Ver a receita completa",
    description: "Em cada receita, toque em “Ver receita completa” para conferir ingredientes e modo de preparo.",
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
    selector: "camp-vote-card",
    icon: icon(Vote),
    title: "Escolha uma receita",
    description: "Toque na receita que você quer escolher. Ela fica destacada.",
  },
  {
    icon: icon(Vote),
    title: "Votar",
    description: "Depois de escolher, toque em “Votar em…” e confirme. Depois de confirmado, não dá para mudar.",
  },
];

/** Ranking. */
export const RANKING_TOUR: TourStep[] = [
  {
    icon: icon(ListOrdered),
    title: "Ranking",
    description: "Mostra a classificação final das receitas por votos, depois que o resultado for divulgado.",
  },
  {
    selector: "camp-ranking",
    icon: icon(ListOrdered),
    title: "Resultado oficial",
    description: "Esta é a classificação final da votação.",
  },
];

/** Resultado. */
export const RESULTS_TOUR: TourStep[] = [
  {
    icon: icon(Trophy),
    title: "Resultado",
    description: "Aqui aparece o resultado da campanha (vencedora e/ou sorteio), depois que for divulgado.",
  },
  {
    selector: "camp-winner",
    icon: icon(Trophy),
    title: "Receita vencedora",
    description: "Parabéns a todas as pessoas que participaram!",
  },
  {
    selector: "camp-draw",
    icon: icon(Sparkles),
    title: "Sorteio",
    description: "Aqui estão as pessoas sorteadas, divulgadas pela equipe.",
  },
];
