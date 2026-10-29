import type { Metadata } from "next";

import { AdminDashboard } from "@/ui/admin/admin-dashboard";

export const metadata: Metadata = {
  title: "Administración de mazos · Tabú",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return <AdminDashboard />;
}
