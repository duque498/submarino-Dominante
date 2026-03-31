
-- Add new columns to strategies
ALTER TABLE public.strategies ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'both';
ALTER TABLE public.strategies ADD COLUMN IF NOT EXISTS tags jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.strategies ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'medium';
ALTER TABLE public.strategies ADD COLUMN IF NOT EXISTS risk_rules jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.strategies ADD COLUMN IF NOT EXISTS alert_rules jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.strategies ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE public.strategies ADD COLUMN IF NOT EXISTS exchange text NOT NULL DEFAULT 'bybit';

-- Add group_id to strategy_conditions for nested groups
ALTER TABLE public.strategy_conditions ADD COLUMN IF NOT EXISTS group_id text DEFAULT 'default';
ALTER TABLE public.strategy_conditions ADD COLUMN IF NOT EXISTS weight integer NOT NULL DEFAULT 10;

-- Add columns to strategy_indicators
ALTER TABLE public.strategy_indicators ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'close';
ALTER TABLE public.strategy_indicators ADD COLUMN IF NOT EXISTS timeframe text DEFAULT NULL;
ALTER TABLE public.strategy_indicators ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.strategy_indicators ADD COLUMN IF NOT EXISTS plot_on_chart boolean NOT NULL DEFAULT true;
ALTER TABLE public.strategy_indicators ADD COLUMN IF NOT EXISTS label text DEFAULT NULL;

-- Strategy versions table for history
CREATE TABLE public.strategy_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id uuid NOT NULL REFERENCES public.strategies(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  change_summary text DEFAULT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  user_id uuid NOT NULL
);

ALTER TABLE public.strategy_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own strategy versions"
  ON public.strategy_versions
  FOR ALL
  TO public
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
