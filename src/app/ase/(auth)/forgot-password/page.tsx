import { getSetting } from "@/lib/settings";
import { AuthShell } from "../AuthShell";
import { ForgotForm } from "./ForgotForm";

export const metadata = { title: "Reset password" };

export default async function ForgotPage() {
  const [general, sec] = await Promise.all([getSetting("general"), getSetting("security")]);
  return (
    <AuthShell company={general.companyName}>
      <ForgotForm minutes={sec.resetTokenMinutes} />
    </AuthShell>
  );
}
