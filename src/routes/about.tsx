import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteFooter } from "@/components/SiteFooter";
import { IMAGES } from "@/lib/images";
import { Banknote, MapPin, ShieldCheck, Users } from "lucide-react";

export const Route = createFileRoute("/about")({
  component: AboutPage,
});

function AboutPage() {
  return (
    <div className="bg-white">
      <section className="relative h-48 md:h-56 overflow-hidden">
        <img
          src={IMAGES.greenCrops}
          alt="Green farm fields"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-primary/70" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 h-full flex items-center">
          <h1 className="text-3xl md:text-4xl font-bold text-white">About किसान Credit</h1>
        </div>
      </section>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
        <p className="text-lg text-foreground/75 leading-relaxed">
          We help <strong>small farmers in Nagpur district</strong> earn fair money from carbon
          credits, and help <strong>companies</strong> buy credits they can trust — with clear
          records and certificates.
        </p>
        <p className="mt-3 text-foreground/65 italic">हर शेतकऱ्याला योग्य भाव, पारदर्शक नोंदणी</p>

        <div className="mt-10 grid sm:grid-cols-2 gap-5">
          {[
            {
              i: Users,
              t: "Farmers first",
              d: "90% of every sale is reserved for the farmer.",
              img: IMAGES.farmerPortrait,
            },
            {
              i: MapPin,
              t: "Nagpur only",
              d: "Registration limited to Nagpur district talukas.",
              img: IMAGES.ruralLandscape,
            },
            {
              i: ShieldCheck,
              t: "Verified farms",
              d: "GPS location and farm details on record.",
              img: IMAGES.farmerField,
            },
            {
              i: Banknote,
              t: "Fair buyers",
              d: "Companies get a proper certificate after purchase.",
              img: IMAGES.handsSoil,
            },
          ].map((f) => (
            <div key={f.t} className="rounded-xl border border-border overflow-hidden bg-white shadow-sm">
              <img src={f.img} alt="" className="w-full h-32 object-cover" />
              <div className="p-4">
                <f.i className="w-5 h-5 text-primary" />
                <h3 className="mt-2 font-bold text-foreground">{f.t}</h3>
                <p className="mt-1 text-sm text-foreground/65">{f.d}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link to="/register" className="kc-btn-primary">
            Register a farm
          </Link>
          <Link to="/registry" className="kc-btn-outline-teal">
            Buy credits
          </Link>
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}
