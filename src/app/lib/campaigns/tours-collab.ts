import { createElement } from "react";
import { Megaphone, CalendarDays, LayoutGrid, MousePointerClick, UserRound, ListChecks, Camera, Send, Activity, MessageSquareWarning, Pencil, Vote, ShieldCheck, ListOrdered, Trophy, Bell } from "lucide-react";
import type { TourStep } from "../../components/campaigns/CampaignTour";

const icon = (C: Parameters<typeof createElement>[0]) => createElement(C as never, { size: 20 });

/** Lista de campanhas (/campanhas). `camp-nav` fica no item "Campanhas" do menu (AppLayout). */
export const LIST_TOUR: TourStep[] = [
  {
    selector: "camp-nav",
    icon: icon(Bell),
    title: "Menu Campanhas",
    description: "Aqui você encontra as campanhas e concursos do Space Food. Toque neste item sempre que quiser voltar para cá.",
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
    selector: "camp-ranking",
    icon: icon(ListOrdered),
    title: "Parcial ou oficial",
    description: "Enquanto o vencedor não é confirmado, o ranking é parcial e pode mudar. O selo “Resultado oficial” aparece depois da confirmação.",
  },
];

/** Resultado. */
export const RESULTS_TOUR: TourStep[] = [
  {
    selector: "camp-winner",
    icon: icon(Trophy),
    title: "Receita vencedora",
    description: "Este é o resultado oficial da campanha. Parabéns a todas as pessoas que participaram!",
  },
];
