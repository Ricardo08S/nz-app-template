// Navigation items structure
export type NavSingle = {
  _type: "single";
  label: string;
  href: string;
  icon?: string;
};
export type NavDropdown = {
  _type: "dropdown";
  label: string;
  children: NavSingle[];
};
export type NavDivider = {
  _type: "divider";
};
export type NavItem = NavSingle | NavDropdown;
export type SidebarItem = NavSingle | NavDivider;
