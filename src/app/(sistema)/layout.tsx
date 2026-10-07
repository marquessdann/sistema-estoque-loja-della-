import { AppShell } from '@/components/app-shell';
import { DadosProvider } from '@/lib/dados';

// Todas as telas internas (depois do login) usam este layout.
export default function LayoutSistema({ children }: { children: React.ReactNode }) {
  return (
    <DadosProvider>
      <AppShell>{children}</AppShell>
    </DadosProvider>
  );
}
