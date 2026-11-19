-- =============================================================================
-- Snapshot B (SOMENTE LEITURA): gera o texto de supabase/rollback/14b_restore_functions.sql
-- a partir das definições VIVAS das 7 funções da 14b. Rodar IMEDIATAMENTE ANTES de aplicar a 14b
-- (14a já aplicada) e gravar o resultado (uma única coluna `file_text`) no arquivo.
--
-- Lista EXPLÍCITA de nomes (nunca por padrão de nome): nenhuma função aditiva da 14a e nem o
-- campaign_publish_check entram aqui, então o rollback da 14b jamais os restaura.
--   porteiras (aceitam atraso; rollback padrão restaura ESTAS 5): collab_state, submit, finalize_submission,
--                                                                update_submission, review
--   travas   (excluem atrasadas; rollback padrão MANTÉM): cast_vote, tally
-- Cada seção é uma peça independente (create or replace + reafirmação idempotente dos privilégios).
-- =============================================================================
select string_agg(sec, E'\n' order by ord) as file_text
from (
  select v.ord,
         format(E'-- >>> SECTION %1$s (%2$s)\n%3$s;\n\nrevoke all on function public.%1$s(%4$s) from public, anon, authenticated;\ngrant execute on function public.%1$s(%4$s) to service_role;\n-- <<< END %1$s\n',
                v.name, v.grp, pg_get_functiondef(p.oid), pg_get_function_identity_arguments(p.oid)) as sec
    from (values
      ('campaign_collab_state',          'porteira', 1),
      ('campaign_submit',                'porteira', 2),
      ('campaign_finalize_submission',   'porteira', 3),
      ('campaign_update_submission',     'porteira', 4),
      ('campaign_review',                'porteira', 5),
      ('campaign_cast_vote',             'trava',    6),
      ('campaign_tally',                 'trava',    7)
    ) as v(name, grp, ord)
    join pg_proc p on p.proname = v.name and p.pronamespace = 'public'::regnamespace
) x;
