import { requireTeacher } from "@/lib/auth";
import { StaffManager } from "./staff-client";

export default async function AdminStaffPage() {
  await requireTeacher();
  return <StaffManager />;
}
