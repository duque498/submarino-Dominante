export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      ai_chat_messages: {
        Row: {
          content: string
          context: Json | null
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          context?: Json | null
          created_at?: string
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          content?: string
          context?: Json | null
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      alert_deliveries: {
        Row: {
          alert_id: string
          channel: string
          created_at: string
          delivered_at: string | null
          error_message: string | null
          id: string
          status: string
        }
        Insert: {
          alert_id: string
          channel: string
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          status?: string
        }
        Update: {
          alert_id?: string
          channel?: string
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_deliveries_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "alerts"
            referencedColumns: ["id"]
          },
        ]
      }
      alerts: {
        Row: {
          created_at: string
          id: string
          read_at: string | null
          sent_at: string | null
          signal_id: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          read_at?: string | null
          sent_at?: string | null
          signal_id: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          read_at?: string | null
          sent_at?: string | null
          signal_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      backtest_runs: {
        Row: {
          avg_loss: number | null
          avg_rr: number | null
          avg_win: number | null
          created_at: string
          id: string
          max_drawdown: number | null
          period_end: string
          period_start: string
          profit_factor: number | null
          results: Json | null
          status: string | null
          strategy_id: string
          total_pnl: number | null
          total_trades: number | null
          user_id: string
          win_rate: number | null
        }
        Insert: {
          avg_loss?: number | null
          avg_rr?: number | null
          avg_win?: number | null
          created_at?: string
          id?: string
          max_drawdown?: number | null
          period_end: string
          period_start: string
          profit_factor?: number | null
          results?: Json | null
          status?: string | null
          strategy_id: string
          total_pnl?: number | null
          total_trades?: number | null
          user_id: string
          win_rate?: number | null
        }
        Update: {
          avg_loss?: number | null
          avg_rr?: number | null
          avg_win?: number | null
          created_at?: string
          id?: string
          max_drawdown?: number | null
          period_end?: string
          period_start?: string
          profit_factor?: number | null
          results?: Json | null
          status?: string | null
          strategy_id?: string
          total_pnl?: number | null
          total_trades?: number | null
          user_id?: string
          win_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "backtest_runs_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          created_at: string
          description: string | null
          enabled: boolean | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          enabled?: boolean | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          enabled?: boolean | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      market_analyses: {
        Row: {
          analysis_text: string
          created_at: string
          id: string
          key_levels: Json | null
          market_data_snapshot: Json | null
          recommendations: Json | null
          sentiment: string | null
          strategy_id: string | null
          symbol: string
          trends: Json | null
          user_id: string
        }
        Insert: {
          analysis_text: string
          created_at?: string
          id?: string
          key_levels?: Json | null
          market_data_snapshot?: Json | null
          recommendations?: Json | null
          sentiment?: string | null
          strategy_id?: string | null
          symbol: string
          trends?: Json | null
          user_id: string
        }
        Update: {
          analysis_text?: string
          created_at?: string
          id?: string
          key_levels?: Json | null
          market_data_snapshot?: Json | null
          recommendations?: Json | null
          sentiment?: string | null
          strategy_id?: string | null
          symbol?: string
          trends?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_analyses_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_channels: {
        Row: {
          active: boolean | null
          channel: string
          config: Json | null
          created_at: string
          id: string
          min_score: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean | null
          channel: string
          config?: Json | null
          created_at?: string
          id?: string
          min_score?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean | null
          channel?: string
          config?: Json | null
          created_at?: string
          id?: string
          min_score?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pair_scans: {
        Row: {
          conditions_passed: number | null
          conditions_total: number | null
          created_at: string
          direction: string | null
          id: string
          indicator_values: Json | null
          is_signal: boolean | null
          market_data: Json | null
          score: number | null
          strategy_id: string | null
          symbol: string
          user_id: string
        }
        Insert: {
          conditions_passed?: number | null
          conditions_total?: number | null
          created_at?: string
          direction?: string | null
          id?: string
          indicator_values?: Json | null
          is_signal?: boolean | null
          market_data?: Json | null
          score?: number | null
          strategy_id?: string | null
          symbol: string
          user_id: string
        }
        Update: {
          conditions_passed?: number | null
          conditions_total?: number | null
          created_at?: string
          direction?: string | null
          id?: string
          indicator_values?: Json | null
          is_signal?: boolean | null
          market_data?: Json | null
          score?: number | null
          strategy_id?: string | null
          symbol?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pair_scans_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      paper_trades: {
        Row: {
          closed_at: string | null
          created_at: string
          direction: string
          entry_price: number
          exit_price: number | null
          id: string
          pnl_percent: number | null
          signal_id: string | null
          status: string
          stop_price: number | null
          symbol: string
          target_price: number | null
          user_id: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          direction: string
          entry_price: number
          exit_price?: number | null
          id?: string
          pnl_percent?: number | null
          signal_id?: string | null
          status?: string
          stop_price?: number | null
          symbol: string
          target_price?: number | null
          user_id: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          direction?: string
          entry_price?: number
          exit_price?: number | null
          id?: string
          pnl_percent?: number | null
          signal_id?: string | null
          status?: string
          stop_price?: number | null
          symbol?: string
          target_price?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "paper_trades_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          default_market: string | null
          display_name: string | null
          id: string
          language: string | null
          timezone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          default_market?: string | null
          display_name?: string | null
          id?: string
          language?: string | null
          timezone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          default_market?: string | null
          display_name?: string | null
          id?: string
          language?: string | null
          timezone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: []
      }
      signals: {
        Row: {
          candle_data: Json | null
          created_at: string
          direction: string
          entry_price: number | null
          filters_failed: Json | null
          filters_passed: Json | null
          id: string
          indicator_snapshot: Json | null
          justification: string | null
          market: string
          market_context: Json | null
          result: string | null
          result_pnl: number | null
          rr_ratio: number | null
          score: number
          score_breakdown: Json | null
          stop_price: number | null
          strategy_id: string | null
          symbol: string
          target1_price: number | null
          target2_price: number | null
          timeframe: string
          user_id: string
        }
        Insert: {
          candle_data?: Json | null
          created_at?: string
          direction: string
          entry_price?: number | null
          filters_failed?: Json | null
          filters_passed?: Json | null
          id?: string
          indicator_snapshot?: Json | null
          justification?: string | null
          market: string
          market_context?: Json | null
          result?: string | null
          result_pnl?: number | null
          rr_ratio?: number | null
          score: number
          score_breakdown?: Json | null
          stop_price?: number | null
          strategy_id?: string | null
          symbol: string
          target1_price?: number | null
          target2_price?: number | null
          timeframe: string
          user_id: string
        }
        Update: {
          candle_data?: Json | null
          created_at?: string
          direction?: string
          entry_price?: number | null
          filters_failed?: Json | null
          filters_passed?: Json | null
          id?: string
          indicator_snapshot?: Json | null
          justification?: string | null
          market?: string
          market_context?: Json | null
          result?: string | null
          result_pnl?: number | null
          rr_ratio?: number | null
          score?: number
          score_breakdown?: Json | null
          stop_price?: number | null
          strategy_id?: string | null
          symbol?: string
          target1_price?: number | null
          target2_price?: number | null
          timeframe?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "signals_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      strategies: {
        Row: {
          active: boolean | null
          alert_mode: string | null
          alert_rules: Json
          cooldown_minutes: number | null
          created_at: string
          description: string | null
          direction: string
          exchange: string
          id: string
          market: string
          max_alerts_per_symbol_per_day: number | null
          min_rr: number | null
          name: string
          priority: string
          risk_rules: Json
          score_min: number | null
          tags: Json
          time_window_end: string | null
          time_window_start: string | null
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          active?: boolean | null
          alert_mode?: string | null
          alert_rules?: Json
          cooldown_minutes?: number | null
          created_at?: string
          description?: string | null
          direction?: string
          exchange?: string
          id?: string
          market?: string
          max_alerts_per_symbol_per_day?: number | null
          min_rr?: number | null
          name: string
          priority?: string
          risk_rules?: Json
          score_min?: number | null
          tags?: Json
          time_window_end?: string | null
          time_window_start?: string | null
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          active?: boolean | null
          alert_mode?: string | null
          alert_rules?: Json
          cooldown_minutes?: number | null
          created_at?: string
          description?: string | null
          direction?: string
          exchange?: string
          id?: string
          market?: string
          max_alerts_per_symbol_per_day?: number | null
          min_rr?: number | null
          name?: string
          priority?: string
          risk_rules?: Json
          score_min?: number | null
          tags?: Json
          time_window_end?: string | null
          time_window_start?: string | null
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: []
      }
      strategy_conditions: {
        Row: {
          compare_to: Json | null
          condition_type: string
          created_at: string
          group_id: string | null
          id: string
          indicator_id: string | null
          logic_group: string | null
          operator: string
          role: string
          sort_order: number | null
          strategy_id: string
          value: Json
          weight: number
        }
        Insert: {
          compare_to?: Json | null
          condition_type: string
          created_at?: string
          group_id?: string | null
          id?: string
          indicator_id?: string | null
          logic_group?: string | null
          operator: string
          role?: string
          sort_order?: number | null
          strategy_id: string
          value: Json
          weight?: number
        }
        Update: {
          compare_to?: Json | null
          condition_type?: string
          created_at?: string
          group_id?: string | null
          id?: string
          indicator_id?: string | null
          logic_group?: string | null
          operator?: string
          role?: string
          sort_order?: number | null
          strategy_id?: string
          value?: Json
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "strategy_conditions_indicator_id_fkey"
            columns: ["indicator_id"]
            isOneToOne: false
            referencedRelation: "strategy_indicators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "strategy_conditions_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      strategy_indicators: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          indicator_type: string
          label: string | null
          params: Json | null
          plot_on_chart: boolean
          role: string
          sort_order: number | null
          source: string
          strategy_id: string
          timeframe: string | null
          weight: number | null
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          indicator_type: string
          label?: string | null
          params?: Json | null
          plot_on_chart?: boolean
          role?: string
          sort_order?: number | null
          source?: string
          strategy_id: string
          timeframe?: string | null
          weight?: number | null
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          indicator_type?: string
          label?: string | null
          params?: Json | null
          plot_on_chart?: boolean
          role?: string
          sort_order?: number | null
          source?: string
          strategy_id?: string
          timeframe?: string | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "strategy_indicators_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      strategy_symbols: {
        Row: {
          id: string
          strategy_id: string
          symbol: string
        }
        Insert: {
          id?: string
          strategy_id: string
          symbol: string
        }
        Update: {
          id?: string
          strategy_id?: string
          symbol?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategy_symbols_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      strategy_timeframes: {
        Row: {
          id: string
          strategy_id: string
          timeframe: string
        }
        Insert: {
          id?: string
          strategy_id: string
          timeframe: string
        }
        Update: {
          id?: string
          strategy_id?: string
          timeframe?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategy_timeframes_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      strategy_versions: {
        Row: {
          change_summary: string | null
          created_at: string
          id: string
          snapshot: Json
          strategy_id: string
          user_id: string
          version: number
        }
        Insert: {
          change_summary?: string | null
          created_at?: string
          id?: string
          snapshot?: Json
          strategy_id: string
          user_id: string
          version?: number
        }
        Update: {
          change_summary?: string | null
          created_at?: string
          id?: string
          snapshot?: Json
          strategy_id?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "strategy_versions_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      strategy_weights: {
        Row: {
          block_name: string
          id: string
          strategy_id: string
          weight: number
        }
        Insert: {
          block_name: string
          id?: string
          strategy_id: string
          weight?: number
        }
        Update: {
          block_name?: string
          id?: string
          strategy_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "strategy_weights_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          alert_on_close_only: boolean | null
          created_at: string
          id: string
          max_spread: number | null
          min_rr: number | null
          min_score_global: number | null
          min_volume: number | null
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          alert_on_close_only?: boolean | null
          created_at?: string
          id?: string
          max_spread?: number | null
          min_rr?: number | null
          min_score_global?: number | null
          min_volume?: number | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          alert_on_close_only?: boolean | null
          created_at?: string
          id?: string
          max_spread?: number | null
          min_rr?: number | null
          min_score_global?: number | null
          min_volume?: number | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      watched_symbols: {
        Row: {
          active: boolean | null
          created_at: string
          id: string
          market: string
          symbol: string
          user_id: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string
          id?: string
          market?: string
          symbol: string
          user_id: string
        }
        Update: {
          active?: boolean | null
          created_at?: string
          id?: string
          market?: string
          symbol?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
