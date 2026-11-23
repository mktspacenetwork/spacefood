import { createElement } from "react";
import {
  Megaphone, Power, FilePlus2, ListChecks, IdCard, Users, ClipboardCheck, ChefHat, Vote, MousePointerClick,
  LayoutList, Search, Trophy, FileDown, ShieldAlert, ListFilter, Gauge, ImagePlus, CalendarDays, ThumbsUp, Compass, BadgeCheck,
  BookOpen, Radio, History as HistoryIcon, ArchiveRestore,
} from "lucide-react";
import type { TourStep } from "../../components/campaigns/CampaignTour";

const icon = (Icon: typeof Megaphone) => createElement(Icon, { size: 20 });

/** Lista de campanhas (visão geral do módulo). Alvos: data-tutorial="camp-..." */
export const ADMIN_TOUR_OVERVIEW: TourStep[] = [
  {
    title: "Bem-vindo às Campanhas",
    description:
      "Aqui você cria e acompanha as campanhas em andamento, como o concurso de receitas. As concluídas, desativadas e excluídas ficam no Histórico de campanhas. Esta tour mostra o caminho — e pode ser reaberta a qualquer momento em \"Ver tour\".",
    icon: icon(Megaphone),
  },
  {
    selector: "camp-section-nav",
    title: "Campanhas, Livro de Receitas e Histórico",
    description:
      "As áreas ficam lado a lado, aqui no topo: Campanhas (só as ativas), Livro de Receitas e Histórico de campanhas — onde estão as concluídas, desativadas e excluídas. A aba Livro de Receitas aparece para quem tem permissão de revisar ou publicar o Livro de Receitas.",
    icon: icon(BookOpen),
    placement: "bottom",
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
      "Aqui ficam só as campanhas ativas: rascunhos, agendadas, no ar e as que aguardam o resultado (com votação, a campanha só é concluída depois da divulgação). Toque no nome, ou no menu \"⋯\" em \"Gerenciar\", para analisar receitas, acompanhar a votação e divulgar o resultado. No mesmo menu estão Publicar/Desativar, Editar, Duplicar e Excluir. Desativada, concluída ou excluída, a campanha vai para o Histórico de campanhas.",
    icon: icon(ListChecks),
    placement: "top",
  },
];

/**
 * Histórico de campanhas (/admin/campaigns/historico). Alvos: data-tutorial="camp-history-..." (o cartão e as ações
 * são os do primeiro item da lista; sem campanhas no histórico esses passos são pulados).
 */
export const ADMIN_TOUR_HISTORY: TourStep[] = [
  {
    title: "Histórico de campanhas",
    description:
      "Aqui ficam as campanhas que saíram da lista principal: concluídas, desativadas e excluídas. Nada é apagado — receitas, votos, resultados e histórico continuam consultáveis.",
    icon: icon(HistoryIcon),
  },
  {
    selector: "camp-history-categories",
    title: "Concluídas, Desativadas e Excluídas",
    description:
      "Cada botão mostra a contagem. Concluída: o período acabou (com votação, só depois da divulgação do resultado) ou ela foi encerrada ou arquivada. Desativada: você a tirou do ar. Excluída: está oculta e dá para restaurar.",
    icon: icon(ListFilter),
    placement: "bottom",
  },
  {
    selector: "camp-history-filters",
    title: "Busque e filtre",
    description:
      "Busque pelo nome e filtre pela data da situação (quando foi concluída, desativada ou excluída), pela votação e pelo resultado. As contagens acompanham os filtros. No celular, os filtros ficam atrás do botão \"Filtros\".",
    icon: icon(Search),
    placement: "bottom",
  },
  {
    selector: "camp-history-card",
    title: "Situação, data e responsável",
    description:
      "Cada cartão mostra a situação, o resultado (quando há votação), as datas, quantas receitas e votos, e quando e por quem a campanha mudou de situação — ou \"automático\", quando foi pelo fim do período.",
    icon: icon(BadgeCheck),
    placement: "top",
  },
  {
    selector: "camp-history-actions",
    title: "O que dá para fazer",
    description:
      "Abrir e Relatórios consultam tudo da campanha; Duplicar cria uma cópia em rascunho. Reativar (campanhas desativadas) e Restaurar (excluídas) devolvem a campanha à lista principal, sem reabrir períodos já encerrados.",
    icon: icon(ArchiveRestore),
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
      "A mesma imagem vira o banner da Home quando a campanha for publicada — e sai de lá sozinha ao desativar ou encerrar. É uma imagem só para todos os aparelhos, como no menu Banners. Aqui você também define título, descrição, botão, fundo e cor do texto, igual ao menu Banners; confira a prévia.",
    icon: icon(ImagePlus),
    placement: "bottom",
  },
  {
    selector: "camp-wiz-features",
    title: "O que a campanha tem",
    description:
      "Votação, fotos e mais de uma receita por pessoa: cada uma é Sim ou Não. O que está em Não some dos dois lados. A votação pode ser ligada ou desligada até com a campanha publicada — os votos já registrados ficam guardados.",
    icon: icon(Vote),
    placement: "bottom",
  },
  {
    selector: "camp-wiz-period",
    title: "Datas",
    description:
      "Com votação, são três datas em sequência: participação, votação e divulgação do resultado. A votação só começa depois do fim da participação, e a divulgação depois do fim da votação. Sem votação, só a participação. Tudo abre e fecha sozinho.",
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
export type PanelTourKey = "summary" | "submissions" | "participants" | "results" | "reports" | "settings";

export const ADMIN_TOUR_TABS: Record<PanelTourKey, TourStep[]> = {
  summary: [
    {
      selector: "camp-panel-primary",
      title: "Visível para colaboradores",
      description:
        "No rascunho, o botão Publicar libera a campanha. Depois, este interruptor mostra e esconde: Não desativa (a campanha sai da lista principal e vai para o Histórico, sem apagar nada); Sim reativa, sem reabrir períodos já encerrados. Salvar uma edição nunca publica sozinho.",
      icon: icon(MousePointerClick),
      placement: "bottom",
    },
    {
      selector: "camp-panel-tabs",
      title: "As áreas da campanha",
      description:
        "Visão geral, Receitas, Relatórios e Configurações — mais Resultados, nas campanhas com votação — ficam aqui no topo, fixas enquanto você rola. Cada área abre a própria tour na primeira visita.",
      icon: icon(LayoutList),
      placement: "bottom",
    },
    {
      selector: "camp-panel-cycle",
      title: "Cronograma",
      description:
        "As datas da campanha: participação e, com votação, a votação e a divulgação do resultado, em sequência. Para mudar: Configurações → Período. Quando há algo a fazer (publicar, analisar receitas, divulgar), um cartão de próximo passo aparece no topo; sem pendências, ele some.",
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
        "Participantes e receitas cadastradas e, nas campanhas com votação, a votação e o resultado. Toque em um indicador para abrir a tela detalhada. Durante a votação os números são parciais. A situação da campanha fica no cabeçalho do painel.",
      icon: icon(Gauge),
      placement: "bottom",
    },
    {
      selector: "camp-summary-recent",
      title: "Últimas atividades",
      description: "No fim da página, as cinco movimentações mais recentes, para um olhar rápido. O histórico completo está em Relatórios.",
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
        "Filtre por situação (com a contagem de cada uma) — e por \"Fora do prazo\", quando houver —, busque por prato ou participante e, se precisar, limite por data de envio.",
      icon: icon(ListFilter),
      placement: "bottom",
    },
    {
      selector: "camp-sub-list",
      title: "O que precisa de ação vem primeiro",
      description:
        "As receitas aguardando análise ficam no topo. Receitas aprovadas já podem receber votos e não podem mais ser editadas pelo colaborador. Em campanhas com votação, quem envia depois do encerramento da participação (até o resultado ser divulgado) recebe o selo \"Fora do prazo\": a receita é aceita e pode ser aprovada, mas não entra na votação, no ranking nem no resultado.",
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
        "Procure por nome, departamento, unidade ou prato. Um filtro só: Com receita (o padrão), Todos os elegíveis, Com receita fora do prazo (quando houver) e, quando há votação, Já votaram e Ainda não votaram — cada um com a contagem.",
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
        "Toque em uma pessoa para ver a receita dela e, depois do encerramento e com a permissão certa, de quem vieram os votos. Receita \"Fora do prazo\" não participa da votação e não recebe votos. Um voto só pode ser invalidado com justificativa.",
      icon: icon(Trophy),
      placement: "top",
    },
  ],

  results: [
    {
      selector: "camp-results-steps",
      title: "O caminho até o resultado",
      description:
        "Cinco passos, em ordem: votos, ranking, apuração, confirmar o ganhador e divulgar. O resultado passa por Em apuração, Definido (ganhador confirmado) e Divulgado — confirmar e divulgar são ações separadas.",
      icon: icon(Compass),
      placement: "bottom",
    },
    {
      selector: "camp-vote-status",
      title: "Acompanhe a votação",
      description: "A situação, o total de votos e quantas pessoas já votaram ficam juntos aqui. As datas da votação vêm de Configurações → Período.",
      icon: icon(ThumbsUp),
      placement: "bottom",
    },
    {
      selector: "camp-vote-ranking",
      title: "Ranking ao vivo",
      description:
        "A posição, os votos, a receita e quem a enviou, em tempo real: atualiza sozinho a cada 20 segundos, com \"Ao vivo\" e a hora da última atualização. Empates dividem a posição (1º, 1º, 3º). Receitas \"Fora do prazo\" não entram. É parcial: por padrão só a gestão vê.",
      icon: icon(Trophy),
      placement: "top",
    },
    {
      selector: "camp-results-partial",
      title: "Mostrar o parcial aos colaboradores?",
      description:
        "Desligado, só a gestão vê o ranking parcial. Ligado, aparece o item Ranking para os colaboradores, com posições e votos, e ele pode continuar visível depois do encerramento da votação, até a divulgação do resultado oficial. Ao desligar, o item some para eles em até 1 minuto. Só quem pode divulgar resultados altera.",
      icon: icon(Megaphone),
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
        "O botão fica bloqueado até o encerramento da votação. Depois, um clique mostra o ganhador e o que conferir. Em caso de empate, a decisão vem primeiro, com justificativa.",
      icon: icon(Trophy),
      placement: "top",
    },
    {
      selector: "camp-result-actions",
      title: "Confirmar e divulgar",
      description:
        "Primeiro confirme o ganhador (os votos param de mudar). Depois divulgue agora, ou deixe a divulgação automática na data de anúncio — ela só acontece se o ganhador já estiver confirmado até lá.",
      icon: icon(BadgeCheck),
      placement: "top",
    },
  ],

  reports: [
    {
      selector: "camp-rep-dashboard",
      title: "Dashboard ao vivo",
      description:
        "Os números e gráficos da campanha se atualizam sozinhos a cada 20 segundos enquanto a página está aberta e visível. \"Ao vivo\" e \"Atualizado às\" mostram a hora da última leitura — não precisa recarregar.",
      icon: icon(Radio),
      placement: "bottom",
    },
    {
      selector: "camp-rep-cards",
      title: "Cartões do dashboard",
      description:
        "Participantes, receitas enviadas, aprovadas, reprovadas e, nas campanhas com votação, votos e receitas fora do prazo. Toque em um cartão para ir à tela correspondente.",
      icon: icon(Gauge),
      placement: "bottom",
    },
    {
      selector: "camp-rep-list",
      title: "Planilhas por período",
      description:
        "Baixe planilhas da campanha (abrem direto no Excel) e escolha o período: todo o período, hoje, últimos 7 ou 30 dias, ou datas personalizadas. Cada planilha filtra pela data certa: envio, análise, voto ou evento. O relatório de resultado ignora o período, e o dashboard não muda com ele. Sem votação, nada de votos.",
      icon: icon(FileDown),
      placement: "bottom",
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
        "Participação, votação e divulgação do resultado, em sequência: a votação só começa depois do fim da participação, e a divulgação depois do fim da votação (sem intervalo, só um aviso). Campanhas antigas de janela única seguem com a votação acompanhando a participação, até você definir datas próprias. Para prorrogar, escolha uma nova data de encerramento.",
      icon: icon(CalendarDays),
      placement: "bottom",
    },
    {
      selector: "camp-sec-danger",
      title: "Zona de risco",
      description:
        "Voltar a rascunho, encerrar, arquivar e excluir a campanha. Excluir nunca apaga: a campanha fica oculta em Histórico de campanhas › Excluídas e dá para restaurar. Cada ação pede confirmação, e as que mudam o destino da campanha ficam separadas do dia a dia.",
      icon: icon(ShieldAlert),
      placement: "top",
    },
  ],
};
