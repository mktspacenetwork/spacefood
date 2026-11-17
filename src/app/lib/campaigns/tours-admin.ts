import { createElement } from "react";
import {
  Megaphone, Power, BarChart3, FilePlus2, ListChecks, IdCard, Users, ClipboardCheck, ChefHat, Vote, MousePointerClick,
  LayoutList, Search, Trophy, FileDown, ShieldAlert, ListFilter, Gauge, ImagePlus, CalendarDays, ThumbsUp, Compass, BadgeCheck,
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

/** Cadastro da campanha (uma página só). Cada passo aponta para um bloco do formulário. */
export const ADMIN_TOUR_WIZARD: TourStep[] = [
  {
    selector: "camp-wiz-about",
    title: "Nome e descrição",
    description:
      "Só o essencial: o nome e uma descrição curta, que aparece no cartão e no banner da Home. Regras e orientações são opcionais, em “Mais detalhes”.",
    icon: icon(IdCard),
    placement: "bottom",
  },
  {
    selector: "camp-wiz-cover",
    title: "A capa é o banner da Home",
    description:
      "A mesma imagem vira o banner da Home quando a campanha for publicada — não precisa cadastrar outra. Ela é cortada na proporção do banner; confira a prévia no celular e no computador.",
    icon: icon(ImagePlus),
    placement: "bottom",
  },
  {
    selector: "camp-wiz-voting",
    title: "Tem votação?",
    description:
      "Ligue se os colaboradores vão votar nas receitas. Sem votação, a campanha só recebe participações e nada sobre votos aparece.",
    icon: icon(Vote),
    placement: "bottom",
  },
  {
    selector: "camp-wiz-period",
    title: "Início e encerramento",
    description:
      "É só isso: a participação (e a votação, se houver) abre no início e fecha sozinha no encerramento.",
    icon: icon(CalendarDays),
    placement: "top",
  },
  {
    selector: "camp-wiz-audience",
    title: "Quem participa",
    description:
      "Todos os colaboradores, ou pessoas específicas — ótimo para testar antes de abrir para todos. Salvar nunca publica: para isso há o botão Publicar no painel.",
    icon: icon(Users),
    placement: "top",
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
        "Resumo, Receitas, Participantes, Votação e Configurações ficam sempre aqui no topo, fixas enquanto você rola. Cada área abre a própria tour na primeira visita.",
      icon: icon(LayoutList),
      placement: "bottom",
    },
    {
      selector: "camp-panel-cycle",
      title: "Período e próximo passo",
      description:
        "Uma linha mostra o período e a situação. O cartão logo abaixo diz a única coisa que vale fazer agora, com um botão direto.",
      icon: icon(Compass),
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
        "Participação, receitas por situação, votos e resultado. Antes de a votação encerrar, a contagem por receita não aparece — nem para a gestão —, para não influenciar os votos.",
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
        "As receitas aguardando análise ficam no topo. Receitas aprovadas já podem receber votos e não podem mais ser editadas pelo colaborador.",
      icon: icon(ChefHat),
      placement: "top",
    },
    {
      selector: "camp-sub-open",
      title: "Abrir para analisar",
      description:
        "No detalhe você vê a foto e o texto, e aprova ou reprova. Para reprovar, a justificativa precisa ter pelo menos 10 caracteres: o colaborador a lê e pode ajustar e reenviar.",
      icon: icon(BadgeCheck),
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
        "Cada linha é uma pessoa, com a receita e se já votou. Depois do encerramento da votação aparecem também os votos recebidos e a posição.",
      icon: icon(Users),
      placement: "top",
    },
    {
      selector: "camp-part-row",
      title: "Abra uma linha",
      description:
        "Toque em uma pessoa para ver a receita dela e, depois do encerramento e com a permissão certa, de quem vieram os votos. Um voto só pode ser invalidado com justificativa.",
      icon: icon(Trophy),
      placement: "top",
    },
  ],

  voting: [
    {
      selector: "camp-vote-status",
      title: "A votação está aberta ou encerrada?",
      description:
        "A situação, o período e quantas pessoas já votaram ficam juntos aqui. A contagem por receita fica de fora até o encerramento.",
      icon: icon(ThumbsUp),
      placement: "bottom",
    },
    {
      selector: "camp-vote-result",
      title: "Ver resultado",
      description:
        "O botão fica bloqueado até a votação encerrar: antes disso ninguém vê quem está na frente. Depois, um clique mostra o vencedor, o ranking e o que conferir.",
      icon: icon(Trophy),
      placement: "top",
    },
    {
      selector: "camp-result-actions",
      title: "Confirmar e divulgar",
      description:
        "Confirme o vencedor e, quando quiser, divulgue para os colaboradores. Em caso de empate, a decisão vem antes, com justificativa. A divulgação não pode ser desfeita.",
      icon: icon(BadgeCheck),
      placement: "top",
    },
  ],

  settings: [
    {
      selector: "camp-sec-info",
      title: "Informações e edição",
      description:
        "O que os colaboradores leem sobre a campanha. O botão Editar leva ao cadastro, e salvar nunca publica nada.",
      icon: icon(IdCard),
      placement: "bottom",
    },
    {
      selector: "camp-sec-period",
      title: "Período",
      description:
        "Início e encerramento da campanha. Para prorrogar, é só escolher uma nova data de encerramento.",
      icon: icon(CalendarDays),
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
