import {
  BookOpen,
  Compass,
  Library,
  ShoppingCart,
  User,
  type LucideIcon,
} from 'lucide-react';

export interface BuyerNavItem {
  label: string;
  href?: string;
  icon: LucideIcon;
  matches: string[];
  drawerSection?: string;
}

export interface BuyerRouteState {
  eyebrow: string;
  title: string;
  subtitle: string;
  showBottomNav: boolean;
  showFooter: boolean;
  showDrawer: boolean;
  showSwipe: boolean;
}

const DEFAULT_ROUTE_STATE: BuyerRouteState = {
  eyebrow: 'AfroBooks',
  title: 'Reader App',
  subtitle: 'Discover bold stories by African authors.',
  showBottomNav: true,
  showFooter: true,
  showDrawer: true,
  showSwipe: true,
};

const ROUTE_STATE_RULES: Array<{
  matches: string[];
  state: Partial<BuyerRouteState>;
}> = [
  {
    matches: ['/browse'],
    state: {
      eyebrow: 'Home',
      title: 'Reader Home',
      subtitle: 'Fresh drops, bestsellers, and your next great read.',
    },
  },
  {
    matches: ['/discover'],
    state: {
      eyebrow: 'Discover',
      title: 'Curated For You',
      subtitle: 'Taste-based shelves, staff picks, and hidden gems.',
    },
  },
  {
    matches: ['/library'],
    state: {
      eyebrow: 'Library',
      title: 'Your Shelf',
      subtitle: 'Resume books, track progress, and jump back in.',
    },
  },
  {
    matches: ['/cart'],
    state: {
      eyebrow: 'Cart',
      title: 'Ready To Checkout',
      subtitle: 'Review your picks before you pay.',
    },
  },
  {
    matches: ['/checkout'],
    state: {
      eyebrow: 'Checkout',
      title: 'Secure Payment',
      subtitle: 'Finish your order without distractions.',
      showBottomNav: false,
      showSwipe: false,
    },
  },
  {
    matches: ['/subscription'],
    state: {
      eyebrow: 'Subscription',
      title: 'Unlimited Reading',
      subtitle: 'Choose a plan and unlock subscriber titles.',
      showBottomNav: false,
      showSwipe: false,
    },
  },
  {
    matches: ['/search'],
    state: {
      eyebrow: 'Search',
      title: 'Find Your Next Book',
      subtitle: 'Search by title, author, genre, price, or rating.',
      showSwipe: false,
    },
  },
  {
    matches: ['/book'],
    state: {
      eyebrow: 'Book',
      title: 'Book Details',
      subtitle: 'Preview the story, check reviews, and choose how to read.',
      showBottomNav: false,
      showSwipe: false,
    },
  },
  {
    matches: ['/sample'],
    state: {
      eyebrow: 'Sample',
      title: 'Free Preview',
      subtitle: 'Read a sample before you decide to buy.',
      showBottomNav: false,
      showFooter: false,
      showSwipe: false,
    },
  },
  {
    matches: ['/read'],
    state: {
      eyebrow: 'Reader',
      title: 'Immersive Reader',
      subtitle: 'Focused reading mode.',
      showBottomNav: false,
      showFooter: false,
      showDrawer: false,
      showSwipe: false,
    },
  },
  {
    matches: ['/profile'],
    state: {
      eyebrow: 'Profile',
      title: 'Reader Profile',
      subtitle: 'Manage reading preferences, orders, and your account.',
      showSwipe: false,
    },
  },
  {
    matches: ['/notifications'],
    state: {
      eyebrow: 'Updates',
      title: 'Notifications',
      subtitle: 'Purchases, releases, and account activity in one place.',
      showSwipe: false,
    },
  },
  {
    matches: ['/author'],
    state: {
      eyebrow: 'Author',
      title: 'Author Page',
      subtitle: 'Explore titles, profile details, and follow this writer.',
      showSwipe: false,
    },
  },
];

export const BUYER_MOBILE_TABS: BuyerNavItem[] = [
  { label: 'Home', href: '/browse', icon: BookOpen, matches: ['/browse'] },
  { label: 'Discover', href: '/discover', icon: Compass, matches: ['/discover'] },
  { label: 'Library', href: '/library', icon: Library, matches: ['/library'] },
  { label: 'Cart', href: '/cart', icon: ShoppingCart, matches: ['/cart', '/checkout'] },
  { label: 'Profile', icon: User, matches: ['/profile'], drawerSection: 'account' },
];

export const BUYER_DESKTOP_LINKS: BuyerNavItem[] = BUYER_MOBILE_TABS.filter(
  (item) => item.href
);

export const BUYER_SWIPE_ROUTES = ['/browse', '/discover', '/library', '/cart'];

function pathMatches(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isBuyerNavActive(pathname: string, item: BuyerNavItem) {
  return item.matches.some((match) => pathMatches(pathname, match));
}

export function getBuyerRouteState(pathname: string): BuyerRouteState {
  const rule = ROUTE_STATE_RULES.find(({ matches }) =>
    matches.some((match) => pathMatches(pathname, match))
  );

  return {
    ...DEFAULT_ROUTE_STATE,
    ...rule?.state,
  };
}
