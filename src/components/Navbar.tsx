import { Link, useNavigate } from "@tanstack/react-router";
import { Sprout, LogOut, User as UserIcon, Wallet, Settings } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { connectWallet } from "@/lib/blockchain";
import { CONFIG } from "@/lib/config";
import { useState } from "react";

export function Navbar() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletBusy, setWalletBusy] = useState(false);

  const linkBase =
    "text-sm font-semibold text-foreground/80 hover:text-primary transition-colors px-3 py-2 rounded-md";

  function shortAddress(addr: string) {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  }

  async function handleConnectWallet() {
    if (walletAddress) return;
    setWalletBusy(true);
    try {
      const { address } = await connectWallet();
      setWalletAddress(address);
    } catch (e: any) {
      alert(e?.message ?? "Could not connect wallet.");
    } finally {
      setWalletBusy(false);
    }
  }

  return (
    <header className="w-full bg-white/95 backdrop-blur border-b border-border sticky top-0 z-40 shadow-sm">
      <nav className="max-w-7xl mx-auto flex items-center justify-between px-4 sm:px-6 py-3 gap-3">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <Sprout className="w-7 h-7 text-primary" />
          <div className="leading-tight">
            <span className="text-lg font-bold text-primary block">किसान Credit</span>
            <span className="text-[10px] font-semibold text-foreground/45 uppercase tracking-wide hidden sm:block">
              Nagpur · Verified farms
            </span>
          </div>
        </Link>

        {/* Nav links */}
        <div className="hidden md:flex items-center gap-1">
          {user ? (
            <Link to="/dashboard" className={linkBase}>My Farm</Link>
          ) : (
            <Link to="/login" className={linkBase}>For farmers</Link>
          )}
          <Link to="/registry" className={`${linkBase} text-secondary hover:text-secondary`}>
            Buy credits
          </Link>
          <Link to="/about" className={linkBase}>About</Link>
          {/* Admin link — only visible to admin email */}
          {user?.email === CONFIG.app.adminEmail && (
            <Link to="/admin" className={`${linkBase} text-purple-600 hover:text-purple-700`}>
              <Settings className="w-4 h-4 inline mr-1" />Admin
            </Link>
          )}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {/* Connect Wallet */}
          <button
            type="button"
            onClick={handleConnectWallet}
            disabled={walletBusy}
            title={walletAddress ? `Connected: ${walletAddress}` : "Connect MetaMask wallet"}
            className={`hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition
              ${walletAddress
                ? "bg-green-100 text-green-700 border border-green-300 cursor-default"
                : "bg-white border border-border text-foreground/70 hover:border-primary hover:text-primary"
              } disabled:opacity-60`}
          >
            <Wallet className="w-3.5 h-3.5 shrink-0" />
            {walletBusy ? "Connecting…" : walletAddress ? shortAddress(walletAddress) : "Connect Wallet"}
          </button>

          {/* Auth */}
          {user ? (
            <>
              <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-primary/10 text-primary max-w-[140px] truncate">
                <UserIcon className="w-3.5 h-3.5 shrink-0" />
                {user.email?.split("@")[0]}
              </span>
              <button
                type="button"
                onClick={async () => { await signOut(); navigate({ to: "/" }); }}
                className="inline-flex items-center gap-1 text-sm font-semibold text-foreground/60 hover:text-destructive px-2 py-2"
                aria-label="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </>
          ) : (
            <Link to="/login" className="kc-btn-primary text-sm px-4 py-2">
              Farmer login
            </Link>
          )}

          <Link to="/registry" className="md:hidden kc-btn-outline-teal text-sm px-3 py-2">
            Buy
          </Link>
        </div>
      </nav>
    </header>
  );
}
