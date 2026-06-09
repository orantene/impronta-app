// Parallel-route host for the Catalog Map. The `drawer` slot renders the
// intercepted field editor (@drawer/(.)[fieldKey]) over the list, while a
// direct visit / refresh of /catalog/[fieldKey] falls through to the real
// full page. super_admin gating is inherited from the platform/admin layout.

export default function CatalogLayout({
  children,
  drawer,
}: {
  children: React.ReactNode;
  drawer: React.ReactNode;
}) {
  return (
    <>
      {children}
      {drawer}
    </>
  );
}
