SELECT
  pg_t.oid AS id,
  is_t.trigger_schema AS schema,
  is_t.trigger_name AS name,
  is_t.event_manipulation AS event,
  is_t.event_object_catalog AS catalog,
  is_t.event_object_table AS table,
  is_t.action_condition AS condition,
  is_t.action_statement AS function_statement,
  is_t.action_orientation AS orientation,
  is_t.action_timing AS timing,
  CASE
    WHEN pg_t.tgenabled = 'D' THEN FALSE
    ELSE TRUE
  END AS is_enabled
FROM
  pg_trigger AS pg_t
JOIN
  pg_class AS pg_c
ON pg_t.tgrelid = pg_c.oid
JOIN information_schema.triggers AS is_t
ON is_t.trigger_name = pg_t.tgname
AND pg_c.relname = is_t.event_object_table
