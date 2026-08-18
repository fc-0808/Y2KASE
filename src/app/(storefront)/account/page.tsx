import { redirect } from "next/navigation";

// The account landing page is the order history.
export default function AccountPage() {
  redirect("/account/orders");
}
