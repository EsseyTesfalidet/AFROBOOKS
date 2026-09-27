import AdminWorkspace from '@/components/admin/AdminWorkspace';
import './admin.css';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminWorkspace>{children}</AdminWorkspace>;
}
