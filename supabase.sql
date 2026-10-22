-- =========================================================
-- CicloVictoria · supabase.sql
-- Pegar completo en Supabase → SQL Editor → Run (se puede correr varias veces).
-- =========================================================

create extension if not exists pgcrypto with schema extensions;

-- Todo lo que el panel guarda: una fila por clave (productos, cotizaciones, órdenes…)
create table if not exists public.datos (
  clave       text primary key,
  valor       jsonb not null,
  actualizado timestamptz not null default now()
);

-- Quiénes son administradores. Si agregas un usuario en Authentication,
-- agrégalo aquí también (y en USUARIOS de js/config.js).
create table if not exists public.administradores (
  usuario text primary key,
  correo  text not null unique
);
insert into public.administradores (usuario, correo) values
  ('pacho',   'pacho@ciclovictoria.app'),
  ('osney',   'osney@ciclovictoria.app'),
  ('marleny', 'marleny@ciclovictoria.app')
on conflict (usuario) do nothing;

-- Códigos de recuperación: solo el hash SHA-256 de "usuario:recuperacion:CODIGO".
-- Los valores se cargan con supabase-codigos.sql (archivo privado, no está en GitHub).
create table if not exists public.codigos_recuperacion (
  usuario text primary key references public.administradores(usuario),
  hash    text not null
);

create or replace function public.es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from administradores where correo = auth.jwt() ->> 'email');
$$;

-- ---------- Seguridad (RLS) ----------
alter table public.datos enable row level security;
alter table public.administradores enable row level security;
alter table public.codigos_recuperacion enable row level security;  -- sin políticas: nadie la lee desde la web

drop policy if exists "admins leen y escriben" on public.datos;
create policy "admins leen y escriben" on public.datos
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

-- Los visitantes solo ven el catálogo sin precios, costos ni stock.
drop policy if exists "publico lee el catalogo" on public.datos;
create policy "publico lee el catalogo" on public.datos
  for select to anon, authenticated using (clave = 'catalogo_publico');

-- ---------- Contraseñas ----------

-- Un admin conectado le pone contraseña nueva a otro admin.
create or replace function public.restablecer_clave(p_usuario text, p_nueva text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.es_admin() then raise exception 'Solo un administrador puede restablecer contraseñas.'; end if;
  if length(p_nueva) < 6 then raise exception 'La contraseña debe tener al menos 6 caracteres.'; end if;
  update auth.users set encrypted_password = crypt(p_nueva, gen_salt('bf')), updated_at = now()
   where email = (select correo from administradores where usuario = p_usuario);
  if not found then raise exception 'Ese usuario no existe en Supabase.'; end if;
end $$;

-- "¿Olvidaste tu contraseña?": cualquiera puede llamarla, pero sin el código correcto no hace nada.
create or replace function public.recuperar_clave(p_usuario text, p_codigo text, p_nueva text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
begin
  if length(p_nueva) < 6 then raise exception 'La contraseña debe tener al menos 6 caracteres.'; end if;
  perform pg_sleep(1);  -- frena los intentos por fuerza bruta
  if not exists (
    select 1 from codigos_recuperacion
     where usuario = p_usuario
       and hash = encode(digest(p_usuario || ':recuperacion:' || p_codigo, 'sha256'), 'hex')
  ) then return false; end if;
  update auth.users set encrypted_password = crypt(p_nueva, gen_salt('bf')), updated_at = now()
   where email = (select correo from administradores where usuario = p_usuario);
  return found;
end $$;

revoke all on function public.restablecer_clave(text, text) from public;
grant execute on function public.restablecer_clave(text, text) to authenticated;
grant execute on function public.recuperar_clave(text, text, text) to anon, authenticated;
