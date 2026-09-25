-- =====================================================================
-- Submarino DOMI — Fase 6.3: a tabela do relay por REST
--
-- Rode este arquivo INTEIRO no SQL Editor do painel do Supabase
-- (Dashboard > SQL Editor > New query > cole > Run). Não precisa do CLI
-- e não precisa de migration: é uma tabela só, e ela é descartável.
--
-- Pra que serve: na rede da escola o WebSocket (wss://) cai, mas o
-- HTTPS passa. Quando isso acontece, os dois lados param de usar o
-- Realtime e passam a conversar escrevendo linhas aqui — o celular
-- insere, o Chromebook lê de 400 em 400 ms, e vice-versa.
--
-- Pode rodar de novo à vontade: tudo aqui é `if not exists` ou
-- `drop ... if exists` antes de criar.
--
-- O QUE ISSO EXPÕE, dito com todas as letras: quem tiver a chave
-- publishable (que é pública por desenho, está no HTML) pode inserir e
-- ler linhas desta tabela. É a mesma exposição que o `broadcast` já
-- tinha, com uma diferença: aqui a mensagem FICA gravada por até 10
-- minutos em vez de passar e sumir. Não guarde nada aqui que não possa
-- ser lido por qualquer um — e não guardamos: só tecla, nome de cena e
-- o estado da colinha. Quem protege a sessão continua sendo o código de
-- 4 dígitos no nome do canal, não a chave.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. A tabela
-- ---------------------------------------------------------------------
create table if not exists public.sinais (
  id        bigserial   primary key,
  canal     text        not null,
  evento    text        not null,
  payload   jsonb       not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);

-- O índice que importa: toda leitura é "as linhas DESTE canal com id
-- maior que o último que eu já vi", e é ela que roda 2,5 vezes por
-- segundo durante a apresentação inteira.
create index if not exists sinais_canal_id_idx on public.sinais (canal, id);

-- ---------------------------------------------------------------------
-- 2. Permissões de tabela
--
-- A RLS decide QUAIS linhas; o `grant` decide se o papel pode encostar
-- na tabela. Precisa dos dois. O `grant` da SEQUÊNCIA é o que costuma
-- faltar: sem ele o `bigserial` não consegue tirar o próximo id e todo
-- INSERT do anon falha com "permission denied for sequence".
-- ---------------------------------------------------------------------
grant usage on schema public to anon;
grant select, insert, delete on public.sinais to anon;
grant usage, select on sequence public.sinais_id_seq to anon;

-- ---------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------
alter table public.sinais enable row level security;

drop policy if exists sinais_anon_insert on public.sinais;
drop policy if exists sinais_anon_select on public.sinais;
drop policy if exists sinais_anon_delete on public.sinais;

-- Inserir e ler: liberado. Não dá pra restringir por canal sem auth, e
-- o canal já é secreto o bastante pelo código de 4 dígitos.
create policy sinais_anon_insert on public.sinais
  for insert to anon with check (true);

create policy sinais_anon_select on public.sinais
  for select to anon using (true);

-- Apagar: SÓ linha velha. Isto é a trava que importa — sem o recorte de
-- tempo, qualquer um com a chave apagaria a conversa em andamento e
-- derrubaria a apresentação. Com ele, o pior que alguém faz é limpar
-- lixo que já ia ser limpo.
create policy sinais_anon_delete on public.sinais
  for delete to anon using (criado_em < now() - interval '10 minutes');

-- ---------------------------------------------------------------------
-- 4. Limpeza
--
-- O Chromebook apaga as linhas velhas do PRÓPRIO canal a cada 60 s, e é
-- isso que mantém a tabela pequena no dia a dia. O comando abaixo é só
-- pra quando você quiser zerar tudo na mão, depois da feira:
--
--   delete from public.sinais where criado_em < now() - interval '10 minutes';
--
-- E pra sumir com a tabela de vez, quando o projeto não precisar mais:
--
--   drop table public.sinais;
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- 5. Conferência rápida (opcional)
--
-- Rode isto logo depois; as três linhas têm que aparecer.
-- ---------------------------------------------------------------------
select policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'sinais'
order by policyname;
