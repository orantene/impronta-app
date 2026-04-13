import { DirectoryQueryProvider } from "@/components/directory/query-provider";

export default function DirectoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DirectoryQueryProvider>{children}</DirectoryQueryProvider>;
}
