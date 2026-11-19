-- =============================================================================
-- ESTADO DAS MIGRAÇÕES 14a/14b (SOMENTE LEITURA). Mostra, por função, o hash vivo e a versão a que corresponde:
--   ANTES (ainda a de produção anterior à rodada 5), 14a, 14b ou DESCONHECIDO (alguém mexeu fora do plano: PARAR e investigar).
-- Retomar = aplicar a próxima peça cuja função ainda está em ANTES, sem pular a ordem. O hash é
-- md5(replace(prosrc, chr(13), '')) e os valores vêm de 14_expected_hashes.json.
-- =============================================================================
-- == 1) funções
with exp(name, phase, before_md5, after_md5) as (values
    ('campaign_cast_vote', '14b', '5d5d78c103e5abc723425b0796f2e79e', '496818710827a6237fec7319a84c2083'),
    ('campaign_collab_state', '14b', '85c5ddddfbee12cfb5c575f5f1a02563', 'dfedf2875b8d0d65163d30f0dbac12a7'),
    ('campaign_finalize_submission', '14b', '8ff04220060252498aa907f19df32b40', 'a7df65f755f683b62305d483bfd7a226'),
    ('campaign_publish_check', '14a', '1df3b6d29b7b7ff360ba6674fb0b22c1', '55c918175c90220c629f6ab5131f435c'),
    ('campaign_review', '14b', '586224c13cd90484e1edaa4cd1f6ae18', 'e9407384ad569b5a162e29ffe4319c77'),
    ('campaign_submit', '14b', 'f6bfc682bf4edfb4847b57eb77b7fa7e', '646dbffe919e5ffa74fe5051e0c56353'),
    ('campaign_tally', '14b', '093df0c872a6803ed2b614fa107b3127', 'ff167c7de7a2abfa22cc775d3287eb43'),
    ('campaign_update_submission', '14b', '6d873fe00a0a2ef7565b0eb2c9a4b87c', 'b78447032ffd99142b646b5d6ccec9ae'),
    ('campaign_late_window', '14a', null::text, 'bd3beb2e7dfacf0ee4c481213beb7e4b'),
    ('campaign_set_schedule', '14a', null::text, '69697e969e62cf85901ef42c5a49a568'),
    ('campaign_analytics', '14a', null::text, 'e76641c058d3bcf7052793e3e33c32ce'),
    ('campaign_tally_period', '14a', null::text, 'd61aad2a9394b67afbb9f46397dadcd5')
), live as (
  select p.proname as name, md5(replace(p.prosrc, chr(13), '')) as md5
    from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in (select name from exp)
)
select e.name, e.phase, l.md5 as live_md5,
       case when l.md5 is null then 'ANTES'
            when l.md5 is not distinct from e.before_md5 then 'ANTES'
            when l.md5 = e.after_md5 then e.phase
            else 'DESCONHECIDO' end as estado
  from exp e left join live l on l.name = e.name
 order by e.phase, e.name;

-- == 2) histórico (peças já registradas pelo apply_migration; só existe no banco de produção)
select version, name from supabase_migrations.schema_migrations where name like 'campaigns\_14%' order by version;
