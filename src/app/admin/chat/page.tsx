import { requireStaff } from "@/lib/auth";
import { StaffChat } from "./chat-client";

export default async function AdminChatPage() {
  const user = await requireStaff();
  return <StaffChat meId={user.id} />;
}
