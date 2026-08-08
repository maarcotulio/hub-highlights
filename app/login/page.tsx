import { LoginForm } from "./_components/LoginForm";

const ERROR_MESSAGES: Record<string, string> = {
  link_expired: "That sign-in link expired or was already used. Request a new one.",
  account_setup_failed: "We couldn't finish setting up your account. Please try again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const initialError = error ? ERROR_MESSAGES[error] : undefined;

  return (
    <div className="flex-1 flex items-center justify-center px-6 py-24">
      <LoginForm initialError={initialError} />
    </div>
  );
}
