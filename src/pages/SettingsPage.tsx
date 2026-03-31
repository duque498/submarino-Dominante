import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { LogOut, User, Bell, Shield, Globe, Clock } from "lucide-react";

export default function SettingsPage() {
  const { user, signOut } = useAuth();

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

        {/* Notifications */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold text-foreground">Notificações</h2>
          </div>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="telegram-token" className="text-xs">Token do Bot Telegram</Label>
              <Input id="telegram-token" placeholder="Configurar na Fase 4" className="bg-background" disabled />
            </div>
            <div className="space-y-1">
              <Label htmlFor="telegram-chat" className="text-xs">Chat ID Telegram</Label>
              <Input id="telegram-chat" placeholder="Configurar na Fase 4" className="bg-background" disabled />
            </div>
            <div className="flex gap-2">
              <Badge variant="default">In-App</Badge>
              <Badge variant="secondary">Telegram</Badge>
              <Badge variant="secondary">E-mail</Badge>
            </div>
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
