import { createFileRoute } from '@tanstack/react-router';
import PixelBattleCanvas from '../components/PixelBattleCanvas';

function IndexComponent() {
  return (
    <main className="h-screen w-screen overflow-hidden bg-slate-950">
      <PixelBattleCanvas width={200} height={200} />
    </main>
  );
}

export const Route = createFileRoute('/')({
  component: IndexComponent,
});