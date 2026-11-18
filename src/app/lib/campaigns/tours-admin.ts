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
    selector: "camp-module-menu",
    title: "Chave geral",
    description:
      "No menu \"⋯\" fica a chave de emergência: desligada, ninguém vê nenhuma campanha. Para controlar uma campanha só, use \"Visível para colaboradores\" no painel dela.",
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
    selector: "camp-view-toggle",
    title: "Cartões ou lista",
    description: "Escolha como ver as campanhas: cartões (melhor no celular) ou lista com colunas (melhor no computador). A escolha fica guardada neste aparelho.",
    icon: icon(LayoutList),
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
      "A mesma imagem vira o banner da Home quando a campanha for publicada — e sai de lá sozinha ao despublicar ou encerrar. É uma imagem só para todos os aparelhos, como no menu Banners; confira a prévia.",
    icon: icon(ImagePlus),
    placement: "bottom",
  },
  {
    selector: "camp-wiz-features",
    title: "O que a campanha tem",
    description:
      "Votação, sorteio, fotos e mais de uma receita por pessoa: cada uma é Sim ou Não. O que está em Não some dos dois lados — nada de votos, sorteio ou foto aparece sem ser usado.",
    icon: icon(Vote),
    placement: "bottom",
  },
  {
    selector: "camp-wiz-draw",
    title: "Sorteio",
    description:
      "Sorteia entre quem tem receita aprovada, uma chance por pessoa. Escolha de 1 a 10 ganhadores. Depois de publicada, não dá para ligar ou desligar.",
    icon: icon(Trophy),
    placement: "bottom",
  },
  {
    selector: "camp-wiz-period",
    title: "Datas",
    description:
      "Início e encerramento da participação. Com votação, aparece também o período da votação — por padrão igual ao da participação, mas você pode votar depois. Tudo abre e fecha sozinho.",
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
  {
    selector: "camp-wiz-multiple",
    title: "Mais de uma receita?",
    description:
      "Marque para cada pessoa poder enviar várias receitas (até 10). Dá para mudar até com a campanha publicada: o que já foi enviado continua como está.",
    icon: icon(ChefHat),
    placement: "top",
  },
];

/**
 * Painel de uma campanha: UMA TOUR POR ABA. Cada uma abre sozinha na primeira vez que a pessoa entra na aba
 * (para qualquer perfil) e depois só por "Ver tour". Passo cujo alvo não existe na tela é pulado — por isso
 * quem não tem uma permissão simplesmente não vê o passo correspondente.
 */
export type PanelTourKey = "summary" | "submissions" | "participants" | "voting" | "draw" | "reports" | "settings";

export const ADMIN_TOUR_TABS: Record<PanelTourKey, TourStep[]> = {
  summary: [
    {
      selector: "camp-panel-primary",
      title: "Visível para colaboradores",
      description:
        "No rascunho, o botão Publicar libera a campanha. Depois, este interruptor mostra e esconde: Não tira de exibição sem apagar nada; Sim volta a exibir. Salvar uma edição nunca publica sozinho.",
      icon: icon(MousePointerClick),
      placement: "bottom",
    },
    {
      selector: "camp-panel-tabs",
      title: "As áreas da campanha",
      description:
        "Visão geral, Receitas, Relatórios e Configurações — mais Votação e Sorteio, nas campanhas que têm — ficam aqui no topo, fixas enquanto você rola. Cada área abre a própria tour na primeira visita.",
      icon: icon(LayoutList),
      placement: "bottom",
    },
    {
      selector: "camp-panel-cycle",
      title: "Cronograma",
      description:
        "As etapas da campanha com as datas — só as que valem para ela. Para mudar as datas: Configurações → Período. Quando há algo a fazer (publicar, analisar, sortear, divulgar), um cartão de próximo passo aparece no topo; sem pendências, ele some.",
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
        "Receitas, participantes e, quando há, votos, resultado e sorteio. Toque em um indicador para abrir a tela detalhada. Durante a votação os números de votos são parciais e só a gestão vê.",
      icon: icon(Gauge),
      placement: "bottom",
    },
    {
      selector: "camp-summary-recent",
      title: "Últimas atividades",
      description: "As receitas e movimentações mais recentes, para um olhar rápido. O histórico completo está em Relatórios.",
      icon: icon(ListChecks),
      placement: "top",
    },
  ],

  submissions: [
    {
      selector: "camp-recipes-toggle",
      title: "Por receita ou por pessoa",
      description: "Por receita é onde você analisa (aprova ou reprova). Por pessoa mostra quem participa, as receitas de cada um e, com votação, os votos recebidos.",
      icon: icon(Users),
      placement: "bottom",
    },
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
        "Procure por nome, departamento, unidade ou prato. Um filtro só: Com receita (o padrão), Todos os elegíveis e, quando há votação, Já votaram e Ainda não votaram — cada um com a contagem.",
      icon: icon(Search),
      placement: "bottom",
    },
    {
      selector: "camp-part-table",
      title: "Uma tabela só",
      description:
        "Cada linha é uma pessoa, com as receitas dela (uma ou várias). Com votação, mostra se já votou e, depois do encerramento, os votos recebidos e a posição.",
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
        "A situação, o período, o total de votos e quantas pessoas já votaram ficam juntos aqui.",
      icon: icon(ThumbsUp),
      placement: "bottom",
    },
    {
      selector: "camp-vote-ranking",
      title: "Ranking ao vivo",
      description:
        "As receitas mais votadas, atualizadas sozinhas enquanto a votação está aberta. É parcial e só a gestão vê — o colaborador nunca vê ranking nem votos antes da divulgação.",
      icon: icon(Trophy),
      placement: "top",
    },
    {
      selector: "camp-vote-votes",
      title: "Votos registrados",
      description: "Quem votou em qual receita (com a permissão de ver votos). Um voto só é invalidado com justificativa, e a pessoa não ganha o direito de votar de novo.",
      icon: icon(Search),
      placement: "top",
    },
    {
      selector: "camp-vote-result",
      title: "Ver ganhador",
      description:
        "O botão fica bloqueado até o encerramento oficial da votação. Depois, um clique mostra o ganhador e o que conferir, antes de confirmar e divulgar.",
      icon: icon(Trophy),
      placement: "top",
    },
    {
      selector: "camp-result-actions",
      title: "Confirmar e divulgar",
      description:
        "Confirme o vencedor e depois divulgue agora ou programe data e hora: no horário marcado o resultado aparece e quem participou recebe um aviso. Até lá dá para alterar ou cancelar. Em caso de empate, a decisão vem antes, com justificativa.",
      icon: icon(BadgeCheck),
      placement: "top",
    },
  ],

  // Alvos "camp-draw-..." vêm do DrawTab (Fork D). Passo cujo alvo não está na tela é pulado.
  draw: [
    {
      selector: "camp-draw-status",
      title: "Situação do sorteio",
      description: "Mostra em que ponto está: aguardando, pronto para sortear, sorteado, confirmado ou divulgado. O sorteio só roda com a participação encerrada e sem receitas pendentes de análise.",
      icon: icon(Trophy),
      placement: "bottom",
    },
    {
      selector: "camp-draw-eligible",
      title: "Quem concorre",
      description: "Entram as pessoas com pelo menos uma receita aprovada, com uma chance por pessoa — mesmo com várias receitas.",
      icon: icon(Users),
      placement: "top",
    },
    {
      selector: "camp-draw-actions",
      title: "Sortear e confirmar",
      description: "O sorteio é feito de forma segura e uma única vez. Antes de confirmar dá para descartá-lo, com justificativa; depois de confirmado, nada muda.",
      icon: icon(MousePointerClick),
      placement: "top",
    },
    {
      selector: "camp-draw-winners",
      title: "Ganhadores",
      description: "Cada pessoa ganha no máximo uma vez. O resultado fica registrado no histórico.",
      icon: icon(BadgeCheck),
      placement: "top",
    },
    {
      selector: "camp-draw-schedule",
      title: "Divulgar agora ou programar",
      description: "Divulgue na hora ou programe data e hora: no horário marcado os ganhadores aparecem e quem participou recebe um aviso. Até lá dá para alterar ou cancelar.",
      icon: icon(CalendarDays),
      placement: "top",
    },
  ],

  reports: [
    {
      selector: "camp-rep-list",
      title: "Relatórios",
      description: "Baixe planilhas da campanha (abrem direto no Excel). Só aparecem os relatórios que valem para esta campanha: sem votação, nada de votos.",
      icon: icon(FileDown),
      placement: "bottom",
    },
    {
      selector: "camp-rep-book",
      title: "Livro de Receitas",
      description: "Reúne as receitas aprovadas num livro digital. Gerar não publica: confira a prévia e só então publique para os colaboradores; dá para retirar do ar quando quiser.",
      icon: icon(ChefHat),
      placement: "top",
    },
    {
      selector: "camp-rep-history",
      title: "Histórico",
      description: "Tudo o que foi feito na campanha: quem, quando e por quê.",
      icon: icon(ListChecks),
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
        "Início e encerramento da participação e, quando há votação, também os da votação. Para prorrogar, é só escolher uma nova data de encerramento.",
      icon: icon(CalendarDays),
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
