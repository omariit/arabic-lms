import { requireStudent } from "@/lib/auth";
import { getLocale, t } from "@/lib/i18n";
import { StudentChat } from "./chat-client";

export default async function ChatPage() {
  await requireStudent();
  const locale = await getLocale();
  const d = await t();
  const T = {
    chatKicker: d.chatKicker, chatTitle: d.chatTitle, chatStartNew: d.chatStartNew,
    chatSubjectPlaceholder: d.chatSubjectPlaceholder, chatMessagePlaceholder: d.chatMessagePlaceholder,
    chatSend: d.chatSend, chatEmpty: d.chatEmpty, chatBack: d.chatBack,
    chatStaff: d.chatStaff,
  };
  return <StudentChat locale={locale} T={T} />;
}
