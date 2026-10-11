import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

type Props = {
  className?: string;
  signedInLabel?: string;
  signedOutLabel?: string;
  showArrow?: boolean;
};

export function RegisterLink({
  className = "kc-btn-primary inline-flex items-center gap-2",
  signedInLabel = "Register Your Farm",
  signedOutLabel = "Sign in to Register",
  showArrow = true,
}: Props) {
  const { user, loading } = useAuth();
  const arrow = showArrow ? <ArrowRight className="w-4 h-4" /> : null;

  if (loading) {
    return (
      <span className={`${className} opacity-60 pointer-events-none`}>
        {signedInLabel} {arrow}
      </span>
    );
  }

  return (
    <Link to={user ? "/register" : "/login"} className={className}>
      {user ? signedInLabel : signedOutLabel} {arrow}
    </Link>
  );
}
