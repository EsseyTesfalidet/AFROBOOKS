import {
  LayoutDashboard,
  Users,
  BookOpen,
  Flag,
  DollarSign,
  CreditCard,
  Radio,
  ShieldCheck,
  AlertTriangle,
  Megaphone,
  Settings,
} from 'lucide-react';

export const ADMIN_NAV = [
  { group: 'Workspace', label: 'Overview', href: '/admin', icon: LayoutDashboard },
  { group: 'Workspace', label: 'Books', href: '/admin/books', icon: BookOpen },
  { group: 'Workspace', label: 'People', href: '/admin/users', icon: Users },
  { group: 'Review', label: 'Flagged books', href: '/admin/flagged', icon: Flag },
  { group: 'Review', label: 'Reports', href: '/admin/reports', icon: AlertTriangle },
  { group: 'Review', label: 'Verifications', href: '/admin/verifications', icon: ShieldCheck },
  { group: 'Finance', label: 'Revenue', href: '/admin/revenue', icon: DollarSign },
  { group: 'Finance', label: 'Author payouts', href: '/admin/payouts', icon: CreditCard },
  { group: 'Finance', label: 'Subscriptions', href: '/admin/subscriptions', icon: Radio },
  { group: 'Manage', label: 'Announcements', href: '/admin/announcements', icon: Megaphone },
  { group: 'Manage', label: 'Promotions', href: '/admin/promotions', icon: Megaphone },
  { group: 'Manage', label: 'Settings', href: '/admin/settings', icon: Settings },
];
