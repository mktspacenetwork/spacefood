import { createElement } from "react";
import {
  Megaphone, CalendarDays, MousePointerClick, Camera, Send, Pencil, Vote, ShieldCheck, ListOrdered,
  Trophy, Images, ClipboardList, Info, UtensilsCrossed, ListChecks, BookOpen, PlusCircle,
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

/** Lista de campanhas (/campanhas). Passos sem alvo na tela (ex.: livro não publicado) são pulados. */
export const LIST_TOUR: TourStep[] = [
  {
    icon: icon(Megaphone),
    title: "Campanhas",
    description: "Aqui ficam as campanhas ativas. Toque em uma para participar.",
  },
  {
    selector: "camp-submit-cta",
    icon: icon(PlusCircle),
    title: "Cadastrar receita",
    description: "Cadastre sua receita por aqui. Em campanha com votação, passado o prazo ainda dá para enviar até o resultado, mas a receita não concorre à votação.",
  },
  {
    selector: "camp-book-card",
    icon: icon(BookOpen),
    title: "Livro de Receitas",
    description: "O livro reúne as receitas da plataforma. Leia aqui e use \"Baixar PDF\", na lista ou durante a leitura, para levar o livro inteiro.",
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
        ? "Este botão leva ao que dá para fazer agora: cadastrar sua receita, votar ou ver o resultado."
        : "Este botão leva ao que dá para fazer agora: cadastrar sua receita ou ver as suas receitas.",
    },
    {
      selector: "camp-sections",
      icon: icon(ListChecks),
      title: "Menu da campanha",
      description: hasVoting
        ? "Veja as receitas, as suas receitas, cadastre uma nova, vote quando a votação estiver aberta e acompanhe o Ranking, quando a equipe liberar."
        : "Veja as receitas, as suas receitas e cadastre uma nova.",
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
    selector: "camp-view-toggle",
    icon: icon(ListChecks),
    title: "Cards ou lista",
    description: "Escolha como ver as receitas. A escolha fica salva no seu aparelho.",
  },
  {
    selector: "camp-recipe-card",
    icon: icon(UtensilsCrossed),
    title: "Abra uma receita",
    description: "Toque para abrir a receita completa — foto, ingredientes, modo de preparo e história — numa folha por cima da lista. Feche para voltar.",
  },
];

/** Uma receita da galeria. */
export const RECIPE_DETAIL_TOUR: TourStep[] = [
  {
    selector: "camp-recipe-media",
    icon: icon(Images),
    title: "A receita",
    description: "A foto, o nome de quem enviou, os ingredientes, o modo de preparo e a história. Seção sem texto aparece como \"Não informado\".",
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
    selector: "camp-late",
    icon: icon(ShieldCheck),
    title: "Fora do prazo",
    description: "O prazo de participação terminou. Sua receita será aceita, mas não concorrerá à votação.",
  },
  {
    selector: "camp-fields",
    icon: icon(ListChecks),
    title: "Sua receita",
    description: "Informe o título, os ingredientes e o modo de preparo. A história e a memória afetiva são opcionais.",
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
    description: "Aqui estão as receitas que você cadastrou. Use Cards ou Lista para ver do seu jeito.",
  },
  {
    selector: "camp-recipe-card",
    icon: icon(UtensilsCrossed),
    title: "Abra uma receita",
    description: "O selo mostra a situação: em análise, aprovada ou não aprovada. Receita enviada fora do prazo traz o aviso de que não concorre à votação. Toque para ver ingredientes, modo de preparo e o motivo, se não for aprovada.",
  },
  {
    selector: "camp-new-recipe",
    icon: icon(Send),
    title: "Cadastrar receita",
    description: "Use este botão para cadastrar uma receita. Quando a campanha permitir, dá para cadastrar outras.",
  },
  {
    selector: "camp-edit",
    icon: icon(Pencil),
    title: "Editar",
    description: "Dá para editar enquanto ela não for aprovada.",
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
  {
    selector: "camp-partial",
    icon: icon(ListOrdered),
    title: "Ranking parcial",
    description: "A equipe liberou a classificação até agora. Ela ainda pode mudar.",
  },
];

/** Ranking. */
export const RANKING_TOUR: TourStep[] = [
  {
    icon: icon(ListOrdered),
    title: "Ranking",
    description: "Mostra a classificação das receitas por votos. O item aparece no menu quando a equipe libera e some se ela desligar.",
  },
  {
    selector: "camp-ranking",
    icon: icon(ListOrdered),
    title: "Classificação",
    description: "Os três primeiros ficam em destaque; \"Ver classificação completa\" mostra todas, com os votos. Atualiza sozinha. Empates dividem a posição, e só receitas aprovadas e dentro do prazo entram. Se aparecer como parcial, ainda pode mudar: a final só vale depois que o resultado for divulgado.",
  },
];

/** Resultado. */
export const RESULTS_TOUR: TourStep[] = [
  {
    icon: icon(Trophy),
    title: "Resultado",
    description: "Aqui aparece o resultado da votação, depois que a equipe divulgar.",
  },
  {
    selector: "camp-winner",
    icon: icon(Trophy),
    title: "Receita vencedora",
    description: "Parabéns a todas as pessoas que participaram!",
  },
];
