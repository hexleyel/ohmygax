export type SidebarLinkItem = {
  type: "link";
  label: string;
  href: string;
  adminOnly?: boolean;
};

export type SidebarGroupItem = {
  type: "group";
  label: string;
  /** Hides the whole group (and its children) from non-admins. */
  adminOnly?: boolean;
  items: SidebarLinkItem[];
};

export type SidebarItem = SidebarLinkItem | SidebarGroupItem;

export const SIDEBAR_NAV: SidebarItem[] = [
  { type: "link", label: "Dashboard", href: "/dashboard" },
  {
    type: "group",
    label: "Transactions",
    items: [
      { type: "link", label: "Point of Sale", href: "/transactions/pos" },
      {
        type: "link",
        label: "Cash Management",
        href: "/transactions/cash-management",
      },
      {
        type: "link",
        label: "X & Z Reports",
        href: "/transactions/xz-reports",
      },
      {
        type: "link",
        label: "Shift History",
        href: "/transactions/shift-history",
        adminOnly: true,
      },
      {
        type: "link",
        label: "Z-Report History",
        href: "/transactions/z-report-history",
        adminOnly: true,
      },
      {
        type: "link",
        label: "Purchase Orders",
        href: "/transactions/purchase-orders",
        adminOnly: true,
      },
      {
        type: "link",
        label: "Receive Orders",
        href: "/transactions/receive-orders",
        adminOnly: true,
      },
    ],
  },
  {
    type: "group",
    label: "Delivery",
    items: [
      { type: "link", label: "Delivery Orders", href: "/delivery/orders" },
      { type: "link", label: "Customers", href: "/delivery/customers" },
    ],
  },
  {
    type: "group",
    label: "File Maintenance",
    adminOnly: true,
    items: [
      { type: "link", label: "Products", href: "/file-maintenance/products" },
      { type: "link", label: "Categories", href: "/file-maintenance/categories" },
      {
        type: "link",
        label: "Unit of Measurement",
        href: "/file-maintenance/units",
      },
      { type: "link", label: "Suppliers", href: "/file-maintenance/suppliers" },
    ],
  },
  {
    type: "group",
    label: "Inventory",
    adminOnly: true,
    items: [
      {
        type: "link",
        label: "Stock Monitor",
        href: "/inventory/stock-monitor",
      },
      {
        type: "link",
        label: "Stock Adjustment",
        href: "/inventory/stock-adjustment",
      },
      { type: "link", label: "Stock Transfer", href: "/inventory/warehouse" },
      {
        type: "link",
        label: "Price Management",
        href: "/price-management",
      },
    ],
  },
  { type: "link", label: "Reports", href: "/reports", adminOnly: true },
  { type: "link", label: "Audit Logs", href: "/audit-logs", adminOnly: true },
  // Cashiers need Settings to change their own password; the page itself
  // hides the admin-only panels.
  { type: "link", label: "Settings", href: "/settings" },
];
