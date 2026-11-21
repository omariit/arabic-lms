import { StudentNav } from "@/components/student-nav";

/** Student shell: one consistent navigation bar on every student screen. */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <StudentNav />
      {children}
    </>
  );
}
