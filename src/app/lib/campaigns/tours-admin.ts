import { createElement } from "react";
import {
  Megaphone, Power, BarChart3, FilePlus2, ListChecks, IdCard, Users, SlidersHorizontal, CalendarClock,
  ClipboardCheck, LayoutList, ChefHat, Vote, Activity, MousePointerClick, Pencil, Route, Compass, Settings,
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
    title: "Filtre por situação",
    description: "Rascunhos, publicadas, não publicadas e encerradas, cada uma com a sua contagem. Toque para ver só aquelas.",
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

/** Painel de uma campanha (central da campanha: situação, ciclo, próximo passo e 5 abas). */
export const ADMIN_TOUR_PANEL: TourStep[] = [
  {
    selector: "camp-panel-state",
    title: "Em que pé está a campanha",
    description:
      "Aqui você vê a situação (Rascunho, Publicada, Não publicada ou Encerrada) e a fase atual, como inscrições abertas ou votação aberta. Rascunho e Não publicada ficam escondidos dos colaboradores.",
    icon: icon(Activity),
    placement: "bottom",
  },
  {
    selector: "camp-panel-primary",
    title: "O botão principal",
    description:
      "Ele muda conforme a situação: Publicar libera a campanha, Despublicar tira de exibição sem apagar nada e Republicar volta a exibir. Tudo continua salvo.",
    icon: icon(MousePointerClick),
    placement: "bottom",
  },
  {
    selector: "camp-panel-edit",
    title: "Editar",
    description: "Ajuste nome, descrição, orientações, público e funcionalidades a qualquer momento. Salvar não publica nada.",
    icon: icon(Pencil),
    placement: "bottom",
  },
  {
    selector: "camp-panel-cycle",
    title: "Ciclo da campanha",
    description:
      "Inscrições, análise, votação, resultado e divulgação, com as datas de cada etapa. O passo destacado é onde a campanha está agora.",
    icon: icon(Route),
    placement: "bottom",
  },
  {
    selector: "camp-panel-next",
    title: "Próximo passo",
    description:
      "Sempre mostra a única coisa que vale fazer agora, com um botão direto: definir datas, analisar receitas, apurar a votação, confirmar ou divulgar o resultado.",
    icon: icon(Compass),
    placement: "bottom",
  },
  {
    selector: "camp-panel-tabs",
    title: "Cinco abas",
    description: "Resumo, Receitas, Participantes, Votação e Configurações. Você só vê as abas que a sua permissão libera.",
    icon: icon(LayoutList),
    placement: "bottom",
  },
  {
    selector: "camp-tab-summary",
    title: "Resumo",
    description:
      "O painel da campanha: participação, receitas por situação, votos, ranking das mais votadas, ritmo de envios por dia e participação por unidade. Antes de publicar, mostra o que falta.",
    icon: icon(BarChart3),
    placement: "bottom",
  },
  {
    selector: "camp-tab-submissions",
    title: "Receitas",
    description:
      "Aprove ou reprove cada receita. Para reprovar, a justificativa precisa ter pelo menos 10 caracteres: o colaborador a vê e pode ajustar a receita.",
    icon: icon(ChefHat),
    placement: "bottom",
  },
  {
    selector: "camp-tab-participants",
    title: "Participantes",
    description:
      "Uma tabela com cada participante, a receita, os votos que recebeu e a posição. Ao abrir uma linha, quem tem permissão vê quem votou naquela receita.",
    icon: icon(Users),
    placement: "bottom",
  },
  {
    selector: "camp-tab-voting",
    title: "Votação e resultado",
    description:
      "Veja se a votação está aberta ou encerrada, pause, prorrogue ou encerre. Depois siga o passo a passo: apurar, decidir empate se houver, confirmar o vencedor e divulgar. A divulgação não pode ser desfeita.",
    icon: icon(Vote),
    placement: "bottom",
  },
  {
    selector: "camp-tab-settings",
    title: "Configurações",
    description:
      "Informações da campanha, calendário, relatórios em planilha, histórico completo (quem fez o quê e por quê) e a zona de risco, com encerrar, arquivar e excluir rascunho.",
    icon: icon(Settings),
    placement: "bottom",
  },
];
