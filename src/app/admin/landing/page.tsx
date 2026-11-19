import { requireTeacher } from "@/lib/auth";
import { LandingEditor } from "./landing-editor";

export default async function AdminLandingPage() {
  await requireTeacher();
  return <LandingEditor />;
}
