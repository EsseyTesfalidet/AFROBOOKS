import AdminMobileNav from '@/components/admin/AdminMobileNav';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AdminMobileNav />
      {children}
    </>
  );
}
