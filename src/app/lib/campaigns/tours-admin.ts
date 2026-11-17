import { createElement } from "react";
import {
  Megaphone, Power, BarChart3, FilePlus2, ListChecks, IdCard, Users, SlidersHorizontal, CalendarClock,
  ClipboardCheck, ChefHat, Vote, MousePointerClick, Route, LayoutList, Search, Trophy, FileDown, ShieldAlert,
  ListFilter, Gauge,
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
      "Toque no nome da campanha, ou no menu \"⋯\" em \"Gerenciar\", para analisar receitas, acompanhar a votação e divulgar o resultado. No mesmo menu estão Publicar/Despublicar, Editar, Duplicar e Histórico.",
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

/**
 * Painel de uma campanha: UMA TOUR POR ABA. Cada uma abre sozinha na primeira vez que a pessoa entra na aba
 * (para qualquer perfil) e depois só por "Ver tour". Passo cujo alvo não existe na tela é pulado — por isso
 * quem não tem uma permissão simplesmente não vê o passo correspondente.
 */
export type PanelTourKey = "summary" | "submissions" | "participants" | "voting" | "settings";

export const ADMIN_TOUR_TABS: Record<PanelTourKey, TourStep[]> = {
  summary: [
    {
      selector: "camp-panel-primary",
      title: "O botão principal",
      description:
        "Ele muda conforme a situação: Publicar libera a campanha, Despublicar tira de exibição sem apagar nada e Republicar volta a exibir. Salvar uma edição nunca publica sozinho.",
      icon: icon(MousePointerClick),
      placement: "bottom",
    },
    {
      selector: "camp-panel-tabs",
      title: "As áreas da campanha",
      description:
        "Resumo, Receitas, Participantes, Votação e Configurações ficam sempre aqui no topo, fixas enquanto você rola. Cada área abre a sua própria tour na primeira visita.",
      icon: icon(LayoutList),
      placement: "bottom",
    },
    {
      selector: "camp-panel-cycle",
      title: "Ciclo e próximo passo",
      description:
        "O ciclo mostra em que etapa a campanha está (inscrições, análise, votação, resultado e divulgação) e o cartão logo abaixo diz a única coisa que vale fazer agora, com um botão direto.",
      icon: icon(Route),
      placement: "bottom",
    },
    {
      selector: "camp-summary-checklist",
      title: "O que falta para publicar",
      description:
        "Enquanto é rascunho, esta lista mostra o que ainda impede a publicação. Cada item pendente tem um botão que leva direto ao lugar de resolver.",
      icon: icon(ClipboardCheck),
      placement: "top",
    },
    {
      selector: "camp-summary-cards",
      title: "Os números que importam",
      description:
        "Participação, receitas por situação, votos e resultado. O que ainda não faz sentido (como votos antes da votação) nem aparece. Mais abaixo vêm o ranking e, em \"Mais indicadores\", o ritmo de envios e a participação por unidade.",
      icon: icon(Gauge),
      placement: "bottom",
    },
  ],

  submissions: [
    {
      selector: "camp-sub-filters",
      title: "Encontre receitas",
      description:
        "Filtre por situação (com a contagem de cada uma), busque por prato ou participante e, se precisar, limite por data de envio.",
      icon: icon(ListFilter),
      placement: "bottom",
    },
    {
      selector: "camp-sub-list",
      title: "O que precisa de ação vem primeiro",
      description:
        "As receitas aguardando análise ficam no topo da lista. Depois que a votação começa, as pendentes ficam de fora dela e o grupo de receitas é fechado.",
      icon: icon(ChefHat),
      placement: "top",
    },
    {
      selector: "camp-sub-open",
      title: "Abrir para analisar",
      description:
        "No detalhe você vê fotos, vídeo e texto, e aprova ou reprova. Para reprovar, a justificativa precisa ter pelo menos 10 caracteres: o colaborador a lê e pode ajustar a receita.",
      icon: icon(ClipboardCheck),
      placement: "top",
    },
  ],

  participants: [
    {
      selector: "camp-part-toolbar",
      title: "Busque e filtre as pessoas",
      description:
        "Procure por nome, departamento, unidade ou prato. Os filtros mostram quantas pessoas há em cada grupo, como quem enviou receita e quem ainda não enviou.",
      icon: icon(Search),
      placement: "bottom",
    },
    {
      selector: "camp-part-table",
      title: "Uma tabela só",
      description:
        "Cada linha é uma pessoa, com a receita, quantos votos recebeu, a posição e se já votou. As colunas de votos aparecem de acordo com a sua permissão.",
      icon: icon(Users),
      placement: "top",
    },
    {
      selector: "camp-part-row",
      title: "Abra uma linha",
      description:
        "Toque em uma pessoa para ver a receita dela e, com a permissão certa, de quem vieram os votos. É aqui também que um voto pode ser invalidado, sempre com justificativa.",
      icon: icon(Trophy),
      placement: "top",
    },
  ],

  voting: [
    {
      selector: "camp-vote-status",
      title: "A votação está aberta ou encerrada?",
      description:
        "A situação, o período, quando ela fecha e quantos elegíveis já votaram ficam juntos aqui, sem números repetidos em outras telas.",
      icon: icon(Vote),
      placement: "bottom",
    },
    {
      selector: "camp-vote-ranking",
      title: "Ranking parcial ou oficial",
      description:
        "Votos por receita. Enquanto o vencedor não é confirmado ele aparece como Parcial, e só a gestão vê. Para saber quem votou em quem, use Participantes.",
      icon: icon(Trophy),
      placement: "top",
    },
    {
      selector: "camp-vote-controls",
      title: "Pausar, prorrogar, avisar",
      description:
        "Controles da votação em andamento. Pausar ou prorrogar nunca apaga votos nem libera a edição das receitas.",
      icon: icon(SlidersHorizontal),
      placement: "top",
    },
    {
      selector: "camp-vote-flow",
      title: "Do fim da votação ao resultado",
      description:
        "Passo a passo: encerrar, apurar, decidir empate se houver, confirmar o vencedor e divulgar. O passo que você pode fazer agora fica destacado, e a divulgação não pode ser desfeita.",
      icon: icon(ListChecks),
      placement: "top",
    },
  ],

  settings: [
    {
      selector: "camp-sec-info",
      title: "Informações e edição",
      description:
        "O que os colaboradores leem sobre a campanha. O botão Editar leva ao assistente, e salvar nunca publica nada.",
      icon: icon(IdCard),
      placement: "bottom",
    },
    {
      selector: "camp-sec-schedule",
      title: "Calendário",
      description:
        "Datas e horários de Brasília de cada etapa. Para a votação em andamento, pausar e prorrogar ficam na aba Votação.",
      icon: icon(CalendarClock),
      placement: "bottom",
    },
    {
      selector: "camp-sec-reports",
      title: "Relatórios e histórico",
      description:
        "Baixe planilhas da campanha (abrem direto no Excel) e consulte o histórico completo: quem fez o quê, quando e por quê.",
      icon: icon(FileDown),
      placement: "bottom",
    },
    {
      selector: "camp-sec-danger",
      title: "Zona de risco",
      description:
        "Voltar a rascunho, encerrar, arquivar e excluir rascunho. Cada ação pede confirmação, e as que mudam o destino da campanha ficam separadas do dia a dia.",
      icon: icon(ShieldAlert),
      placement: "top",
    },
  ],
};
