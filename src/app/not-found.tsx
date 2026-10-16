import AppLayout from "./(app)/layout";
import { NotFoundContent } from "@/components/not-found-page";

export const metadata = { title: "Page not found · Dukaan Manager" };

/** Any address that does not exist: shown inside the app's own menu and header, with a way back. */
export default function NotFound() {
  return (
    <AppLayout>
      <NotFoundContent />
    </AppLayout>
  );
}
