import { createFileRoute, Link } from "@tanstack/react-router";
import { RegisterLink } from "@/components/RegisterLink";
import { SiteFooter } from "@/components/SiteFooter";
import { IMAGES } from "@/lib/images";
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  Leaf,
  MapPin,
  ShieldCheck,
  Sprout,
} from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="bg-white">
      {/* Hero with real farm photo */}
      <section className="relative min-h-[520px] md:min-h-[580px] flex items-end overflow-hidden">
        <img
          src={IMAGES.heroFarm}
          alt="Green farmland in India"
          className="absolute inset-0 w-full h-full object-cover"
          loading="eager"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pb-12 md:pb-16 pt-32 w-full">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 text-white text-xs font-semibold backdrop-blur-sm border border-white/20">
              <ShieldCheck className="w-3.5 h-3.5 text-accent" />
              Nagpur district · Government-ready records
            </span>
            <h1 className="mt-4 text-4xl md:text-6xl font-bold text-white leading-tight">
              Carbon credits that <span className="text-accent">pay the farmer</span>
            </h1>
            <p className="mt-4 text-lg md:text-xl text-white/90 font-medium">
              हर शेतकऱ्याला योग्य भाव, पारदर्शक नोंदणी
            </p>
            <p className="mt-2 text-white/75 text-base max-w-lg">
              Register your farm in minutes. Buyers purchase verified credits — 90% goes to you.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <RegisterLink className="kc-btn-primary inline-flex items-center gap-2 shadow-lg !bg-primary hover:!bg-[#154d1a]" />
              <Link
                to="/registry"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-md font-semibold bg-white text-primary hover:bg-white/95 transition"
              >
                I want to buy credits <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section className="bg-[#f0f7f0] border-y border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { icon: ShieldCheck, label: "Verified farms", sub: "GPS + records" },
            { icon: Banknote, label: "90% to farmer", sub: "Direct payout" },
            { icon: MapPin, label: "Nagpur only", sub: "Local talukas" },
            { icon: BadgeCheck, label: "Trusted buyers", sub: "Clear certificates" },
          ].map(({ icon: Icon, label, sub }) => (
            <div key={label} className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Icon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-bold text-foreground text-sm">{label}</p>
                <p className="text-xs text-foreground/55">{sub}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Two paths: farmer / buyer */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16 md:py-20">
        <h2 className="text-3xl font-bold text-center text-foreground">Who are you?</h2>
        <p className="text-center text-foreground/60 mt-2 max-w-xl mx-auto">
          Simple paths — no technical jargon.
        </p>
        <div className="mt-10 grid md:grid-cols-2 gap-8">
          <div className="rounded-2xl overflow-hidden border border-border shadow-md bg-white">
            <img
              src={IMAGES.farmerPortrait}
              alt="Indian farmer standing in cotton field"
              className="w-full h-52 object-cover object-top"
              loading="lazy"
            />
            <div className="p-6">
              <div className="flex items-center gap-2 text-primary font-bold text-lg">
                <Sprout className="w-5 h-5" />
                I am a farmer
              </div>
              <p className="mt-2 text-foreground/70 text-sm leading-relaxed">
                Register your gat number, village, and farm size. We verify your land and help you
                earn from carbon credits.
              </p>
              <ul className="mt-4 space-y-2 text-sm text-foreground/80">
                <li className="flex gap-2">
                  <BadgeCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  Free registration
                </li>
                <li className="flex gap-2">
                  <BadgeCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  Marathi + English form
                </li>
                <li className="flex gap-2">
                  <BadgeCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  Money straight to your bank
                </li>
              </ul>
              <div className="mt-6">
                <RegisterLink signedInLabel="Go to my farm" signedOutLabel="Register my farm" />
              </div>
            </div>
          </div>

          <div className="rounded-2xl overflow-hidden border border-border shadow-md bg-white">
            <img
              src={IMAGES.buyerOffice}
              alt="Corporate professional in a sustainable office"
              className="w-full h-52 object-cover object-center"
              loading="lazy"
            />
            <div className="p-6">
              <div className="flex items-center gap-2 text-secondary font-bold text-lg">
                <Leaf className="w-5 h-5" />
                I am a buyer
              </div>
              <p className="mt-2 text-foreground/70 text-sm leading-relaxed">
                Browse verified credits from real Nagpur farms. Pay online and receive an official
                certificate for your company.
              </p>
              <ul className="mt-4 space-y-2 text-sm text-foreground/80">
                <li className="flex gap-2">
                  <BadgeCheck className="w-4 h-4 text-secondary shrink-0 mt-0.5" />
                  Filter by price & CO₂
                </li>
                <li className="flex gap-2">
                  <BadgeCheck className="w-4 h-4 text-secondary shrink-0 mt-0.5" />
                  See village & farm size
                </li>
                <li className="flex gap-2">
                  <BadgeCheck className="w-4 h-4 text-secondary shrink-0 mt-0.5" />
                  Download certificate
                </li>
              </ul>
              <Link to="/registry" className="mt-6 kc-btn-outline-teal inline-flex items-center gap-2">
                Browse credits <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* How it works — simple */}
      <section className="bg-muted/30 border-t border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div>
              <h2 className="text-3xl font-bold text-foreground">How it works for farmers</h2>
              <ol className="mt-6 space-y-5">
                {[
                  { n: "1", t: "Register", d: "Name, mobile, village, taluka, gat no., farm size, GPS." },
                  { n: "2", t: "We verify", d: "Your farm is checked against satellite data." },
                  { n: "3", t: "You get paid", d: "When a company buys your credit, 90% reaches you." },
                ].map((s) => (
                  <li key={s.n} className="flex gap-4">
                    <span className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center font-bold shrink-0">
                      {s.n}
                    </span>
                    <div>
                      <p className="font-bold text-foreground">{s.t}</p>
                      <p className="text-sm text-foreground/65 mt-0.5">{s.d}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <img
              src={IMAGES.farmerField}
              alt="Farmer working in crops"
              className="rounded-2xl shadow-lg w-full h-80 object-cover"
              loading="lazy"
            />
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
