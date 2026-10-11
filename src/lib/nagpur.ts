/** Official talukas of Nagpur district, Maharashtra — with villages per taluka */

export const NAGPUR_TALUKAS = [
  "Bhiwapur",
  "Hingna",
  "Kalmeshwar",
  "Kamptee",
  "Katol",
  "Kuhi",
  "Mouda",
  "Nagpur",
  "Narkhed",
  "Parseoni",
  "Ramtek",
  "Savner",
  "Umred",
] as const;

export type NagpurTaluka = (typeof NAGPUR_TALUKAS)[number];

const talukaSet = new Set<string>(NAGPUR_TALUKAS);

export function isNagpurTaluka(value: string): value is NagpurTaluka {
  return talukaSet.has(value);
}

/**
 * Villages per taluka — major villages for each Nagpur taluka.
 * Backend developer can expand this list as needed.
 */
export const VILLAGES_BY_TALUKA: Record<NagpurTaluka, string[]> = {
  Bhiwapur: [
    "Bhiwapur", "Navegaon", "Khairi", "Pimpri", "Walni", "Sawargaon",
    "Chincholi", "Dahegaon", "Manegaon", "Tarsa", "Borgaon", "Khadki",
  ],
  Hingna: [
    "Hingna", "Butibori", "Khapri", "Nildoh", "Wathoda", "Bhandewadi",
    "Kapsi", "Khaperkheda", "Sonegaon", "Tarodi", "Umred Road", "Zingabai Takli",
  ],
  Kalmeshwar: [
    "Kalmeshwar", "Saoner", "Wadegaon", "Mohpa", "Borgaon", "Chikhali",
    "Dighori", "Gumthala", "Kanholibara", "Mandhal", "Nandgaon", "Rohana",
  ],
  Kamptee: [
    "Kamptee", "Khapri", "Bela", "Godhani", "Hudkeshwar", "Jaripatka",
    "Kalamna", "Khairi", "Mansar", "Nara", "Parsodi", "Wadi",
  ],
  Katol: [
    "Katol", "Nandgaon Khandeshwar", "Umri", "Warud", "Borgaon",
    "Dahegaon", "Dhanodi", "Khadgaon", "Mhasala", "Pimpalgaon", "Sindi", "Tirodi",
  ],
  Kuhi: [
    "Kuhi", "Bela", "Chincholi", "Dahegaon", "Dhanodi", "Gondkhairi",
    "Khairi", "Manegaon", "Navegaon", "Pimpri", "Sawargaon", "Walni",
  ],
  Mouda: [
    "Mouda", "Khairi", "Navegaon", "Pimpri", "Walni", "Borgaon",
    "Chincholi", "Dahegaon", "Manegaon", "Sawargaon", "Tarsa", "Umri",
  ],
  Nagpur: [
    "Nagpur City", "Bhandara Road", "Butibori", "Hingna", "Hudkeshwar",
    "Jaripatka", "Kalamna", "Kapsi", "Khapri", "Nandanvan", "Parsodi", "Wadi",
  ],
  Narkhed: [
    "Narkhed", "Borgaon", "Chincholi", "Dahegaon", "Dhanodi", "Gondkhairi",
    "Khairi", "Manegaon", "Navegaon", "Pimpri", "Sawargaon", "Walni",
  ],
  Parseoni: [
    "Parseoni", "Bela", "Borgaon", "Chincholi", "Dahegaon", "Dhanodi",
    "Gondkhairi", "Khairi", "Manegaon", "Navegaon", "Pimpri", "Sawargaon",
  ],
  Ramtek: [
    "Ramtek", "Mansar", "Khapri", "Bela", "Borgaon", "Chincholi",
    "Dahegaon", "Dhanodi", "Gondkhairi", "Khairi", "Manegaon", "Navegaon",
  ],
  Savner: [
    "Savner", "Kalmeshwar", "Mohpa", "Wadegaon", "Borgaon", "Chikhali",
    "Dighori", "Gumthala", "Kanholibara", "Mandhal", "Nandgaon", "Rohana",
  ],
  Umred: [
    "Umred", "Bhiwapur", "Navegaon", "Khairi", "Pimpri", "Walni",
    "Sawargaon", "Chincholi", "Dahegaon", "Manegaon", "Tarsa", "Borgaon",
  ],
};

/** Returns villages for a given taluka, sorted alphabetically */
export function getVillagesForTaluka(taluka: string): string[] {
  if (!isNagpurTaluka(taluka)) return [];
  return [...VILLAGES_BY_TALUKA[taluka]].sort();
}
