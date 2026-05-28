-- Performance indexes for analytical queries
-- All analytics endpoints filter by status + year on every request.
-- Without these indexes every query does a full table scan on census_responses.

-- 1. Composite index on (status, year) — used in every analytics WHERE clause
CREATE INDEX IF NOT EXISTS idx_cr_status_year
  ON census_responses(status, year);

-- 2. Index on school_id — speeds up JOIN schools → census_responses in vw_censo_base
CREATE INDEX IF NOT EXISTS idx_cr_school_id
  ON census_responses(school_id);

-- 3. Indexes on schools filter columns — used as query params in all analytics tabs
CREATE INDEX IF NOT EXISTS idx_schools_dre
  ON schools(dre);

CREATE INDEX IF NOT EXISTS idx_schools_municipio
  ON schools(municipio);

-- 4. GIN index on JSONB data column — accelerates field extraction and regex casts
--    across all views (vw_censo_base and all dependent views do CASE/regex on data)
CREATE INDEX IF NOT EXISTS idx_cr_data_gin
  ON census_responses USING GIN (data);
