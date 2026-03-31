import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Radar, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [isReset, setIsReset] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isReset) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast({ title: "E-mail enviado", description: "Verifique sua caixa de entrada." });
        setIsReset(false);
      } else if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate("/");
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast({ title: "Conta criada", description: "Verifique seu e-mail para confirmar o cadastro." });
      }
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Header */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-2 text-primary">
            <Radar className="h-8 w-8" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Radar Alpha Bybit</h1>
          <p className="text-sm text-muted-foreground">
            {isReset ? "Recuperar senha" : isLogin ? "Entre na sua conta" : "Crie sua conta"}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleAuth} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="bg-card"
            />
          </div>

          {!isReset && (
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="bg-card pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Aguarde..." : isReset ? "Enviar link" : isLogin ? "Entrar" : "Criar conta"}
          </Button>
        </form>

        {/* Links */}
        <div className="flex flex-col items-center gap-2 text-sm">
          {isLogin && !isReset && (
            <button onClick={() => setIsReset(true)} className="text-muted-foreground hover:text-primary">
              Esqueceu a senha?
            </button>
          )}
          <button
            onClick={() => { setIsLogin(!isLogin); setIsReset(false); }}
            className="text-muted-foreground hover:text-primary"
          >
            {isLogin ? "Não tem conta? Cadastre-se" : "Já tem conta? Entre"}
          </button>
          {isReset && (
            <button onClick={() => setIsReset(false)} className="text-muted-foreground hover:text-primary">
              Voltar ao login
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
