import Link from "next/link";
import { AccountPanel } from "@/components/account-panel";
import css from "@/components/platform.module.css";
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ uid?: string; token?: string }>;
}) {
  const { uid, token } = await searchParams;
  return (
    <main className={css.page}>
      <h1>PFDkit account</h1>
      <p>
        <Link href="/">Return to the diagram editor</Link>
      </p>
      <AccountPanel
        initialAccount
        recovery={uid && token ? { uid, token } : undefined}
      />
    </main>
  );
}
