-- =============================================================================
-- Gerenciador de Campanhas — 4/5: bucket de mídia das receitas
--
-- Objetivo : bucket PRIVADO para fotos e vídeos das receitas, com limite de
--            tamanho e tipos MIME no próprio bucket (50 MiB; jpeg/png/webp e
--            mp4/webm/quicktime). Acesso só por URL assinada emitida pela API.
-- Impacto  : cria 1 bucket novo. Não toca os buckets existentes
--            (make-c3078087-avatars, make-c3078087-images).
-- Nota     : o limite por bucket nunca excede o limite GLOBAL do Storage do
--            projeto (configuração do projeto, fora das migrações).
-- Rollback : delete from storage.buckets where id = 'make-c3078087-campaigns'
--            (somente depois de esvaziar os objetos).
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'make-c3078087-campaigns', 'make-c3078087-campaigns', false, 52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public = false;
