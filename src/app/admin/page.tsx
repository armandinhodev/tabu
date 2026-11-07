import type { Metadata } from "next";
import { Toaster } from "sonner";

import { AdminDashboard } from "@/ui/admin/admin-dashboard";

export const metadata: Metadata = {
  title: "Administración de mazos · Tabú",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return (
    <>
      <AdminDashboard />
      {/*
        El panel tiene su propio canal de avisos: los errores de una acción se
        muestran en un toast (§13), que se ve estés donde estés dentro del
        panel, en vez de un aviso arriba que pasa desapercibido.
      */}
      <Toaster
        theme="dark"
        position="bottom-center"
        toastOptions={{
          classNames: {
            toast: "rounded-lg border border-line bg-surface-3 text-fg",
          },
        }}
      />
    </>
  );
}
