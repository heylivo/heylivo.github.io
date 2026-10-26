-- heylivo: Gerät jedes Kontos für den Wochenbericht (Edge Function weekly-report). Liefert pro Nutzer
-- die Browser-Kennung (user agent) seiner ersten Sitzung aus auth.sessions - daraus schätzt der Bericht,
-- welche "App nur geöffnet"-Konten Programme waren (Bots, SEO-Tools, Vorschau-Dienste).
-- Nur für service_role: anon und angemeldete Nutzer dürfen sie NICHT aufrufen (fremde Gerätedaten).
-- Liest nur, ändert nichts. Darf mehrfach ausgeführt werden. Der Bericht läuft auch ohne diese Funktion,
-- dann nur ohne Bot-Zeilen - die Reihenfolge beim Einspielen ist also egal.

create or replace function public.report_devices()
returns table (user_id uuid, user_agent text)
language sql stable security definer set search_path = '' as $$
  select distinct on (s.user_id) s.user_id, s.user_agent
  from auth.sessions s
  order by s.user_id, s.created_at
$$;
revoke all on function public.report_devices() from public, anon, authenticated;
grant execute on function public.report_devices() to service_role;

-- Kontrolle: Wer darf die Funktion aufrufen? Erwartet: anon false, authenticated false, service_role true
select has_function_privilege('anon', 'public.report_devices()', 'execute') as anon,
       has_function_privilege('authenticated', 'public.report_devices()', 'execute') as authenticated,
       has_function_privilege('service_role', 'public.report_devices()', 'execute') as service_role,
       (select count(*) from public.report_devices()) as konten_mit_geraet;
