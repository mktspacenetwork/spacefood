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
