-- ADR-0004 D1: translation provider is Azure Translator F0; Google is not used.
-- api_usage_logs.provider must name the provider actually called.
alter table public.api_usage_logs
  drop constraint api_usage_logs_provider_check;

alter table public.api_usage_logs
  add constraint api_usage_logs_provider_check
  check (provider in ('plantnet', 'perenual', 'trefle', 'azure_translator'));
