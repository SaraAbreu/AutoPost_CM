-- Cuenta de Instagram conectada por cada usuario (flujo "Instagram API with
-- Instagram Login"). Reemplaza el uso de META_ACCESS_TOKEN/META_INSTAGRAM_ACCOUNT_ID
-- globales del .env para despliegues multi-tenant: cada usuario publica con
-- su propia cuenta, no con una compartida.
ALTER TABLE users ADD COLUMN IF NOT EXISTS instagram_user_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS instagram_username TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS instagram_access_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS instagram_token_expires_at TIMESTAMPTZ;
