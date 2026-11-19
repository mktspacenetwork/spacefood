# Rollback da rodada 5 (migrações 14a/14b)

Arquivos (gerados e testados pelo harness: ver test-rodada5-a.mjs):

| Arquivo | Para quê |
|---|---|
| `14a_restore_publish_check.sql` | Snapshot A (antes da 14a). Só reverte a 14a4. Nunca entra no rollback da 14b. |
| `14b_snapshot_query.sql` | Consulta SOMENTE LEITURA que gera `14b_restore_functions.sql` (rodar imediatamente antes da 14b). |
| `14b_restore_functions.sql` | Snapshot B: 7 seções (5 porteiras + 2 travas), uma peça por chamada. |
| `14_expected_hashes.json` | Hash esperado (md5 do corpo sem CR) por função e por peça. |
| `14_state_check.sql` | Estado vivo (ANTES / 14a / 14b / DESCONHECIDO) + peças registradas no histórico. |

**Rollback padrão da 14b:** restaurar SÓ as 5 porteiras, em ordem — `campaign_collab_state`, `campaign_submit`,
`campaign_finalize_submission`, `campaign_update_submission`, `campaign_review` — cada uma como uma peça
(`apply_migration` com nome `campaigns_14b_rollback_<função>`), conferindo o hash. MANTER `campaign_cast_vote` e
`campaign_tally`. Permanecem: `campaign_publish_check` (14a), funções aditivas, gatilhos, coluna e dados.
O histórico de migrações só recebe linhas novas (nunca se apaga).

**Aplicação:** peças 14a1..14a4 e 14b1..14b7 (uma função por peça na 14b), na ordem; `14b7` (collab_state) é o interruptor
final. Depois de cada peça: `list_migrations` tem o nome, o hash vivo bate com `14_expected_hashes.json`, ACL só para service_role.
Peça falhou ou divergiu: parar e reaplicar a MESMA peça (idempotente) com o sufixo `_retry`.
NÃO usar `supabase db push` (as versões do histórico não são as dos arquivos).

## Aviso "Nova campanha" (peças 15a, 15b e 15c)

- 15a (backfill no log) e 15b (função `campaign_run_open_notices` + job `campaign-run-open-notices`) foram aplicadas e **revertidas pela 15c** (`select cron.unschedule(...)` + `drop function`): o job duplicaria o interruptor "Avisar os colaboradores agora" da tela Publicar e ignoraria a escolha de não avisar. Nenhum aviso foi enviado. Hoje o aviso é só o interruptor (ligado por padrão).

## Excluir campanha = ocultar (peças 16a e 16b)

- 16a: colunas `campaigns.deleted_at`/`deleted_by` + gatilho `campaign_deleted_guard_upd` (nenhuma alteração numa campanha excluída, exceto restaurar). 16b: `campaign_soft_delete(p_actor, p_campaign, p_confirm)` e `campaign_restore(p_actor, p_campaign)`.
- **Rollback:** `drop function public.campaign_soft_delete(jsonb, uuid, text); drop function public.campaign_restore(jsonb, uuid);` e, se preciso, `drop trigger campaign_deleted_guard_upd on public.campaigns; drop function public.campaign_deleted_guard();` (a coluna pode ficar). Restaure antes as campanhas excluídas (com o gatilho ativo só `campaign_restore` altera uma campanha excluída). Nada é apagado por essas peças.
- **Atenção:** a suíte `test-rodada5-a.mjs` do harness NÃO deve regravar estes arquivos (o snapshot B daqui é o de PRODUÇÃO): ela agora escreve numa pasta temporária.

