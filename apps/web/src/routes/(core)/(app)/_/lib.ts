// Navigation items structure
export type NavSingle = {
  _type: "single";
  label: string;
  href: string;
};
export type NavDropdown = {
  _type: "dropdown";
  label: string;
  children: NavSingle[];
};
export type NavItem = NavSingle | NavDropdown;
