
-- Table for AI market analysis results
CREATE TABLE public.market_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  symbol text NOT NULL,
  strategy_id uuid REFERENCES public.strategies(id) ON DELETE SET NULL,
  analysis_text text NOT NULL,
  sentiment text DEFAULT 'neutral',
  key_levels jsonb DEFAULT '{}',
  trends jsonb DEFAULT '[]',
  recommendations jsonb DEFAULT '[]',
  market_data_snapshot jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.market_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own analyses" ON public.market_analyses
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own analyses" ON public.market_analyses
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Table for multi-pair scanner results
CREATE TABLE public.pair_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  symbol text NOT NULL,
  strategy_id uuid REFERENCES public.strategies(id) ON DELETE SET NULL,
  direction text,
  conditions_passed integer DEFAULT 0,
  conditions_total integer DEFAULT 0,
  score integer DEFAULT 0,
  market_data jsonb DEFAULT '{}',
  indicator_values jsonb DEFAULT '{}',
  is_signal boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pair_scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own pair scans" ON public.pair_scans
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own pair scans" ON public.pair_scans
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Chat messages for AI market chat
CREATE TABLE public.ai_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'user',
  content text NOT NULL,
  context jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own chat messages" ON public.ai_chat_messages
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
