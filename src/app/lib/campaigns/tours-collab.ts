import { createElement } from "react";
import {
  Megaphone, CalendarDays, LayoutGrid, MousePointerClick, UserRound, ListChecks, Camera, Send, Activity,
  MessageSquareWarning, Pencil, Vote, ShieldCheck, ListOrdered, Trophy, Bell, BookOpen, Images, NotebookPen,
  ClipboardList,
} from "lucide-react";
import type { TourStep } from "../../components/campaigns/CampaignTour";

const icon = (C: Parameters<typeof createElement>[0]) => createElement(C as never, { size: 20 });

/*
 * Regra única de todas as tours (colaborador e admin):
 *  - abre sozinha UMA vez, na primeira vez que a pessoa vê a tela com o conteúdo carregado;
 *  - depois só reabre pelo botão "Ver tour", que existe em toda tela.
 * Telas que podem aparecer sem alvos na tela (aviso, lista vazia, etapa fechada) começam com um passo
 * SEM `selector`: ele aparece centralizado e garante que o "Ver tour" sempre mostre alguma orientação.
 */

/** Lista de campanhas (/campanhas). `camp-nav` fica no item "Campanhas" do menu (AppLayout). */
export const LIST_TOUR: TourStep[] = [
  {
    icon: icon(Megaphone),
    title: "Campanhas",
    description: "Aqui ficam as campanhas e os concursos do Space Food. Quando houver uma campanha para você, ela aparece em um cartão nesta tela.",
  },
  {
    selector: "camp-nav",
    icon: icon(Bell),
    title: "Menu Campanhas",
    description: "Toque neste item do menu sempre que quiser voltar para cá.",
  },
  {
    selector: "camp-card",
    icon: icon(Megaphone),
    title: "Sua campanha",
    description: "Cada cartão é uma campanha. Toque para ver as regras, as datas e participar.",
  },
  {
    selector: "camp-stage",
    icon: icon(CalendarDays),
    title: "Etapa e período",
    description: "Veja em que fase a campanha está e até quando dá para participar.",
  },
];

/** Início da campanha. */
export const HOME_TOUR: TourStep[] = [
  {
    selector: "camp-timeline",
    icon: icon(CalendarDays),
    title: "Linha do tempo",
    description: "As etapas da campanha com data e hora (horário de Brasília). A etapa atual fica destacada.",
  },
  {
    selector: "camp-sections",
    icon: icon(LayoutGrid),
    title: "Seções liberadas",
    description: "Estes botões mostram só o que já está liberado para você. Novas seções aparecem aqui conforme a campanha avança.",
  },
  {
    selector: "camp-cta",
    icon: icon(MousePointerClick),
    title: "Próximo passo",
    description: "Este botão leva você à ação do momento: enviar sua receita, votar ou ver o resultado.",
  },
];

/** Galeria de receitas. */
export const RECIPES_TOUR: TourStep[] = [
  {
    icon: icon(Images),
    title: "Galeria de receitas",
    description: "Aqui ficam as receitas aprovadas, com foto e autor. Quando a galeria ainda não está liberada ou não há receitas, você vê um aviso no lugar.",
  },
  {
    selector: "camp-recipe-card",
    icon: icon(BookOpen),
    title: "Abra uma receita",
    description: "Toque em uma receita para ver as fotos, os ingredientes e o modo de preparo.",
  },
  {
    selector: "camp-load-more",
    icon: icon(LayoutGrid),
    title: "Veja mais receitas",
    description: "Quando houver mais receitas do que cabe na tela, use este botão para carregar as próximas.",
  },
];

/** Uma receita da galeria. */
export const RECIPE_DETAIL_TOUR: TourStep[] = [
  {
    selector: "camp-recipe-media",
    icon: icon(Images),
    title: "Fotos e vídeo",
    description: "Deslize para ver todas as fotos. Se a receita tiver vídeo, toque em play para assistir.",
  },
  {
    selector: "camp-recipe-ingredients",
    icon: icon(ListChecks),
    title: "Ingredientes e preparo",
    description: "Aqui estão a lista de ingredientes e, logo abaixo, o passo a passo do modo de preparo.",
  },
  {
    selector: "camp-recipe-vote",
    icon: icon(Vote),
    title: "Votar nesta receita",
    description: "Quando a votação estiver aberta, você vota por aqui. O voto é definitivo e não vale para a sua própria receita.",
  },
];

/** Enviar / editar receita. */
export const SUBMIT_TOUR: TourStep[] = [
  {
    selector: "camp-author",
    icon: icon(UserRound),
    title: "Autor automático",
    description: "A receita sai no seu nome. Não é preciso informar quem é o autor.",
  },
  {
    selector: "camp-fields",
    icon: icon(ListChecks),
    title: "Campos obrigatórios",
    description: "Preencha o nome do prato, a descrição, os ingredientes (um por linha) e o modo de preparo.",
  },
  {
    selector: "camp-media",
    icon: icon(Camera),
    title: "Fotos e vídeo",
    description: "Adicione uma foto principal e, se quiser, outras fotos e um vídeo curto. Respeite os limites de tamanho mostrados aqui.",
  },
  {
    selector: "camp-send",
    icon: icon(Send),
    title: "Enviar para análise",
    description: "A equipe analisa sua receita e você acompanha em Minha participação. Até a votação começar ainda é possível editar.",
  },
];

/** Minha participação. */
export const MYENTRY_TOUR: TourStep[] = [
  {
    icon: icon(ClipboardList),
    title: "Minha participação",
    description: "Aqui você acompanha a sua receita: status, datas, o motivo se ela for reprovada e o seu voto. Se ainda não enviou, você vê o convite para participar.",
  },
  {
    selector: "camp-status",
    icon: icon(Activity),
    title: "Acompanhe o status",
    description: "Veja se sua receita foi enviada, está em análise, aprovada ou reprovada, com data e hora de cada passo.",
  },
  {
    selector: "camp-reason",
    icon: icon(MessageSquareWarning),
    title: "Motivo da reprovação",
    description: "Se a receita não for aprovada, o motivo aparece aqui. Você pode corrigir e reenviar enquanto a edição estiver liberada.",
  },
  {
    selector: "camp-edit",
    icon: icon(Pencil),
    title: "Editar receita",
    description: "Enquanto a votação não começar, você pode editar. Ao salvar, a receita volta para análise.",
  },
];

/** Votação. */
export const VOTE_TOUR: TourStep[] = [
  {
    icon: icon(NotebookPen),
    title: "Votação",
    description: "Aqui você escolhe a receita favorita da campanha. Os votos só são aceitos enquanto a votação estiver aberta; fora desse período esta tela mostra o andamento.",
  },
  {
    selector: "camp-vote-rules",
    icon: icon(ShieldCheck),
    title: "Regras da votação",
    description: "Cada pessoa tem 1 voto. Ele é definitivo e não vale para a sua própria receita.",
  },
  {
    selector: "camp-vote-button",
    icon: icon(Vote),
    title: "Votar",
    description: "Toque em Votar na receita favorita. Você confirma antes de registrar — depois não dá para mudar.",
  },
];

/** Ranking. */
export const RANKING_TOUR: TourStep[] = [
  {
    icon: icon(ListOrdered),
    title: "Ranking",
    description: "Mostra a classificação das receitas por votos. Enquanto o ranking não é liberado, você vê um aviso no lugar.",
  },
  {
    selector: "camp-ranking",
    icon: icon(ListOrdered),
    title: "Parcial ou oficial",
    description: "Enquanto o vencedor não é confirmado, o ranking é parcial e pode mudar. O selo “Resultado oficial” aparece depois da confirmação.",
  },
];

/** Resultado. */
export const RESULTS_TOUR: TourStep[] = [
  {
    icon: icon(Trophy),
    title: "Resultado",
    description: "Aqui aparece a receita vencedora, depois que a campanha divulga o resultado oficial.",
  },
  {
    selector: "camp-winner",
    icon: icon(Trophy),
    title: "Receita vencedora",
    description: "Este é o resultado oficial da campanha. Parabéns a todas as pessoas que participaram!",
  },
];
