import { createElement } from "react";
import {
  Megaphone, Power, BarChart3, FilePlus2, ListChecks, IdCard, Users, SlidersHorizontal, CalendarClock,
  ClipboardCheck, Rocket, LayoutList, ChefHat, Vote, Trophy, History, FileDown,
} from "lucide-react";
import type { TourStep } from "../../components/campaigns/CampaignTour";

const icon = (Icon: typeof Megaphone) => createElement(Icon, { size: 20 });

/** Lista de campanhas (visão geral do módulo). Alvos: data-tutorial="camp-..." */
export const ADMIN_TOUR_OVERVIEW: TourStep[] = [
  {
    title: "Bem-vindo às Campanhas",
    description:
      "Aqui você cria e acompanha campanhas internas, como o concurso de receitas. Esta tour mostra o caminho — e pode ser reaberta a qualquer momento em \"Ver tour\".",
    icon: icon(Megaphone),
  },
  {
    selector: "camp-module-switch",
    title: "Chave do módulo",
    description:
      "Enquanto estiver desligada, nenhum colaborador vê o menu, as campanhas ou a tour. Ao publicar uma campanha, o módulo é ligado automaticamente.",
    icon: icon(Power),
    placement: "bottom",
  },
  {
    selector: "camp-kpis",
    title: "Indicadores",
    description: "Um retrato rápido: quantas campanhas estão em rascunho, agendadas, ativas, encerradas e com resultado.",
    icon: icon(BarChart3),
    placement: "bottom",
  },
  {
    selector: "camp-new",
    title: "Nova campanha",
    description:
      "Comece por aqui. A campanha nasce como rascunho — ninguém além da gestão enxerga até você clicar em Publicar.",
    icon: icon(FilePlus2),
    placement: "bottom",
  },
  {
    selector: "camp-list",
    title: "Suas campanhas",
    description:
      "Abra uma campanha em \"Gerenciar\" para analisar receitas, acompanhar a votação, apurar e divulgar o resultado. Use \"Editar\" para ajustar a configuração.",
    icon: icon(ListChecks),
    placement: "top",
  },
];

/** Assistente de criação/edição. Os passos apontam para o indicador de etapas, sempre visível. */
export const ADMIN_TOUR_WIZARD: TourStep[] = [
  {
    selector: "camp-wiz-step-identity",
    title: "1. Identidade",
    description:
      "Nome, endereço, descrição, objetivo, orientações e capa. Na criação, você pode usar o modelo do Café Especial para começar mais rápido.",
    icon: icon(IdCard),
    placement: "bottom",
  },
  {
    selector: "camp-wiz-step-audience",
    title: "2. Público",
    description:
      "Escolha quem pode participar: todos, certas unidades, departamentos ou pessoas específicas. Só elas veem a campanha depois de publicada.",
    icon: icon(Users),
    placement: "bottom",
  },
  {
    selector: "camp-wiz-step-features",
    title: "3. Funcionalidades e regras",
    description:
      "Ligue só o que a campanha precisa (fotos, vídeo, votação, ranking...). As regras protegidas — 1 receita e 1 voto por pessoa, voto definitivo, edição travada na votação — valem sempre e não podem ser desligadas.",
    icon: icon(SlidersHorizontal),
    placement: "bottom",
  },
  {
    selector: "camp-wiz-step-schedule",
    title: "4. Calendário",
    description:
      "Datas e horários de Brasília para inscrições, votação, apuração e divulgação. As inscrições precisam terminar antes de a votação começar.",
    icon: icon(CalendarClock),
    placement: "bottom",
  },
  {
    selector: "camp-wiz-step-review",
    title: "5. Revisão",
    description:
      "Confira o resumo e salve como rascunho. Depois, no painel da campanha, o botão Publicar libera tudo para os colaboradores.",
    icon: icon(ClipboardCheck),
    placement: "bottom",
  },
];

/** Painel de uma campanha. */
export const ADMIN_TOUR_PANEL: TourStep[] = [
  {
    selector: "camp-panel-tabs",
    title: "Abas da campanha",
    description:
      "Cada aba cuida de uma parte do concurso. Você só vê as abas que a sua permissão libera.",
    icon: icon(LayoutList),
    placement: "bottom",
  },
  {
    selector: "camp-tab-submissions",
    title: "Receitas",
    description:
      "Aprove ou reprove cada receita. Para reprovar, a justificativa precisa ter pelo menos 10 caracteres — o colaborador a vê e pode ajustar a receita.",
    icon: icon(ChefHat),
    placement: "bottom",
  },
  {
    selector: "camp-tab-voting",
    title: "Votação",
    description:
      "Acompanhe os votos e, se preciso, pause, prorrogue ou encerre a votação. Depois de encerrada, apure o resultado.",
    icon: icon(Vote),
    placement: "bottom",
  },
  {
    selector: "camp-tab-results",
    title: "Resultado",
    description:
      "Em caso de empate, registre a decisão com justificativa. Depois confirme o vencedor e divulgue — a divulgação não pode ser desfeita.",
    icon: icon(Trophy),
    placement: "bottom",
  },
  {
    selector: "camp-tab-history",
    title: "Histórico",
    description: "Tudo o que foi feito na campanha fica registrado: quem, quando e por quê. O histórico não pode ser apagado.",
    icon: icon(History),
    placement: "bottom",
  },
  {
    selector: "camp-tab-reports",
    title: "Relatórios",
    description: "Baixe planilhas (CSV, abre direto no Excel) de participantes, receitas, ranking, resultado e histórico.",
    icon: icon(FileDown),
    placement: "bottom",
  },
  {
    selector: "camp-panel-publish",
    title: "Publicar",
    description:
      "Quando tudo estiver pronto, clique em Publicar. Você confere a lista de prontidão, escolhe quando liberar e se quer avisar os colaboradores. Só depois disso eles passam a ver a campanha.",
    icon: icon(Rocket),
    placement: "bottom",
  },
];
