import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Radar, Share, Plus, Download } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function InstallPage() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(iOS);

    // Check if already installed as PWA
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setIsInstalled(true);
    setDeferredPrompt(null);
  };

  if (isInstalled) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <Radar className="h-12 w-12 text-primary" />
        <h1 className="text-xl font-bold text-foreground">App já instalado!</h1>
        <p className="text-sm text-muted-foreground max-w-xs">
          O Radar Alpha está instalado no seu dispositivo. As notificações push funcionarão mesmo com o app em segundo plano.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center px-4">
      <Radar className="h-16 w-16 text-primary" />
      <div>
        <h1 className="text-2xl font-bold text-foreground">Instalar Radar Alpha</h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-sm">
          Instale o app na tela inicial do seu iPhone para receber notificações push de alertas de entrada, mesmo quando o navegador estiver fechado.
        </p>
      </div>

      {isIOS ? (
        <div className="space-y-4 max-w-sm">
          <div className="rounded-xl border border-border bg-card p-4 space-y-4 text-left">
            <h2 className="text-sm font-semibold text-foreground text-center">Como instalar no iPhone</h2>
            
            <div className="flex items-start gap-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
                <span className="text-xs font-bold">1</span>
              </div>
              <div>
                <p className="text-sm text-foreground">
                  Toque no botão <Share className="inline h-4 w-4 text-primary" /> <strong>Compartilhar</strong> na barra inferior do Safari
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
                <span className="text-xs font-bold">2</span>
              </div>
              <div>
                <p className="text-sm text-foreground">
                  Role e toque em <Plus className="inline h-4 w-4 text-primary" /> <strong>Adicionar à Tela de Início</strong>
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
                <span className="text-xs font-bold">3</span>
              </div>
              <div>
                <p className="text-sm text-foreground">
                  Toque em <strong>Adicionar</strong> no canto superior direito
                </p>
              </div>
            </div>
          </div>

          <p className="text-[10px] text-muted-foreground">
            ⚠️ Notificações push no iPhone exigem iOS 16.4+ e o app instalado na tela inicial.
          </p>
        </div>
      ) : deferredPrompt ? (
        <Button size="lg" onClick={handleInstall} className="gap-2">
          <Download className="h-5 w-5" />
          Instalar App
        </Button>
      ) : (
        <div className="rounded-xl border border-border bg-card p-4 max-w-sm text-left space-y-3">
          <p className="text-sm text-muted-foreground">
            Para instalar, abra o menu do navegador (⋮) e selecione <strong>"Instalar app"</strong> ou <strong>"Adicionar à tela inicial"</strong>.
          </p>
        </div>
      )}
    </div>
  );
}
