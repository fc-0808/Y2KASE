import type { Metadata } from "next";
import { SignInClient } from "./SignInClient";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to your Y2KASE account to track orders and save your favourites.",
};

export default function SignInPage() {
  return (
    <div className="flex min-h-[80dvh] items-center justify-center px-4 py-16">
      <SignInClient />
    </div>
  );
}
