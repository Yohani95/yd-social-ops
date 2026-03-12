-- Tabla para tracking de resultados de crons
CREATE TABLE IF NOT EXISTS cron_run_logs (
  id          BIGSERIAL PRIMARY KEY,
  job_name    TEXT NOT NULL,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status      TEXT,
  response    JSONB,
  duration_ms INT
);

ALTER TABLE cron_run_logs ENABLE ROW LEVEL SECURITY;

-- Helper: llama al endpoint con CRON_SECRET desde Supabase Vault
CREATE OR REPLACE FUNCTION call_cron_endpoint(path TEXT)
RETURNS VOID AS $$
DECLARE
  base_url TEXT := 'https://social.yd-engineering.cl';
  secret   TEXT;
  req_id   BIGINT;
BEGIN
  SELECT decrypted_secret INTO secret
  FROM vault.decrypted_secrets
  WHERE name = 'cron_secret'
  LIMIT 1;

  IF secret IS NULL OR secret = '' THEN
    RAISE WARNING '[cron] vault secret "cron_secret" not set, skipping %', path;
    RETURN;
  END IF;

  SELECT net.http_post(
    url     := base_url || path,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || secret,
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  ) INTO req_id;

  INSERT INTO cron_run_logs (job_name, status, response)
  VALUES (path, 'dispatched', jsonb_build_object('req_id', req_id));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Programar los 5 cron jobs (idempotente)
SELECT cron.unschedule(jobname)
FROM cron.job
WHERE jobname IN ('cron-worker','cron-cleanup','cron-cold-leads','cron-weekly-report','cron-reminders');

SELECT cron.schedule('cron-worker',        '*/5 * * * *', $$SELECT call_cron_endpoint('/api/cron/worker')$$);
SELECT cron.schedule('cron-cleanup',       '0 3 * * *',   $$SELECT call_cron_endpoint('/api/cron/cleanup')$$);
SELECT cron.schedule('cron-cold-leads',    '0 10 * * *',  $$SELECT call_cron_endpoint('/api/cron/cold-leads')$$);
SELECT cron.schedule('cron-weekly-report', '0 7 * * 1',   $$SELECT call_cron_endpoint('/api/cron/weekly-report')$$);
SELECT cron.schedule('cron-reminders',     '0 8 * * *',   $$SELECT call_cron_endpoint('/api/cron/reminders')$$);
SELECT cron.schedule('cron-ecommerce-sync','0 6 * * *',   $$SELECT call_cron_endpoint('/api/cron/ecommerce-sync')$$);

-- NOTA: Para activar los crons, ejecutar en Supabase SQL Editor:
-- SELECT vault.create_secret('<valor de CRON_SECRET>', 'cron_secret');
