update storage.buckets
set allowed_mime_types = (
  select array_agg(distinct mime_type order by mime_type)
  from unnest(
    coalesce(allowed_mime_types, '{}'::text[])
    || array[
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]::text[]
  ) as allowed(mime_type)
)
where id = 'admission-requirements';
