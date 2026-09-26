"use client";

import { useRouter } from "next/navigation";
import { JoinWithCode } from "@/components/AuthScreen";
import { useAuth } from "@/lib/auth";

export default function InvitePage() {
  const router = useRouter();
  const { mode } = useAuth();
  if (mode === "local") return <p className="text-muted">Os convites só funcionam com a versão online.</p>;
  return (
    <div className="mx-auto mt-10 max-w-sm">
      <h1 className="text-2xl font-semibold">Entrar numa equipa</h1>
      <p className="mt-1 text-sm text-muted">Escreve o código de 6 caracteres que o treinador te deu.</p>
      <div className="card mt-4 p-5">
        <JoinWithCode onJoined={() => setTimeout(() => router.push("/"), 800)} />
      </div>
    </div>
  );
}
