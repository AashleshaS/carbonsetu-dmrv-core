import { Link } from "@tanstack/react-router";
import { Sprout } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-[#f8faf8]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 grid gap-8 md:grid-cols-3">
        <div>
          <div className="flex items-center gap-2 text-primary font-bold text-lg">
            <Sprout className="w-5 h-5" />
            किसान Credit
          </div>
          <p className="mt-2 text-sm text-foreground/65 leading-relaxed">
            Verified carbon credits from Nagpur district farms. Fair payment to farmers.
          </p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-foreground/50">Farmers</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link to="/register" className="text-foreground/75 hover:text-primary">
                Register your farm
              </Link>
            </li>
            <li>
              <Link to="/about" className="text-foreground/75 hover:text-primary">
                How it works
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-foreground/50">Buyers</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link to="/registry" className="text-foreground/75 hover:text-primary">
                Buy verified credits
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border py-4 text-center text-xs text-foreground/45">
        Nagpur, Maharashtra · Photos from{" "}
        <a
          href="https://unsplash.com"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-primary"
        >
          Unsplash
        </a>
        {" · "}
        <Link to="/admin" className="hover:text-primary transition">
          Admin
        </Link>
      </div>
    </footer>
  );
}
