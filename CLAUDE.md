# SpaceFood

Sistema de pedidos de almoço corporativo. Frontend React + Vite, backend em Supabase Edge Function (Hono) com KV store, Supabase Auth para usuários.

## Conceitos de domínio (não óbvios pelo código)

- **Sede Damasceno** — unidade com pedido online real (`consumptionMode: dine_in_damasceno`, `isManualLog: false`).
- **Sede Taipas** — unidade **sem** cozinha própria. Não faz "pedido", faz **registro** do que comeu (diário alimentar), com `isManualLog: true`. Historicamente isso já causou bugs de contagem por confundir "registro" com "pedido" — sempre checar `isManualLog` ao mexer em métricas.
- **Externo (Marmita)** — unidade só de retirada.
- Unidades são configuráveis em Configurações (`settings.units`), cada uma com `allowOrders: boolean`. Quando `false`, a tela de Check-in vira um roster manual em vez de lista de pedidos.
- **`checkin.unit`** é a fonte da verdade de "onde a pessoa comeu de fato" — pode divergir do `consumptionMode` do pedido original via o botão **"Alterar Sede"** no Check-in (ex: pediu como Damasceno mas comeu na Taipas). Isso NUNCA deve alterar o pedido original — só o registro de check-in do dia. O Controle de Desperdício usa `checkin.unit` para calcular consumo real por unidade.

## Deploy

Backend (toda vez que `supabase/functions/server/index.tsx` muda):
```bash
npx supabase functions deploy make-server-c3078087 --project-ref revxdizgphrntekspvkm --use-api --no-verify-jwt
```
Frontend: build via Vite (`npm run build`), sem pipeline de deploy automático confirmado neste projeto — confirmar com o usuário como o build chega a produção antes de assumir que um push já é suficiente.

## Sistema de permissões — cuidado com isso

- Permissões vivem em roles customizadas (`roles:list` no KV) OU, na ausência de role atribuída, num fallback por `auth.role` (`admin`/`kitchen`) em `/admin/my-permissions` (`supabase/functions/server/index.tsx`).
- **Nenhum usuário real tem role customizada atribuída hoje** — todo mundo resolve pelo fallback bruto por `auth.role`. Isso é o caminho que realmente importa em produção, não as roles nomeadas (Master/Admin/Cozinha/Cozinha Taipas) que aparecem em Usuários & Permissões.
- **Regra crítica ao adicionar qualquer permKey nova**: sempre grave `true`/`false` explícito para TODAS as chaves em `ALL_PERM_KEYS`, nunca deixe uma chave ausente do objeto. Já existiu um bug sério onde "ausente" era silenciosamente tratado como "permitido" — isso fazia roles aparentemente restritas (ex: Cozinha com 7/17 marcadas) terem acesso de fato a tudo mais (Usuários, Configurações, Banners, Logs). Corrigido em 2026-07-29, mas qualquer novo permKey precisa continuar seguindo essa regra nos dois lados (frontend `PERM_GROUPS` em `AdminUsers.tsx` e backend `ALL_PERM_KEYS` em `index.tsx` — as duas listas precisam ficar em sincronia).
- Ao criar uma página/feature admin nova: adicionar o item em `AdminLayout.tsx` (MENU_GROUPS) E em `AdminUsers.tsx` (PERM_GROUPS) E no backend `ALL_PERM_KEYS`. Fazer só um dos três já causou inconsistência antes.

## Preferências de trabalho do usuário (Cleiton)

- Nunca fazer `git commit`/`git push` sem pedir explicitamente — mesmo depois de implementar e verificar algo, esperar confirmação antes de subir.
- Sempre verificar mudanças de UI rodando o dev server e testando no browser (preview) antes de reportar como concluído — não confiar só em leitura de código.
- Ao encontrar um problema de escopo maior durante uma tarefa pontual (ex: bug estrutural de permissões descoberto enquanto verificava se features estavam disponíveis), perguntar antes de corrigir se a correção for arriscada/abrangente — mas prosseguir direto quando a correção for de baixo risco e claramente alinhada ao pedido.
- Prefere que eu analise pedidos de mudança quanto a conflitos com a dinâmica do sistema ANTES de implementar, e pergunte se encontrar problema — não simplesmente implementar ao pé da letra.
- Projeto tem dados reais de produção (nomes de colaboradores reais) — qualquer teste que altere estado (ex: testar "Alterar Sede") deve ser revertido depois de verificado.

## Pendências conhecidas (não solicitadas ainda nesta fase, mas mapeadas)

Havia um plano (`wild-bouncing-wall.md`, não versionado) com itens ainda não implementados:
- Pedidos cancelados possivelmente contados em algumas KPIs do Dashboard (verificar se ainda se aplica após as correções de 2026-07).
- Bug: `user?.name.split(" ")` sem optional chaining em `Menu.tsx` (~linha 626) — risco de crash se `user.name` for undefined.
- Bug: `OrderBanner.tsx` (~linha 71) `order.items.map()` sem fallback para `items` undefined.
- Melhorias do diário alimentar da Taipas: ocultar badge de "Encerrado" pra quem não tem cutoff, permitir registro retroativo (dias anteriores), avaliação adaptada pro fluxo de registro.
- Banners por unidade (`unitRestrictions` no Banner, hoje só existe em MenuItem).
- AdminOrders sem separação visual clara entre "Pedidos" e "Registros" (Taipas) na mesma lista.

Confirmar com o usuário se algum desses já foi resolvido antes de assumir que ainda é válido — este arquivo pode ficar desatualizado.
