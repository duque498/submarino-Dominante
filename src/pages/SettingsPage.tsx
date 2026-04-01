import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, User, Bell, Shield, Globe, Send, CheckCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const [telegramChatId, setTelegramChatId] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("telegram_chat_id")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data?.telegram_chat_id) setTelegramChatId(data.telegram_chat_id);
        setLoaded(true);
      });
  }, [user]);

  const saveTelegramChatId = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ telegram_chat_id: telegramChatId || null } as any)
      .eq("user_id", user.id);
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar Chat ID");
    } else {
      toast.success("Chat ID do Telegram salvo!");
    }
  };

  const testTelegram = async () => {
    if (!telegramChatId) {
      toast.error("Insira o Chat ID primeiro");
      return;
    }
    setTesting(true);
    try {
      const { error } = await supabase.functions.invoke("send-telegram", {
        body: {
          chat_id: telegramChatId,
          title: "✅ Teste — Radar Alpha",
          body: "Notificações do Telegram estão funcionando! 🚀",
        },
      });
      if (error) throw error;
      toast.success("Mensagem de teste enviada!");
    } catch {
      toast.error("Falha ao enviar. Verifique o Chat ID e se o bot está ativo.");
    }
    setTesting(false);
  };

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
        <p className="text-sm text-muted-foreground">Gerencie suas preferências</p>
      </div>

      <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
        {/* Profile */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold text-foreground">Perfil</h2>
          </div>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">E-mail</Label>
              <p className="text-sm text-foreground font-mono">{user?.email ?? "—"}</p>
            </div>
            <Button variant="destructive" size="sm" onClick={signOut}>
              <LogOut className="mr-2 h-4 w-4" /> Sair
            </Button>
          </div>
        </div>

        {/* Telegram */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Send className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold text-foreground">Telegram</h2>
          </div>
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground space-y-1">
              <p>1. Abra o Telegram e procure o bot do Radar Alpha</p>
              <p>2. Envie <code className="bg-muted px-1 rounded">/start</code> para o bot</p>
              <p>3. Use o <a href="https://t.me/userinfobot" target="_blank" className="text-primary underline">@userinfobot</a> para descobrir seu Chat ID</p>
              <p>4. Cole o Chat ID abaixo e salve</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="telegram-chat-id" className="text-xs">Chat ID</Label>
              <Input
                id="telegram-chat-id"
                placeholder="Ex: 123456789"
                className="bg-background font-mono"
                value={telegramChatId}
                onChange={(e) => setTelegramChatId(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={saveTelegramChatId} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                Salvar
              </Button>
              <Button size="sm" variant="outline" onClick={testTelegram} disabled={testing}>
                {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Testar
              </Button>
            </div>
            {telegramChatId && (
              <Badge variant="bull" className="text-[10px]">Configurado</Badge>
            )}
          </div>
        </div>

        {/* Notifications */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold text-foreground">Notificações</h2>
          </div>
          <div className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              <Badge variant="default">In-App</Badge>
              <Badge variant="default">Web Push</Badge>
              <Badge variant={telegramChatId ? "default" : "secondary"}>Telegram</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Alertas são enviados por todos os canais ativos quando uma estratégia detecta um sinal.
            </p>
          </div>
        </div>

        {/* Risk */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold text-foreground">Risco</h2>
          </div>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="min-score" className="text-xs">Score mínimo global</Label>
              <Input id="min-score" type="number" defaultValue={60} className="bg-background font-mono w-24" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="min-rr" className="text-xs">R/R mínimo</Label>
              <Input id="min-rr" type="number" step="0.1" defaultValue={1.8} className="bg-background font-mono w-24" />
            </div>
          </div>
        </div>

        {/* General */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold text-foreground">Geral</h2>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Idioma</span>
              <span className="text-foreground">Português (BR)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Fuso Horário</span>
              <span className="text-foreground font-mono">America/Sao_Paulo</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Mercado padrão</span>
              <Badge variant="outline" className="text-[10px]">Linear Perp</Badge>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
