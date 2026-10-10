import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  
  if (!session) {
    redirect("/auth/login?callbackUrl=/admin");
  }
  
  const userRole = (session?.user as any)?.role;
  if (userRole !== "ADMIN") {
    redirect("/dashboard?error=unauthorized");
  }
  
  return (
    <div className="min-h-screen bg-pcb-dark text-pcb-silver">
      <header className="border-b border-pcb-copper/30 bg-surface-1 px-6 py-3">
        <nav className="flex items-center gap-6">
          <Link href="/admin" className="font-mono text-pcb-copper font-bold text-lg hover:text-pcb-gold">
            ⚙ E-BROKER ADMIN
          </Link>
          <Link href="/admin" className="text-pcb-gold/70 hover:text-pcb-gold transition-colors text-sm font-medium">
            Dashboard
          </Link>
          <Link href="/admin/queue" className="text-pcb-gold/70 hover:text-pcb-gold transition-colors text-sm font-medium">
            Queue
          </Link>
          <Link href="/admin/training" className="text-pcb-gold/70 hover:text-pcb-gold transition-colors text-sm font-medium">
            Training
          </Link>
          <Link href="/admin/models" className="text-pcb-gold/70 hover:text-pcb-gold transition-colors text-sm font-medium">
            Models
          </Link>
          <div className="ml-auto flex items-center gap-4 text-xs">
            <span className="text-pcb-copper/80 font-mono">
              User: {(session.user as any)?.name || (session.user as any)?.phone}
            </span>
            <Link href="/api/auth/signout" className="text-status-danger hover:underline">
              Sign Out
            </Link>
          </div>
        </nav>
      </header>
      <div className="p-6">{children}</div>
    </div>
  );
}
