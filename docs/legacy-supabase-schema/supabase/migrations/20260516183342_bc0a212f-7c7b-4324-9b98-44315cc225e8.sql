-- Enable pg_trgm for trigram fuzzy matches (safe if already enabled)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Generated tsvector column combining the most-searched fields
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(first_name, '') || ' ' || coalesce(last_name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(company, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(email, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(title, '')), 'C') ||
    setweight(to_tsvector('simple',
      coalesce(city, '') || ' ' || coalesce(state, '') || ' ' ||
      coalesce(country, '') || ' ' || coalesce(industry, '')), 'D')
  ) STORED;

CREATE INDEX IF NOT EXISTS contacts_search_tsv_idx
  ON public.contacts USING GIN (search_tsv);

CREATE INDEX IF NOT EXISTS contacts_company_trgm_idx
  ON public.contacts USING GIN (lower(company) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS contacts_last_activity_idx
  ON public.contacts (last_activity_at DESC NULLS LAST);