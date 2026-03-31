import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { History, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useState } from "react";
import type { StrategyDraft } from "@/types/strategy";

interface Props {
  strategyId: string | undefined;
  onRestore: (draft: StrategyDraft) => void;
  children: React.ReactNode;
}

export function StrategyVersionsDialog({ strategyId, onRestore, children }: Props) {
  const [open, setOpen] = useState(false);

  const { data: versions, isLoading } = useQuery({
    queryKey: ["strategy-versions", strategyId],
    enabled: !!strategyId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("strategy_versions")
        .select("*")
        .eq("strategy_id", strategyId!)
        .order("version", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const handleRestore = (snapshot: any) => {
    onRestore(snapshot as StrategyDraft);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            Histórico de Versões
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-96">
          <div className="space-y-2 pr-2">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 rounded-md" />
              ))
            ) : !versions || versions.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">Nenhuma versão salva</p>
            ) : (
              versions.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border bg-card/30 hover:bg-accent/30 transition-colors"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] font-mono h-4 px-1.5">
                        v{v.version}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(v.created_at), "dd MMM yyyy HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                    {v.change_summary && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">{v.change_summary}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRestore(v.snapshot)}
                    className="gap-1 text-xs h-7"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Restaurar
                  </Button>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
