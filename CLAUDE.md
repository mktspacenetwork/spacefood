# SpaceFood

Sistema de pedidos de almoço corporativo. Frontend React + Vite, backend em Supabase Edge Function (Hono) com KV store, Supabase Auth para usuários.

## Conceitos de domínio (não óbvios pelo código)

- **Sede Damasceno** — unidade com pedido online real (`consumptionMode: dine_in_damasceno`, `isManualLog: false`).
- **Sede Taipas** — unidade **sem** cozinha própria. Não faz "pedido", faz **registro** do que comeu (diário alimentar), com `isManualLog: true`. Historicamente isso já causou bugs de contagem por confundir "registro" com "pedido" — sempre checar `isManualLog` ao mexer em métricas.
- **Externo (Marmita)** — unidade só de retirada.
- Unidades são configuráveis em Configurações (`settings.units`), cada uma com `allowOrders: boolean`. Quando `false`, a tela de Check-in vira um roster manual em vez de lista de pedidos.
- **`order.menuDate` (dia da refeição) vs `order.date` (quando o pedido foi criado)** — são diferentes sempre que alguém faz pedido antecipado, o que é comum aqui. Qualquer número de produção/demanda ("quanto cozinhar no dia X") tem que filtrar por `menuDate`; `date` só serve pra "quando a pessoa pediu". O índice `orders-daily:{data}` do backend já é chaveado por `menuDate`, então KDS e Pedidos acertam de graça — o risco está em telas que filtram a lista completa no frontend. Já causou o "Balanço do Dia" (Relatórios) mostrar 427 porções onde a demanda real do dia era 182, porque contava os antecipados feitos naquele dia. Corrigido em 2026-08-03.
- **`checkin.unit`** é a fonte da verdade de "onde a pessoa comeu de fato" — pode divergir do `consumptionMode` do pedido original via o botão **"Alterar Sede"** no Check-in (ex: pediu como Damasceno mas comeu na Taipas). Isso NUNCA deve alterar o pedido original — só o registro de check-in do dia. O Controle de Desperdício usa `checkin.unit` para calcular consumo real por unidade.

## Deploy

Backend (toda vez que `supabase/functions/server/index.tsx` muda):
```bash
npx supabase functions deploy make-server-c3078087 --project-ref revxdizgphrntekspvkm --use-api --no-verify-jwt
```
Frontend: automático via GitHub Actions (`.github/workflows/deploy.yml`) — todo push em `main` builda com `npm run build` e publica via `./scripts/deploy.sh` (swap atômico de symlink no nginx, runner self-hosted `spacefood`). Ou seja, um `git push` para `main` já é suficiente para ir a produção; não precisa de passo manual. Confirmar via `gh run list --workflow=deploy.yml` se precisar verificar se um deploy específico rodou/passou.

## Sistema de permissões — cuidado com isso

- Permissões vivem em roles customizadas (`roles:list` no KV) OU, na ausência de role atribuída, num fallback por `auth.role` (`admin`/`kitchen`) em `/admin/my-permissions` (`supabase/functions/server/index.tsx`).
- **Nenhum usuário real tem role customizada atribuída hoje** — todo mundo resolve pelo fallback bruto por `auth.role`. Isso é o caminho que realmente importa em produção, não as roles nomeadas (Master/Admin/Cozinha/Cozinha Taipas) que aparecem em Usuários & Permissões.
- **Regra crítica ao adicionar qualquer permKey nova**: sempre grave `true`/`false` explícito para TODAS as chaves em `ALL_PERM_KEYS`, nunca deixe uma chave ausente do objeto. Já existiu um bug sério onde "ausente" era silenciosamente tratado como "permitido" — isso fazia roles aparentemente restritas (ex: Cozinha com 7/17 marcadas) terem acesso de fato a tudo mais (Usuários, Configurações, Banners, Logs). Corrigido em 2026-07-29, mas qualquer novo permKey precisa continuar seguindo essa regra nos dois lados (frontend `PERM_GROUPS` em `AdminUsers.tsx` e backend `ALL_PERM_KEYS` em `index.tsx` — as duas listas precisam ficar em sincronia).
- Ao criar uma página/feature admin nova: adicionar o item em `AdminLayout.tsx` (MENU_GROUPS) E em `AdminUsers.tsx` (PERM_GROUPS) E no backend `ALL_PERM_KEYS`. Fazer só um dos três já causou inconsistência antes.
- **(2026-07-30) O backend agora também confere `permKey`, não só o frontend.** Antes, as rotas `/admin/*` só checavam `role` genérico (`requireAdmin`/`requireAdminOrKitchen`) — a página podia estar escondida no menu, mas a API por trás continuava aberta pra quem soubesse chamar direto. Agora a maioria usa `requirePermission(c, 'permKey')` (ver `resolveUserPermissions` em `index.tsx`, mesma lógica de `/admin/my-permissions`, então os dois nunca divergem). Ao adicionar uma rota admin nova, use `requirePermission` com o `permKey` correspondente, não `requireAdmin` puro — a não ser que a rota seja genuinamente sem permKey (utilitária, ex: upload de imagem, CSV import, cleanup, inbox interno — essas ficaram só com `requireAdmin`/`requireAdminOrKitchen` mesmo, mapeamento de permKey pra elas era ambíguo demais pra arriscar).
- `AdminLayout.tsx`: se a chamada a `/admin/my-permissions` falhar de vez (não só durante o carregamento inicial), o comportamento agora é negar por padrão (`permStatus === 'error'`), não liberar tudo — antes uma instabilidade de rede escondida atrás de um `.catch(() => null)` tinha o mesmo efeito de "sem permissões configuradas".

## Preferências de trabalho do usuário (Cleiton)

- Nunca fazer `git commit`/`git push` sem pedir explicitamente — mesmo depois de implementar e verificar algo, esperar confirmação antes de subir.
- Sempre verificar mudanças de UI rodando o dev server e testando no browser (preview) antes de reportar como concluído — não confiar só em leitura de código.
- Ao encontrar um problema de escopo maior durante uma tarefa pontual (ex: bug estrutural de permissões descoberto enquanto verificava se features estavam disponíveis), perguntar antes de corrigir se a correção for arriscada/abrangente — mas prosseguir direto quando a correção for de baixo risco e claramente alinhada ao pedido.
- Prefere que eu analise pedidos de mudança quanto a conflitos com a dinâmica do sistema ANTES de implementar, e pergunte se encontrar problema — não simplesmente implementar ao pé da letra.
- Projeto tem dados reais de produção (nomes de colaboradores reais) — qualquer teste que altere estado (ex: testar "Alterar Sede") deve ser revertido depois de verificado.

## Ferramentas de qualidade (adicionadas 2026-07-30)

- `npm run typecheck` (`tsc --noEmit`) — projeto passa limpo (0 erros) e roda no CI (`pr-checks.yml` e `deploy.yml`), antes do build. Rodar localmente antes de mudanças grandes em tipos/props.
- Ainda não há ESLint/Prettier nem testes automatizados — nenhum dos dois foi configurado (decisão consciente: exigem escolhas de estilo/framework que não foram validadas com o usuário, e rodar lint pela primeira vez tende a estourar um volume grande de avisos pra triar). Considerar como próximo passo se o projeto crescer.
- Dependências mortas removidas: `@mui/material`, `@mui/icons-material`, `@emotion/*`, `@popperjs/core`, `react-popper` (0 usos reais — o projeto usa Radix + Tailwind). Se algo precisar de um popover/tooltip posicionado, já existe `@radix-ui/react-popover`/`@radix-ui/react-tooltip` — não reinstalar Popper.
- Rotas admin (`src/app/routes.tsx`) são `React.lazy` — cada página de admin vira um chunk separado, baixado só quando o usuário navega até lá. Cardápio/Carrinho (uso diário de todo mundo) continuam eager.

## Gerenciador de Campanhas (adicionado 2026-11-17)

Módulo aditivo (concurso de receitas "Café Especial | Memórias Afetivas" é a 1ª campanha; o motor é reutilizável). Não toca nas tabelas/KV existentes.

- **Banco**: 11 tabelas `campaign_*` + ~62 funções `campaign_*` (`SECURITY DEFINER`), RLS ligado, **sem grants** para `anon`/`authenticated`; `service_role` só tem `SELECT` — toda escrita passa pelas funções. Migrações em `supabase/migrations/2026111710000{1..5}_campaigns_*.sql` (aplicadas em produção via MCP com os nomes `campaigns_1_schema` … `campaigns_5_grants_rls`; a 3 foi aplicada em pedaços 3a–3e). Regras críticas vivem **no banco**, não na API: 1 receita e 1 voto por colaborador (UNIQUE), sem voto na própria receita, voto irreversível, edição travada quando a votação começa (`edit_locked_at`, nunca desfeito), justificativa ≥ 10 caracteres, auditoria append-only (`campaign_audit_log`).
- **API**: Edge Function **separada** `campaigns-api` (`supabase/functions/campaigns-api/index.ts`, `verify_jwt=false`, autentica pelo header `X-User-Auth-Token`). Deploy independente da função principal: `npx supabase functions deploy campaigns-api --project-ref revxdizgphrntekspvkm --use-api --no-verify-jwt` (ou MCP `deploy_edge_function`). Mídia vai direto ao bucket privado `make-c3078087-campaigns` por URL assinada; o servidor confere tamanho e *magic bytes* antes de aceitar.
- **Nada aparece para colaborador até um admin clicar em "Publicar"**: chave geral `campaign_settings.enabled` (padrão `false`) + publicação por campanha (`status='authorized'`, `visible_from`). Publicar liga a chave. "Suspender" esconde sem apagar nada.
- **Acesso admin NÃO usa os permKeys do site** (`ALL_PERM_KEYS`, `AdminUsers`, `user_metadata.role` não são consultados): vem da lista própria `campaign_admins` (17 chaves `campaigns*`, gerenciadas na aba "Acesso" do módulo, exige `campaigns_access`). Hoje só Heitor e Cleiton estão nela. O item do `AdminLayout` aparece conforme `/campaigns-api/admin/me`; o item "Campanhas" do `AppLayout` conforme `/campaigns-api/campaigns/availability` (módulo ligado **e** campanha visível para a pessoa).
- Tour guiada própria (`components/campaigns/CampaignTour.tsx`, seletores `data-tutorial="camp-..."`); não altera o `OnboardingTutorial` do cardápio.
- Notificações: só in-app (KV `notifications:user:{id}`, deduplicadas por `campaign_notification_log`); **sem push** nesta versão. Exportações: CSV (`;` + BOM, neutraliza fórmulas); sem `.xlsx` ainda (não há lib de planilha no projeto).
- **Antes de abrir para todo mundo** seguem valendo os achados C2 (role editável pelo próprio usuário em `user_metadata`, afeta as rotas admin do site) e C10 (`POST /signup` público e troca de e-mail sem confirmação — "1 voto por pessoa" vale por conta). O módulo novo não depende de C2, mas C10 afeta a integridade do voto.

## Pendências conhecidas

- `react-router` e `vite` têm CVEs conhecidas que exigem bump de versão maior (fora do range declarado em `package.json`) — não apliquei `npm audit fix --force` sem testar; avaliar upgrade dedicado depois.
- Ligar "Leaked Password Protection" no Supabase Auth (Authentication → Policies) — não há ferramenta de MCP pra isso, é manual no dashboard.
- Rotas admin utilitárias sem `permKey` (mapeamento ambíguo demais pra arriscar): `/admin/abstentions`, `/admin/menu/published`, `/admin/upload`, `/admin/generate-ai-image`, `/admin/pwa-icon`, `/admin/inbox/*`, `/admin/cleanup`, `/admin/export`, `/admin/menu/import-csv` — continuam só com `requireAdmin`/`requireAdminOrKitchen` genérico, sem regressão em relação ao que já era antes.

Os itens antigos desta seção (pedidos cancelados nas KPIs, crash em `user?.name.split`, fallback do `OrderBanner`, diário da Taipas, banners por unidade, separação Pedidos/Registros no AdminOrders) foram todos confirmados corrigidos em 2026-07-30.
