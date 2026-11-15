"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type SignedInAccount = { name: string; surname: string; email: string };
const EMALAHLENI_BOUNDARY_QUERY =
  "https://hips-gis.health.gov.za/server/rest/services/local_municipality/FeatureServer/1/query";

// Known Emalahleni localities are offered directly for the Area/Suburb field.
// Street and postal-address suggestions still come from geocoding and are
// accepted only when their coordinates fall inside the official municipal polygon.
const EMALAHLENI_AREA_CATALOG = [
  "Ackerville",
  "Witbank",
  "eMalahleni",
  "Kwa-Guqa",
  "Ga-Nala",
  "Ogies",
  "Kriel",
  "Phola",
  "Vosman",
  "Hlalanikahle",
  "Clewer",
  "Thushanang",
  "Lynnville",
  "Klarinet",
  "Tasbet Park",
  "Del Judor",
  "Modelpark",
  "Ferrobank",
  "Reyno Ridge",
  "Pine Ridge",
  "Klipfontein",
  "Coronation",
  "Ben Fleur",
  "Hoeveld Park",
  "Jackaroo Park",
  "Rietspruit",
  "Balmoral",
  "Greenside",
  "Schoongezicht",
  "Mandela Village",
  "Blancheville",
  "Kwa Thomas Mahlanguville",
];

const getLocalAreaSuggestions = (query: string): AddressSuggestion[] => {
  const normalizedQuery = normalizeLocationText(query);
  if (!normalizedQuery) return [];
  return EMALAHLENI_AREA_CATALOG
    .filter((name) => normalizeLocationText(name).includes(normalizedQuery))
    .map((name, index) => ({
      place_id: -(index + 1),
      display_name: `${name}, Emalahleni, Mpumalanga, South Africa`,
      address: { suburb: name, municipality: "Emalahleni", state: "Mpumalanga", country: "South Africa" },
      area_name: name,
      lat: "",
      lon: "",
    }));
};

type MunicipalityRing = number[][];
type AddressSuggestion = {
  place_id: number;
  display_name: string;
  address?: Record<string, string>;
  area_name?: string;
  address_line?: string;
  lat: string;
  lon: string;
};

const normalizeLocationText = (value: string) =>
  value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

const pointInRing = (longitude: number, latitude: number, ring: MunicipalityRing) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersects =
      (yi > latitude) !== (yj > latitude) &&
      longitude < ((xj - xi) * (latitude - yi)) / ((yj - yi) || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
};

const pointInsideMunicipality = (
  longitude: number,
  latitude: number,
  rings: MunicipalityRing[]
) => {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || !rings.length) return false;
  // Esri polygon rings use an even/odd fill rule, which also excludes interior holes.
  let inside = false;
  for (const ring of rings) {
    if (pointInRing(longitude, latitude, ring)) inside = !inside;
  }
  return inside;
};

const getMunicipalityBounds = (rings: MunicipalityRing[]) => {
  const points = rings.flat();
  if (!points.length) return null;
  const longitudes = points.map((point) => point[0]);
  const latitudes = points.map((point) => point[1]);
  return {
    minLongitude: Math.min(...longitudes),
    minLatitude: Math.min(...latitudes),
    maxLongitude: Math.max(...longitudes),
    maxLatitude: Math.max(...latitudes),
  };
};

const formatPhotonSuggestion = (feature: any): AddressSuggestion | null => {
  const coordinates = feature?.geometry?.coordinates;
  const properties = feature?.properties || {};
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;

  const [longitude, latitude] = coordinates;
  if (typeof longitude !== "number" || typeof latitude !== "number") return null;

  const address: Record<string, string> = {};
  const assign = (key: string, value: unknown) => {
    if (typeof value === "string" && value.trim()) address[key] = value.trim();
  };

  const locality = String(
    properties.locality || properties.district || properties.suburb || properties.city || ""
  ).trim();
  const streetName = String(properties.street || properties.name || "").trim();
  const houseNumber = String(properties.housenumber || "").trim();
  const addressLine = [houseNumber, streetName].filter(Boolean).join(" ").trim();

  assign("suburb", properties.suburb || properties.district || properties.locality);
  assign("neighbourhood", properties.locality);
  assign("village", properties.village);
  assign("town", properties.city);
  assign("city", properties.city);
  assign("municipality", properties.county);
  assign("state", properties.state);
  assign("country", properties.country);
  assign("road", properties.street);
  assign("house_number", properties.housenumber);
  assign("postcode", properties.postcode);

  const displayParts = [
    addressLine || streetName || properties.name,
    locality,
    properties.city && properties.city !== locality ? properties.city : "",
    "Emalahleni",
    "Mpumalanga",
  ].filter((part, index, all) =>
    typeof part === "string" &&
    part.trim() &&
    all.findIndex((candidate) =>
      normalizeLocationText(String(candidate)) === normalizeLocationText(String(part))
    ) === index
  );

  return {
    place_id: Number(properties.osm_id) || Math.round((longitude + 180) * 1000000 + (latitude + 90) * 1000),
    display_name: displayParts.join(", ") || "Emalahleni location",
    address,
    area_name: locality || undefined,
    address_line: addressLine || streetName || String(properties.name || ""),
    lat: String(latitude),
    lon: String(longitude),
  };
};


type TechnicalSection = { id: string; name: string };
type TechnicalSubject = {
  id: string;
  section_id: string;
  name: string;
  display_order: number;
  section_name: string;
};
type CommunitySubject = TechnicalSubject;
type CorporateSubject = TechnicalSubject;
type EnvironmentalSubject = TechnicalSubject;
type FinanceSubject = TechnicalSubject;
type FormData = {

  accountNumber: string;
  fullName: string;
  contactNumber: string;
  email: string;
  preferredContact: string;
  address: string;
  area: string;
  ward: string;
  subject: string;
  otherSubject: string;
  description: string;
  receivedChannel: string;
  dateReported: string;
  department: string;
  section: string;
  otherSection: string;
  priority: string;

};

const createInitialForm = (): FormData => ({
 
  accountNumber: "",
  fullName: "",
  contactNumber: "",
  email: "",
  preferredContact: "SMS",
  address: "",
  area: "",
  ward: "",
  subject: "",
  otherSubject: "",
  description: "",
  receivedChannel: "Call",
  dateReported: "",
  department: "",
  section: "",
  otherSection: "",
  priority: "Medium",

});

const departments = [
  "Technical Services",
  "Finance",
  "Corporate Services",
  "Development Planning",
  "Community Services",
  "Environmental & Waste Management",
];

const complaintSubjects = [

  // BURSARIES AND YOUTH DEVELOPMENT — confirmed database routing
  { subject: "Municipal bursary application enquiry", department: "Corporate Services", section: "Youth Development and Training" },
  { subject: "Bursary application status or delayed feedback", department: "Corporate Services", section: "Youth Development and Training" },
  { subject: "Bursary eligibility or required documents enquiry", department: "Corporate Services", section: "Youth Development and Training" },
  { subject: "Bursary award, payment or renewal enquiry", department: "Corporate Services", section: "Youth Development and Training" },
  { subject: "Bursary application or selection process complaint", department: "Corporate Services", section: "Youth Development and Training" },
  { subject: "Youth development or training programme enquiry", department: "Corporate Services", section: "Youth Development and Training" },
  { subject: "Municipal vacancy or recruitment advert enquiry", department: "Corporate Services", section: "Human Resources" },
  { subject: "Job application submission or acknowledgement issue", department: "Corporate Services", section: "Human Resources" },
  { subject: "Recruitment application status or delayed feedback", department: "Corporate Services", section: "Human Resources" },
  { subject: "Recruitment process or shortlisting complaint", department: "Corporate Services", section: "Human Resources" },
  { subject: "Recruitment advert or application deadline concern", department: "Corporate Services", section: "Human Resources" },
  { subject: "Other bursary or youth training enquiry", department: "Corporate Services", section: "Youth Development and Training" },
  { subject: "Other recruitment or vacancy enquiry", department: "Corporate Services", section: "Human Resources" },

  { subject: "Incorrect municipal account or bill", department: "Finance", section: "Billing" },
  { subject: "Unexpectedly high water charges", department: "Finance", section: "Billing" },
  { subject: "Unexpectedly high electricity charges", department: "Finance", section: "Billing" },
  { subject: "Meter reading dispute", department: "Finance", section: "Metering & Billing" },
  { subject: "Estimated or missing meter reading", department: "Finance", section: "Metering & Billing" },
  { subject: "Water account query", department: "Finance", section: "Billing" },
  { subject: "Electricity account query", department: "Finance", section: "Billing" },
  { subject: "Incorrect property rates or valuation", department: "Finance", section: "Property Rates" },
  { subject: "Property valuation objection or enquiry", department: "Finance", section: "Property Rates" },
  { subject: "Payment not reflected on account", department: "Finance", section: "Payments & Receipts" },
  { subject: "Incorrect account balance", department: "Finance", section: "Payments & Receipts" },
  { subject: "Refund query or delayed refund", department: "Finance", section: "Payments & Receipts" },
  { subject: "Disconnection or restriction dispute", department: "Finance", section: "Credit Control" },
  { subject: "Municipal debt or payment arrangement enquiry", department: "Finance", section: "Credit Control" },
  { subject: "Other municipal account or billing issue", department: "Finance", section: "Other" },

  
  // DEVELOPMENT PLANNING — land use and building control affecting residents
  { subject: "Building work without approved plans", department: "Development Planning", section: "Building Control" },
  { subject: "Unsafe building or structural concern", department: "Development Planning", section: "Building Control" },
  { subject: "Building plan approval enquiry or delay", department: "Development Planning", section: "Building Control" },
  { subject: "Illegal land use or zoning concern", department: "Development Planning", section: "Land Use Management" },
  { subject: "Unauthorised change of property use", department: "Development Planning", section: "Land Use Management" },
  { subject: "Property development or subdivision enquiry", department: "Development Planning", section: "Town Planning" },
  { subject: "Development affecting neighbouring property", department: "Development Planning", section: "Town Planning" },
  { subject: "Other land use or building control issue", department: "Development Planning", section: "Other" },

  // COMMUNITY SERVICES — existing non-catalogue sections only.
  // Disaster and Emergency Management, Law Enforcement and Traffic Management
  // are loaded directly from public.section_subjects below.
  { subject: "Damaged municipal park or playground", department: "Community Services", section: "Parks and Public Open Spaces" },
  { subject: "Overgrown grass or vegetation in public park", department: "Community Services", section: "Parks and Public Open Spaces" },
  { subject: "Damaged playground equipment", department: "Community Services", section: "Parks and Public Open Spaces" },
  { subject: "Damaged community hall or public facility", department: "Community Services", section: "Community Facilities" },
  { subject: "Community facility maintenance problem", department: "Community Services", section: "Community Facilities" },
  { subject: "Cemetery maintenance or cleanliness problem", department: "Community Services", section: "Cemeteries" },
  { subject: "Cemetery booking or burial service enquiry", department: "Community Services", section: "Cemeteries" },
  { subject: "Library service or facility complaint", department: "Community Services", section: "Libraries" },
  { subject: "Sport field or recreation facility damaged", department: "Community Services", section: "Sports and Recreation" },

  // Environmental and Waste subjects are loaded from public.section_subjects.
];

const sectionsByDepartment: Record<string, string[]> = {
  "Corporate Services": [
    "Youth Development and Training",
    "Human Resources",
  ],
  Finance: ["Revenue Protection"],
  "Technical Services": [
    "Electrical",
    "Water Supply",
    "Sanitation and Sewerage",
    "Roads and Stormwater",
  ],
  "Development Planning": [
    "Building Control",
    "Land Use Management",
    "Town Planning",
    "Other",
  ],
  "Community Services": [
    "Disaster and Emergency Management",
    "Law Enforcement",
    "Traffic Management",
    "Arts and Culture",
    "Cemeteries",
    "Community Facilities",
    "Libraries",
    "Parks and Public Open Spaces",
    "Social and Community Development",
    "Sports and Recreation",
  ],
  "Environmental & Waste Management": [
    "Waste Management",
    "Environmental Management & Compliance",
    "Parks, Cemeteries & Open Space Management",
    "Other",
  ],
};

const channels = [
  "Walk-in",
  "Call",
  "Referral",
];

const contactMethods = [
  "SMS",
  "Email",
];

const wards = Array.from(

  { length: 36 },

  (_, index) => `Ward ${index + 1}`

);


function NavIcon({ type }: { type: string }) {

  const common = {

    width: 17,
    height: 17,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,

  };

  switch (type) {

    case "dashboard":

      return (

        <svg {...common}>

          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />

        </svg>

      );

    case "complaints":

      return (

        <svg {...common}>

          <path d="M4 4h16v13H7l-3 3V4Z" />

          <path d="M8 8h8M8 12h5" />

        </svg>

      );



    case "requests":

      return (

        <svg {...common}>

          <path d="M5 3h14v18H5z" />

          <path d="M8 7h8M8 11h8M8 15h5" />

        </svg>

      );



    case "departments":

      return (

        <svg {...common}>

          <rect x="3" y="3" width="18" height="18" rx="2" />

          <path d="M8 21V8h8v13M5 12h3M16 12h3M5 16h3M16 16h3" />

        </svg>

      );



    case "reports":

      return (

        <svg {...common}>

          <path d="M4 19V5M4 19h17" />

          <path d="m7 15 4-5 3 3 5-7" />

        </svg>

      );



    case "users":

      return (

        <svg {...common}>

          <circle cx="9" cy="8" r="3" />

          <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />

          <path d="M16 5.5a3 3 0 0 1 0 5.8M18 14c1.8.8 3 2.6 3 5" />

        </svg>

      );



    case "settings":

      return (

        <svg {...common}>

          <circle cx="12" cy="12" r="3" />

          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 1.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V20h-2.6v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1-1.8-1.8.1-.1A1.7 1.7 0 0 0 8 15a1.7 1.7 0 0 0-1.5-1H6v-2.6h.5A1.7 1.7 0 0 0 8 10a1.7 1.7 0 0 0-.3-1.9l-.1-.1 1.8-1.8.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5V5h2.6v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9.3l.1-.1 1.8 1.8-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1H21V14h-.1a1.7 1.7 0 0 0-1.5 1Z" />

        </svg>

      );



    default:

      return null;

  }

}



function SectionTitle({

  number,
  title,
  description,

}: {

  number: string;
  title: string;
  description: string;

}) {

  return (

    <div className="flex items-start gap-3.5 mb-6">

      <div className="w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br from-green-700 to-green-900 text-white flex items-center justify-center text-xs font-extrabold shadow-sm shadow-green-900/15">

        {number}

      </div>



      <div>

        <h2 className="text-base font-extrabold tracking-tight text-slate-900">

          {title}

        </h2>



        <p className="text-sm leading-5 text-slate-500 mt-1">

          {description}

        </p>

      </div>

    </div>

  );

}


function Field({

  label,
  required,
  children,
  className = "",

}: {

  label: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;

}) {

  return (

    <div className={className}>

      <label className="block text-xs font-semibold text-slate-700 mb-2">

        {label}



        {required && (

          <span className="text-red-500 ml-1">*</span>

        )}

      </label>



      {children}

    </div>

  );

}

const inputClass =

  "w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-green-700 focus:ring-4 focus:ring-green-700/10";

const selectClass =

  "w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 outline-none transition focus:border-green-700 focus:ring-4 focus:ring-green-700/10";



async function allocateNextComplaintReference(
  supabase: ReturnType<typeof createClient>
): Promise<string> {
  const { data, error } = await supabase.rpc("allocate_complaint_reference");
  if (error) throw error;
  if (typeof data !== "string" || !data.trim()) {
    throw new Error("Supabase did not return a complaint reference number.");
  }

  const sequenceMatch = data.trim().match(/(\d+)$/);
  if (!sequenceMatch) {
    throw new Error(
      "The complaint reference allocator did not return a numeric sequence. Update allocate_complaint_reference in Supabase to return its allocated sequence in the reference."
    );
  }

  const now = new Date();
  const year = String(now.getFullYear()).slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const sequence = sequenceMatch[1].slice(-4).padStart(4, "0");

  return `CRW-${year}${month}${day}-${sequence}`;
}

export default function ComplaintsPage() {
  const [permissionChecked, setPermissionChecked] = useState(false);
  const [pageAllowed, setPageAllowed] = useState(false);
  const [isAdministratorAccount, setIsAdministratorAccount] = useState(false);
  const [isSupervisorAccount, setIsSupervisorAccount] = useState(false);
  const [isCallCentreAgentAccount, setIsCallCentreAgentAccount] = useState(false);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dateLabel, setDateLabel] = useState("");
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signedInAccount, setSignedInAccount] = useState<SignedInAccount>({ name: "Loading", surname: "account", email: "" });

  const [form, setForm] = useState<FormData>(

    createInitialForm()

  );

  // Location autocomplete for the complainant's area and physical/postal address.
  const [locationField, setLocationField] = useState<"area" | "address" | null>(null);
  const [locationSuggestions, setLocationSuggestions] = useState<AddressSuggestion[]>([]);
  const [locationSearching, setLocationSearching] = useState(false);
  const [locationSearchMessage, setLocationSearchMessage] = useState("");
  const [municipalityRings, setMunicipalityRings] = useState<MunicipalityRing[]>([]);
  const [municipalityBoundaryReady, setMunicipalityBoundaryReady] = useState(false);
  const [locationMessage, setLocationMessage] = useState("");
useEffect(() => {
    const controller = new AbortController();
    const loadMunicipalityBoundary = async () => {
      try {
        const params = new URLSearchParams({
          where: "UPPER(localmun_1) LIKE '%EMALAHLENI%' AND UPPER(provincena) LIKE '%MPUMALANGA%'",
          outFields: "localmun_1,provincena",
          returnGeometry: "true",
          outSR: "4326",
          f: "json",
        });
        const response = await fetch(`${EMALAHLENI_BOUNDARY_QUERY}?${params.toString()}`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error("Municipal boundary service request failed.");
        const payload = await response.json();
        const features = Array.isArray(payload.features) ? payload.features : [];
        const rings = features.flatMap((feature: any) =>
          Array.isArray(feature.geometry?.rings) ? feature.geometry.rings : []
        ) as MunicipalityRing[];
        if (!rings.length) throw new Error("Official Emalahleni boundary was not returned.");
        setMunicipalityRings(rings);
        setMunicipalityBoundaryReady(true);
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("Could not load the official Emalahleni boundary:", error);
          setMunicipalityRings([]);
          setMunicipalityBoundaryReady(false);
        }
      }
    };
    loadMunicipalityBoundary();
    return () => controller.abort();
  }, []);

  const locationQuery = locationField === "area" ? form.area : locationField === "address" ? form.address : "";

  useEffect(() => {
    if (!locationField || locationQuery.trim().length < 2) {
      setLocationSuggestions([]);
      setLocationSearching(false);
      setLocationSearchMessage(locationQuery.trim() ? "Enter at least 2 characters to search." : "");
      return;
    }

    const localAreaMatches = locationField === "area"
      ? getLocalAreaSuggestions(locationQuery)
      : [];

    if (!municipalityBoundaryReady || municipalityRings.length === 0) {
      setLocationSuggestions(localAreaMatches);
      setLocationSearching(false);
      setLocationSearchMessage(
        localAreaMatches.length
          ? ""
          : "Loading the official Emalahleni boundary before searching street addresses."
      );
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLocationSearching(true);
      setLocationSearchMessage("");
      try {
        const runPhotonSearch = async (query: string) => {
          const bounds = getMunicipalityBounds(municipalityRings);
          if (!bounds) return [];
          const params = new URLSearchParams({
            q: query,
            lat: "-25.88",
            lon: "29.24",
            zoom: "10",
            limit: "50",
            lang: "en",
            countrycode: "za",
            bbox: `${bounds.minLongitude},${bounds.minLatitude},${bounds.maxLongitude},${bounds.maxLatitude}`,
          });
          const response = await fetch(`https://photon.komoot.io/api/?${params.toString()}`, {
            signal: controller.signal,
            headers: { Accept: "application/geo+json, application/json" },
          });
          if (!response.ok) throw new Error(`Location search returned ${response.status}.`);
          const payload = await response.json();
          const features = Array.isArray(payload.features) ? payload.features : [];
          return features
            .map(formatPhotonSuggestion)
            .filter((item: AddressSuggestion | null): item is AddressSuggestion => item !== null)
            .filter((item: AddressSuggestion) =>
              pointInsideMunicipality(Number(item.lon), Number(item.lat), municipalityRings)
            );
        };

        // Search the exact text typed by the user inside Emalahleni's bounding box.
        // Every candidate is then checked against the exact municipal polygon.
        const suggestions = locationField === "address"
          ? await runPhotonSearch(locationQuery.trim())
          : await runPhotonSearch(`${locationQuery.trim()}, Emalahleni`);

        // De-duplicate identical labels returned for different OSM feature types.
        const combinedSuggestions = [...localAreaMatches, ...suggestions];
        const uniqueSuggestions = combinedSuggestions.filter((item: AddressSuggestion, index: number, all: AddressSuggestion[]) =>
          all.findIndex((candidate) =>
            normalizeLocationText(candidate.display_name) === normalizeLocationText(item.display_name)
          ) === index
        );

        setLocationSuggestions(uniqueSuggestions);
        setLocationSearchMessage(
          uniqueSuggestions.length
            ? ""
            : "No matching location was found inside Emalahleni. Try a suburb name or include the street name."
        );
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setLocationSuggestions(localAreaMatches);
          setLocationSearchMessage(
            localAreaMatches.length
              ? "Showing Emalahleni areas. Street-address search is temporarily unavailable."
              : "Location search is temporarily unavailable. Please try again or enter the address manually."
          );
          console.error("Emalahleni Photon search failed:", error);
        }
      } finally {
        if (!controller.signal.aborted) setLocationSearching(false);
      }
    }, 450);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [locationField, locationQuery, municipalityBoundaryReady, municipalityRings]);

  const applyLocationSuggestion = (suggestion: AddressSuggestion) => {
    const areaName =
      suggestion.area_name ||
      suggestion.address?.suburb ||
      suggestion.address?.neighbourhood ||
      suggestion.address?.village ||
      suggestion.address?.town ||
      suggestion.address?.city ||
      "";

    const selectedField = locationField;
    setForm((previous) => {
      if (selectedField === "area") {
        return { ...previous, area: areaName || suggestion.display_name.split(",")[0].trim() };
      }
      if (selectedField === "address") {
        return {
          ...previous,
          address: suggestion.address_line || suggestion.display_name,
        };
      }
      return previous;
    });
    setLocationSuggestions([]);
    setLocationField(null);
    setLocationSearchMessage("");
    setLocationMessage(
      selectedField === "area"
        ? "Area selected. Enter the street or postal address in the address field."
        : "Address selected. Your Area / Suburb selection has been kept unchanged."
    );
  };






  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [currentReference, setCurrentReference] = useState("");
  const [referenceLoadError, setReferenceLoadError] = useState("");
  const [notificationMessage, setNotificationMessage] = useState("");
  const [totalComplaints, setTotalComplaints] = useState<number>(0);
  const [technicalSections, setTechnicalSections] = useState<TechnicalSection[]>([]);
  const [technicalSubjects, setTechnicalSubjects] = useState<TechnicalSubject[]>([]);
  const [technicalCatalogueLoading, setTechnicalCatalogueLoading] = useState(true);
  const [technicalCatalogueError, setTechnicalCatalogueError] = useState("");
  const [communitySections, setCommunitySections] = useState<TechnicalSection[]>([]);
  const [communitySubjects, setCommunitySubjects] = useState<CommunitySubject[]>([]);
  const [communityCatalogueLoading, setCommunityCatalogueLoading] = useState(true);
  const [communityCatalogueError, setCommunityCatalogueError] = useState("");
  const [corporateSections, setCorporateSections] = useState<TechnicalSection[]>([]);
  const [corporateSubjects, setCorporateSubjects] = useState<CorporateSubject[]>([]);
  const [corporateCatalogueLoading, setCorporateCatalogueLoading] = useState(true);
  const [corporateCatalogueError, setCorporateCatalogueError] = useState("");
  const [environmentalSections, setEnvironmentalSections] = useState<TechnicalSection[]>([]);
  const [environmentalSubjects, setEnvironmentalSubjects] = useState<EnvironmentalSubject[]>([]);
  const [environmentalCatalogueLoading, setEnvironmentalCatalogueLoading] = useState(true);
  const [environmentalCatalogueError, setEnvironmentalCatalogueError] = useState("");
  const [financeSections, setFinanceSections] = useState<TechnicalSection[]>([]);
  const [financeSubjects, setFinanceSubjects] = useState<FinanceSubject[]>([]);
  const [financeCatalogueLoading, setFinanceCatalogueLoading] = useState(true);
  const [financeCatalogueError, setFinanceCatalogueError] = useState("");
  const [routingDepartments, setRoutingDepartments] = useState<{ id: string; name: string }[]>([]);
  const [routingSections, setRoutingSections] = useState<{ id: string; department_id: string; name: string }[]>([]);
  const [routingSubjects, setRoutingSubjects] = useState<{ id: string; department_id: string; section_id: string; name: string; display_order: number }[]>([]);
  const [routingCatalogueLoading, setRoutingCatalogueLoading] = useState(true);
  const [routingCatalogueError, setRoutingCatalogueError] = useState("");

  useEffect(() => {
    let active = true;
    const loadRoutingCatalogue = async () => {
      setRoutingCatalogueLoading(true);
      setRoutingCatalogueError("");
      const supabase = createClient();
      const [departmentResult, sectionResult, subjectResult] = await Promise.all([
        supabase.from("departments").select("id, name").eq("is_active", true).order("name"),
        supabase.from("sections").select("id, department_id, name").eq("is_active", true).order("name"),
        supabase.from("section_subjects").select("id, department_id, section_id, name, display_order").eq("is_active", true).order("display_order", { ascending: true }),
      ]);
      if (!active) return;
      const error = departmentResult.error || sectionResult.error || subjectResult.error;
      if (error) {
        setRoutingCatalogueError(error.message || "Unable to load department routing options.");
      } else {
        setRoutingDepartments(departmentResult.data || []);
        setRoutingSections(sectionResult.data || []);
        setRoutingSubjects(subjectResult.data || []);
      }
      setRoutingCatalogueLoading(false);
    };
    void loadRoutingCatalogue();
    return () => { active = false; };
  }, []);

  // Keep the previously approved, department-specific section catalogue.
  // In particular, Corporate Services must expose ONLY these two sections.
  const approvedSectionNames = sectionsByDepartment[form.department] || [];
  const selectedRoutingDepartment = routingDepartments.find((item) => item.name === form.department);
  const availableRoutingSections = routingSections
    .filter((item) =>
      item.department_id === selectedRoutingDepartment?.id &&
      approvedSectionNames.includes(item.name)
    )
    .sort((a, b) => approvedSectionNames.indexOf(a.name) - approvedSectionNames.indexOf(b.name));
  const selectedRoutingSection = availableRoutingSections.find((item) => item.name === form.section);
  const availableRoutingSubjects = routingSubjects
    .filter((item) =>
      item.department_id === selectedRoutingDepartment?.id &&
      item.section_id === selectedRoutingSection?.id
    )
    .sort((a, b) => a.display_order - b.display_order);



  useEffect(() => {
    let active = true;

    const loadTechnicalCatalogue = async () => {
      setTechnicalCatalogueLoading(true);
      setTechnicalCatalogueError("");
      const supabase = createClient();

      const { data: department, error: departmentError } = await supabase
        .from("departments")
        .select("id")
        .eq("name", "Technical Services")
        .eq("is_active", true)
        .maybeSingle();

      if (departmentError || !department) {
        if (active) {
          setTechnicalCatalogueError(
            departmentError?.message || "Technical Services department was not found."
          );
          setTechnicalCatalogueLoading(false);
        }
        return;
      }

      const [{ data: sectionRows, error: sectionError }, { data: subjectRows, error: subjectError }] =
        await Promise.all([
          supabase
            .from("sections")
            .select("id, name")
            .eq("department_id", department.id)
            .eq("is_active", true),
          supabase
            .from("section_subjects")
            .select("id, section_id, name, display_order")
            .eq("department_id", department.id)
            .eq("is_active", true)
            .order("display_order", { ascending: true }),
        ]);

      if (sectionError || subjectError) {
        if (active) {
          setTechnicalCatalogueError(
            sectionError?.message || subjectError?.message ||
              "Unable to load Technical Services sections and subjects."
          );
          setTechnicalCatalogueLoading(false);
        }
        return;
      }

      const preferredOrder = [
        "Electrical",
        "Water Supply",
        "Sanitation and Sewerage",
        "Roads and Stormwater",
      ];
      const sortedSections = (sectionRows || []).sort((a, b) => {
        const aIndex = preferredOrder.indexOf(a.name);
        const bIndex = preferredOrder.indexOf(b.name);
        return (aIndex < 0 ? 999 : aIndex) - (bIndex < 0 ? 999 : bIndex);
      });
      const sectionNames = new Map((sectionRows || []).map((section) => [section.id, section.name]));
      const mappedSubjects: TechnicalSubject[] = (subjectRows || []).map((subject) => ({
        ...subject,
        section_name: sectionNames.get(subject.section_id) || "",
      }));

      if (active) {
        setTechnicalSections(sortedSections);
        setTechnicalSubjects(mappedSubjects.filter((subject) => Boolean(subject.section_name)));
        setTechnicalCatalogueLoading(false);
      }
    };

    void loadTechnicalCatalogue();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    const loadCorporateSections = async () => {
      setCorporateCatalogueLoading(true);
      setCorporateCatalogueError("");
      const supabase = createClient();

      const { data: department, error: departmentError } = await supabase
        .from("departments")
        .select("id")
        .eq("name", "Corporate Services")
        .eq("is_active", true)
        .maybeSingle();

      if (departmentError || !department) {
        if (active) {
          setCorporateCatalogueError(
            departmentError?.message || "Corporate Services department was not found."
          );
          setCorporateCatalogueLoading(false);
        }
        return;
      }

      const [sectionResult, subjectResult] = await Promise.all([
        supabase
          .from("sections")
          .select("id, name")
          .eq("department_id", department.id)
          .eq("is_active", true),
        supabase
          .from("section_subjects")
          .select("id, section_id, name, display_order")
          .eq("department_id", department.id)
          .eq("is_active", true)
          .order("display_order", { ascending: true }),
      ]);

      if (sectionResult.error || subjectResult.error) {
        if (active) {
          setCorporateCatalogueError(
            sectionResult.error?.message || subjectResult.error?.message ||
              "Unable to load Corporate Services sections and subjects."
          );
          setCorporateCatalogueLoading(false);
        }
        return;
      }

      const sectionRows = sectionResult.data || [];
      const subjectRows = subjectResult.data || [];
      const preferredOrder = ["Youth Development and Training", "Human Resources"];
      const allowedCorporateSections = new Set(preferredOrder);
      const visibleSectionRows = sectionRows.filter((section) => allowedCorporateSections.has(section.name));
      const sortedSections = [...visibleSectionRows].sort((a, b) => {
        const ai = preferredOrder.indexOf(a.name);
        const bi = preferredOrder.indexOf(b.name);
        return ai - bi;
      });
      const sectionNames = new Map(visibleSectionRows.map((section) => [section.id, section.name]));
      const mappedSubjects: CorporateSubject[] = subjectRows
        .filter((subject) => visibleSectionRows.some((section) => section.id === subject.section_id))
        .map((subject) => ({
          ...subject,
          section_name: sectionNames.get(subject.section_id) || "",
        }))
        .filter((subject) => Boolean(subject.section_name));

      if (active) {
        setCorporateSections(sortedSections);
        setCorporateSubjects(mappedSubjects);
        const missing = preferredOrder.filter(
          (expected) => !sortedSections.some((section) => section.name === expected)
        );
        const missingSubjects = preferredOrder.filter((sectionName) =>
          !mappedSubjects.some((subject) => subject.section_name === sectionName)
        );
        const problems = [
          ...(missing.length ? [`Inactive or missing sections: ${missing.join(", ")}`] : []),
          ...(missingSubjects.length ? [`No active subjects configured for: ${missingSubjects.join(", ")}`] : []),
        ];
        setCorporateCatalogueError(problems.join(". "));
        setCorporateCatalogueLoading(false);
      }
    };

    void loadCorporateSections();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    const loadCommunityCatalogue = async () => {
      setCommunityCatalogueLoading(true);
      setCommunityCatalogueError("");
      const supabase = createClient();

      const { data: department, error: departmentError } = await supabase
        .from("departments")
        .select("id")
        .eq("name", "Community Services")
        .eq("is_active", true)
        .maybeSingle();

      if (departmentError || !department) {
        if (active) {
          setCommunityCatalogueError(
            departmentError?.message || "Community Services department was not found."
          );
          setCommunityCatalogueLoading(false);
        }
        return;
      }

      const [{ data: sectionRows, error: sectionError }, { data: subjectRows, error: subjectError }] =
        await Promise.all([
          supabase
            .from("sections")
            .select("id, name")
            .eq("department_id", department.id)
            .eq("is_active", true),
          supabase
            .from("section_subjects")
            .select("id, section_id, name, display_order")
            .eq("department_id", department.id)
            .eq("is_active", true)
            .order("display_order", { ascending: true }),
        ]);

      if (sectionError || subjectError) {
        if (active) {
          setCommunityCatalogueError(
            sectionError?.message || subjectError?.message ||
              "Unable to load Community Services sections and subjects."
          );
          setCommunityCatalogueLoading(false);
        }
        return;
      }

      const preferredOrder = [
        "Disaster and Emergency Management",
        "Law Enforcement",
        "Traffic Management",
        "Arts and Culture",
        "Cemeteries",
        "Community Facilities",
        "Libraries",
        "Parks and Public Open Spaces",
        "Social and Community Development",
        "Sports and Recreation",
      ];
      const sortedSections = (sectionRows || []).sort((a, b) => {
        const ai = preferredOrder.indexOf(a.name);
        const bi = preferredOrder.indexOf(b.name);
        return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) || a.name.localeCompare(b.name);
      });
      const sectionNames = new Map((sectionRows || []).map((section) => [section.id, section.name]));
      const mappedSubjects: CommunitySubject[] = (subjectRows || []).map((subject) => ({
        ...subject,
        section_name: sectionNames.get(subject.section_id) || "",
      }));

      if (active) {
        setCommunitySections(sortedSections);
        setCommunitySubjects(mappedSubjects.filter((subject) => Boolean(subject.section_name)));
        setCommunityCatalogueLoading(false);
      }
    };

    void loadCommunityCatalogue();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const loadFinanceCatalogue = async () => {
      setFinanceCatalogueLoading(true);
      setFinanceCatalogueError("");
      const supabase = createClient();
      const { data: department, error: departmentError } = await supabase
        .from("departments").select("id").eq("name", "Finance").eq("is_active", true).maybeSingle();

      if (departmentError || !department) {
        if (active) {
          setFinanceCatalogueError(departmentError?.message || "Finance department was not found.");
          setFinanceCatalogueLoading(false);
        }
        return;
      }

      const [sectionResult, subjectResult] = await Promise.all([
        supabase.from("sections").select("id, name")
          .eq("department_id", department.id).eq("is_active", true).eq("name", "Revenue Protection"),
        supabase.from("section_subjects").select("id, section_id, name, display_order")
          .eq("department_id", department.id).eq("is_active", true)
          .order("display_order", { ascending: true }),
      ]);

      if (sectionResult.error || subjectResult.error) {
        if (active) {
          setFinanceCatalogueError(sectionResult.error?.message || subjectResult.error?.message ||
            "Unable to load the Finance Revenue Protection catalogue.");
          setFinanceCatalogueLoading(false);
        }
        return;
      }

      const sectionRows = sectionResult.data || [];
      const subjectRows = subjectResult.data || [];
      const sectionNames = new Map(sectionRows.map((section) => [section.id, section.name]));
      const mappedSubjects: FinanceSubject[] = subjectRows
        .filter((subject) => sectionRows.some((section) => section.id === subject.section_id))
        .map((subject) => ({ ...subject, section_name: sectionNames.get(subject.section_id) || "" }));

      if (active) {
        setFinanceSections(sectionRows);
        setFinanceSubjects(mappedSubjects);
        setFinanceCatalogueError(!sectionRows.length
          ? "Revenue Protection is not active under Finance."
          : !mappedSubjects.length
            ? "No active electricity-meter subjects are configured for Revenue Protection."
            : "");
        setFinanceCatalogueLoading(false);
      }
    };
    void loadFinanceCatalogue();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;

    const loadEnvironmentalCatalogue = async () => {
      setEnvironmentalCatalogueLoading(true);
      setEnvironmentalCatalogueError("");
      const supabase = createClient();

      const { data: department, error: departmentError } = await supabase
        .from("departments")
        .select("id")
        .eq("name", "Environmental and Waste")
        .eq("is_active", true)
        .maybeSingle();

      if (departmentError || !department) {
        if (active) {
          setEnvironmentalCatalogueError(
            departmentError?.message || 'Environmental and Waste department was not found.'
          );
          setEnvironmentalCatalogueLoading(false);
        }
        return;
      }

      const [sectionResult, subjectResult] = await Promise.all([
        supabase.from("sections").select("id, name")
          .eq("department_id", department.id).eq("is_active", true),
        supabase.from("section_subjects").select("id, section_id, name, display_order")
          .eq("department_id", department.id).eq("is_active", true)
          .order("display_order", { ascending: true }),
      ]);

      if (sectionResult.error || subjectResult.error) {
        if (active) {
          setEnvironmentalCatalogueError(
            sectionResult.error?.message || subjectResult.error?.message ||
              "Unable to load Environmental and Waste sections and subjects."
          );
          setEnvironmentalCatalogueLoading(false);
        }
        return;
      }

      const preferredOrder = [
        "Waste Management",
        "Environmental Management & Compliance",
        "Parks, Cemeteries & Open Space Management",
        "Other",
      ];
      const allowedSections = new Set(preferredOrder);
      const visibleSectionRows = (sectionResult.data || []).filter((section) =>
        allowedSections.has(section.name)
      );
      const sortedSections = [...visibleSectionRows].sort(
        (a, b) => preferredOrder.indexOf(a.name) - preferredOrder.indexOf(b.name)
      );
      const sectionNames = new Map(visibleSectionRows.map((section) => [section.id, section.name]));
      const mappedSubjects: EnvironmentalSubject[] = (subjectResult.data || [])
        .filter((subject) => visibleSectionRows.some((section) => section.id === subject.section_id))
        .map((subject) => ({ ...subject, section_name: sectionNames.get(subject.section_id) || "" }))
        .filter((subject) => Boolean(subject.section_name));

      if (active) {
        setEnvironmentalSections(sortedSections);
        setEnvironmentalSubjects(mappedSubjects);
        const missingSections = preferredOrder.filter(
          (name) => !sortedSections.some((section) => section.name === name)
        );
        const missingSubjects = preferredOrder.filter(
          (name) => !mappedSubjects.some((subject) => subject.section_name === name)
        );
        setEnvironmentalCatalogueError([
          ...(missingSections.length ? [`Missing active sections: ${missingSections.join(", ")}`] : []),
          ...(missingSubjects.length ? [`No active subjects configured for: ${missingSubjects.join(", ")}`] : []),
        ].join(". "));
        setEnvironmentalCatalogueLoading(false);
      }
    };

    void loadEnvironmentalCatalogue();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setDateLabel(new Date().toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short", year: "numeric" }));
    setForm((previous) => ({
      ...previous,
      dateReported: new Date().toISOString().split("T")[0],
    }));

    const supabase = createClient();
    let active = true;
    const loadAccount = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!active || !user) { if (active) window.location.assign("/login"); return; }
      const { count: complaintCount, error: complaintCountError } = await supabase
        .from("complaints")
        .select("id", { count: "exact", head: true });
      if (active && !complaintCountError) {
        setTotalComplaints(complaintCount ?? 0);
      }
      const [{ data: permissionRow, error: permissionError }, { data: profile }] = await Promise.all([
        supabase.from("user_permissions").select("pages").eq("user_id", user.id).maybeSingle(),
        supabase.from("profiles").select("access_level").eq("id", user.id).maybeSingle(),
      ]);
      if (!active) return;
      const metadata = user.user_metadata ?? {};
      const roleCandidates = [profile?.access_level, metadata.access_level, metadata.role, metadata.user_role, metadata.role_name]
        .map((value) => String(value ?? "").toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim());
      const isAdministrator = roleCandidates.some((role) =>
        ["administrator", "system administrator", "admin", "system admin", "super admin", "super administrator", "municipal administrator"].includes(role)
      );
      const isCallCentreAgent = roleCandidates.some((role) =>
        ["call centre agent", "call center agent", "call-centre agent", "call-center agent", "call-centre", "call center"].includes(role)
      );
      const isSupervisor = roleCandidates.some((role) =>
        ["supervisor", "departmental supervisor", "call centre agent supervisor", "call center agent supervisor"].includes(role)
      );
      setIsAdministratorAccount(isAdministrator);
      setIsSupervisorAccount(isSupervisor);
      setIsCallCentreAgentAccount(isCallCentreAgent);

      const permittedPages = Array.isArray(permissionRow?.pages)
        ? permissionRow.pages.filter((p: unknown): p is string => typeof p === "string").map((p) => p.trim().toLowerCase())
        : [];
      // Call Centre Agents have municipality-wide view access to these work areas,
      // even if an older user_permissions row is missing or uses different casing.
      const allowed = isAdministrator || isCallCentreAgent || (!permissionError && permittedPages.includes("Complaints".toLowerCase()));
      setPageAllowed(allowed);
      setPermissionChecked(true);
      if (!allowed) { window.location.replace("/dashboard?access=denied"); return; }
      const fullName = String(metadata.full_name ?? metadata.name ?? metadata.display_name ?? "").trim();
      const name = String(metadata.name ?? metadata.first_name ?? fullName.split(/\s+/)[0] ?? "").trim();
      const surname = String(metadata.surname ?? metadata.last_name ?? fullName.split(/\s+/).slice(1).join(" ") ?? "").trim();
      setSignedInAccount({ name: name || "Signed-in", surname: surname || "user", email: user.email ?? "" });
      try {
        const nextReference = await allocateNextComplaintReference(supabase);
        if (active) {
          setCurrentReference(nextReference);
          setReferenceLoadError("");
        }
      } catch (error) {
        if (active) {
          setReferenceLoadError(error instanceof Error ? error.message : "Unable to allocate a complaint reference.");
        }
      }
    };
    void loadAccount();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (session?.user) {
        const user = session.user;
        const metadata = user.user_metadata ?? {};
        const fullName = String(metadata.full_name ?? metadata.name ?? metadata.display_name ?? "").trim();
        const name = String(metadata.name ?? metadata.first_name ?? fullName.split(/\s+/)[0] ?? "").trim();
        const surname = String(metadata.surname ?? metadata.last_name ?? fullName.split(/\s+/).slice(1).join(" ") ?? "").trim();
        setSignedInAccount({ name: name || "Signed-in", surname: surname || "user", email: user.email ?? "" });
      }
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  const handleSignOut = async () => {
    setSigningOut(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      setSigningOut(false);
      window.alert(`Unable to sign out: ${error.message}`);
      return;
    }
    window.location.href = "/login";
  };



  const sections =
    form.department === "Finance"
      ? financeSections.map((section) => section.name)
      : form.department === "Technical Services"
      ? technicalSections.map((section) => section.name)
      : form.department === "Community Services"
        ? communitySections.map((section) => section.name)
        : form.department === "Corporate Services"
          ? (corporateSections.length
              ? corporateSections.map((section) => section.name)
              : sectionsByDepartment["Corporate Services"])
          : form.department === "Environmental & Waste Management"
            ? environmentalSections.map((section) => section.name)
          : form.department && sectionsByDepartment[form.department]
            ? sectionsByDepartment[form.department]
            : [];

  const communityCatalogueSections = [
    "Disaster and Emergency Management",
    "Law Enforcement",
    "Traffic Management",
  ];
  const availableComplaintSubjects =
    form.department === "Finance"
      ? financeSubjects.filter((item) => item.section_name === form.section).map((item) => ({ subject: item.name, department: "Finance", section: item.section_name }))
      : form.department === "Technical Services"
      ? technicalSubjects
          .filter((item) => item.section_name === form.section)
          .map((item) => ({
            subject: item.name,
            department: "Technical Services",
            section: item.section_name,
          }))
      : form.department === "Community Services" && communityCatalogueSections.includes(form.section)
        ? communitySubjects
            .filter((item) => item.section_name === form.section)
            .map((item) => ({
              subject: item.name,
              department: "Community Services",
              section: item.section_name,
            }))
        : form.department === "Corporate Services"
          ? corporateSubjects
              .filter((item) => item.section_name === form.section)
              .map((item) => ({
                subject: item.name,
                department: "Corporate Services",
                section: item.section_name,
              }))
        : form.department === "Environmental & Waste Management"
          ? environmentalSubjects
              .filter((item) => item.section_name === form.section)
              .map((item) => ({
                subject: item.name,
                department: "Environmental & Waste Management",
                section: item.section_name,
              }))
        : complaintSubjects.filter(
            (item) => item.department === form.department && item.section === form.section
          );



  const updateField = (

    field: keyof FormData,

    value: string

  ) => {

    setForm((previous) => ({

      ...previous,

      [field]: value,

    }));

  };


  const handleSubjectChange = (selection: string) => {
    const separator = "|||";
    const separatorIndex = selection.indexOf(separator);
    const selectedDepartment = separatorIndex >= 0 ? selection.slice(0, separatorIndex) : "";
    const subject = separatorIndex >= 0 ? selection.slice(separatorIndex + separator.length) : selection;

    if (form.department === "Finance") {
      const selectedFinanceSubject = financeSubjects.find(
        (item) => item.name === subject && item.section_name === form.section &&
          (!selectedDepartment || selectedDepartment === "Finance")
      );
      setForm((previous) => ({
        ...previous,
        subject: selectedFinanceSubject?.name || "",
        otherSubject: "",
        department: "Finance",
      }));
      return;
    }

    if (form.department === "Technical Services") {
      const selectedTechnicalSubject = technicalSubjects.find(
        (item) =>
          item.name === subject &&
          item.section_name === form.section &&
          (!selectedDepartment || selectedDepartment === "Technical Services")
      );
      setForm((previous) => ({
        ...previous,
        subject: selectedTechnicalSubject?.name || "",
        otherSubject: "",
        department: "Technical Services",
      }));
      return;
    }

    if (form.department === "Environmental & Waste Management") {
      const selectedEnvironmentalSubject = environmentalSubjects.find(
        (item) =>
          item.name === subject &&
          item.section_name === form.section &&
          (!selectedDepartment || selectedDepartment === "Environmental & Waste Management")
      );
      setForm((previous) => ({
        ...previous,
        subject: selectedEnvironmentalSubject?.name || "",
        otherSubject: "",
        department: "Environmental & Waste Management",
      }));
      return;
    }

    const selectedIssue = complaintSubjects.find(
      (item) =>
        item.subject === subject &&
        (!selectedDepartment || item.department === selectedDepartment) &&
        (!form.section || item.section === form.section)
    );

    if (!selectedIssue) {
      setForm((previous) => ({ ...previous, subject, otherSubject: "" }));
      return;
    }

    setForm((previous) => ({
      ...previous,
      subject: selectedIssue.subject,
      department: selectedIssue.department,
      section: selectedIssue.section,
      otherSubject: "",
      otherSection: "",
    }));
  };


  const handleDepartmentChange = (

    department: string

  ) => {

    setForm((previous) => ({

      ...previous,

      department,

      section: "",

      otherSection: "",

      subject: "",

      otherSubject: "",

    }));

  };



  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setSubmitError("");
    setNotificationMessage("");
    setSubmitted(false);
    setReferenceNumber("");

    let complaintSaved = false;

    try {
      const supabase = createClient();
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!authData.user) {
        throw new Error("Your session has expired. Please sign in again before capturing a complaint.");
      }

      if (form.accountNumber && !/^\d{1,10}$/.test(form.accountNumber.trim())) {
        throw new Error("Account number must contain numbers only and must not exceed 10 digits.");
      }
      if (!form.fullName.trim()) {
        throw new Error("Enter the complainant's full name.");
      }
      if (form.preferredContact === "SMS" && !form.contactNumber.trim()) {
        throw new Error("Enter a contact number to receive the complaint reference by SMS.");
      }
      if (form.contactNumber.trim() && !/^\d{10}$/.test(form.contactNumber.trim())) {
        throw new Error("Contact number must contain exactly 10 digits.");
      }
      if (form.preferredContact === "Email" && !form.email.trim()) {
        throw new Error("Enter an email address to receive the complaint reference by email.");
      }
      if (!form.department) throw new Error("Select the responsible department.");
      if (!form.section) throw new Error("Select the responsible section.");
      if (!form.subject) throw new Error("Select the complaint subject.");
      if (!form.description.trim()) throw new Error("Enter a description of the complaint.");

      const selectedDepartment = routingDepartments.find((item) => item.name === form.department);
      const selectedSection = routingSections.find(
        (item) => item.name === form.section && item.department_id === selectedDepartment?.id
      );
      const selectedSubject = routingSubjects.find(
        (item) => item.name === form.subject &&
          item.department_id === selectedDepartment?.id &&
          item.section_id === selectedSection?.id
      );
      if (!selectedDepartment || !selectedSection || !selectedSubject) {
        throw new Error("The selected department, section or subject is no longer available. Refresh the routing options and try again.");
      }

      const generatedReference = currentReference.trim();
      if (!generatedReference) {
        throw new Error(referenceLoadError || "A complaint reference has not been allocated yet. Refresh the page or try again.");
      }

      const { error: insertError } = await supabase.from("complaints").insert({
        reference_number: generatedReference,
        account_number: form.accountNumber.trim() || null,
        full_name: form.fullName.trim(),
        contact_number: form.contactNumber.trim() || null,
        email: form.email.trim() || null,
        preferred_contact: form.preferredContact,
        address: form.address.trim() || null,
        area: form.area.trim() || null,
        ward: form.ward || null,
        subject: form.subject,
        department_id: selectedDepartment.id,
        section_id: selectedSection.id,
        department: selectedDepartment.name,
        section: selectedSection.name,
        description: form.description.trim(),
        received_channel: form.receivedChannel,
        date_reported: form.dateReported || new Date().toISOString().slice(0, 10),
        priority: form.priority,
        status: "Received",
        // Record the authenticated municipal staff member who captured this complaint.
        // This is separate from full_name, which belongs to the complainant.
        created_by: authData.user.id,
      });
      if (insertError) {
        const details = [insertError.message, insertError.details, insertError.hint, insertError.code]
          .filter(Boolean)
          .join(" | ");
        throw new Error(details || "Supabase rejected the complaint insert. Check the complaints table columns and Row Level Security policy.");
      }
      complaintSaved = true;

      setReferenceNumber(generatedReference);
      setSubmitted(true);

      const messages: string[] = [];

      {
        try {
          const notifyResponse = await fetch("/api/complaints/notify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              method: form.preferredContact,
              phone: form.contactNumber.trim(),
              email: form.email.trim(),
              customerName: form.fullName.trim(),
              referenceNumber: generatedReference,
              subject: "Complaint received - awaiting Call Centre classification",
            }),
          });
          const notifyResult = await notifyResponse.json().catch(() => ({}));
          messages.push(notifyResponse.ok
            ? `Acknowledgement notification accepted by the ${form.preferredContact} provider.`
            : `Complaint saved, but the ${form.preferredContact} notification could not be sent: ${notifyResult.error || "notification service is not configured"}`);
        } catch {
          messages.push(`Complaint saved. The ${form.preferredContact} notification service could not be reached.`);
        }
      }
      setNotificationMessage(messages.join(" "));
      // Reserve the next number for the next complaint this agent captures.
      try {
        const nextReference = await allocateNextComplaintReference(supabase);
        setCurrentReference(nextReference);
        setReferenceLoadError("");
      } catch (error) {
        setReferenceLoadError(error instanceof Error ? error.message : "The next reference could not be allocated.");
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      const errorDetails = error instanceof Error
        ? error.message
        : error && typeof error === "object"
          ? [
              (error as { message?: string }).message,
              (error as { details?: string }).details,
              (error as { hint?: string }).hint,
              (error as { code?: string }).code,
            ].filter(Boolean).join(" | ") || JSON.stringify(error)
          : String(error);
      console.error("Complaint submission failed:", errorDetails, error);
      setSubmitError(
        complaintSaved
          ? `The complaint was saved, but a later step failed: ${errorDetails || "Unknown error"}`
          : errorDetails || "Unable to save the complaint. Check the complaints table columns and Supabase permissions."
      );
      if (complaintSaved) {
        setNotificationMessage("The complaint record exists in the database. Check the message above before submitting again, to avoid creating a duplicate.");
      }
    } finally {
      setSubmitting(false);
    }
  };


  const clearForm = () => {

    const newForm = createInitialForm();

    newForm.dateReported = new Date()

      .toISOString()

      .split("T")[0];



    setForm(newForm);
    setSubmitted(false);
    setSubmitError("");
    setReferenceNumber("");

  };



  if (!permissionChecked || !pageAllowed) {
    return <main className="flex min-h-screen items-center justify-center bg-[#f5f7f4] p-6 text-sm font-semibold text-slate-700">Checking page permissions…</main>;
  }

  return (

    <div className="min-h-screen bg-[#f5f7f4] text-slate-900">

      {sidebarOpen && (
        <button type="button" aria-label="Close navigation overlay" onClick={() => setSidebarOpen(false)} className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-[2px] lg:hidden" />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[264px] flex-col border-r border-slate-200 bg-white shadow-sm transition-transform duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}
      >
        <div className="relative border-b border-slate-100 bg-gradient-to-br from-white via-white to-green-50/80 px-4 pb-4 pt-4">
          <div className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-green-900 via-green-700 to-yellow-400" />
          <div className="flex items-center gap-3">
            <div className="relative flex h-[66px] w-[66px] shrink-0 items-center justify-center rounded-2xl border border-green-800/15 bg-gradient-to-br from-white via-white to-green-50 p-2 shadow-md shadow-green-950/10">
              <span aria-hidden="true" className="absolute -left-px top-3 h-8 w-[3px] rounded-r-full bg-gradient-to-b from-green-800 to-yellow-400" />
              <img src="/Emalahleni%20Logo.png" alt="Emalahleni Local Municipality logo" className="h-full w-full object-contain" />
              <span aria-hidden="true" className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full border-[3px] border-white bg-yellow-400 shadow-sm" />
              <span aria-hidden="true" className="absolute bottom-0 left-1/2 h-[3px] w-6 -translate-x-1/2 rounded-full bg-green-800" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-green-800">Mpumalanga</p>
              <h2 className="mt-1 text-[16px] font-black leading-tight tracking-tight text-slate-950">EMALAHLENI</h2>
              <p className="mt-1 text-[10px] font-semibold text-slate-600">Local Municipality</p>
              <div className="mt-2 flex items-center gap-1.5">
                <span className="h-[3px] w-6 rounded-full bg-green-800" />
                <span className="h-[3px] w-3 rounded-full bg-yellow-400" />
                <span className="ml-1 text-[9px] text-slate-400">Serving our community</span>
              </div>
            </div>
            <button type="button" onClick={() => setSidebarOpen(false)} aria-label="Close menu" className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-green-50 hover:text-green-800 lg:hidden">
              <NavIcon type="close" />
            </button>
          </div>
        </div>

        {/* NAVIGATION — MATCHES THE DASHBOARD GREEN SIDEBAR */}
        <nav className="flex-1 overflow-y-auto bg-[#14532d] px-3 py-5 text-white">
          <div className="mb-3 flex items-center justify-between px-3">
            <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[#FFE082]">Main menu</span>
            <span className="text-[9px] font-semibold text-white/50">01</span>
          </div>
          <div className="space-y-1">
            <Link href="/dashboard" onClick={() => setSidebarOpen(false)} className="group flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-white/85 transition-all duration-200 hover:bg-white/10 hover:text-white">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white/70 transition-colors group-hover:bg-white/15 group-hover:text-[#FFE082]"><NavIcon type="dashboard" /></span>
              <span className="min-w-0 flex-1 text-[11px] font-bold">Dashboard</span>
              <span aria-hidden="true" className="ml-auto translate-x-[-3px] text-white/0 transition-all duration-200 group-hover:translate-x-0 group-hover:text-white">→</span>
            </Link>
            <Link href="/complaints" onClick={() => setSidebarOpen(false)} aria-current="page" className="group relative flex items-center gap-2.5 rounded-xl bg-white/10 px-2.5 py-2 text-white shadow-sm ring-1 ring-inset ring-white/10 transition-all duration-200 hover:bg-white/[0.14]">
              <span aria-hidden="true" className="absolute bottom-2 left-0 top-2 w-[3px] rounded-r-full bg-white" />
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-[#FFE082]"><NavIcon type="complaints" /></span>
              <span className="min-w-0 flex-1 text-[11px] font-bold">Complaints</span>
              <span aria-hidden="true" className="ml-auto text-white transition-transform duration-200 group-hover:translate-x-1">→</span>
            </Link>
            <Link href="/departments" onClick={() => setSidebarOpen(false)} className="group flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-white/85 transition-all duration-200 hover:bg-white/10 hover:text-white">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white/70 transition-colors group-hover:bg-white/15 group-hover:text-[#FFE082]"><NavIcon type="departments" /></span>
              <span className="min-w-0 flex-1 text-[11px] font-bold">Departments</span>
              <span aria-hidden="true" className="ml-auto translate-x-[-3px] text-white/0 transition-all duration-200 group-hover:translate-x-0 group-hover:text-white">→</span>
            </Link>
            <Link href="/reports" onClick={() => setSidebarOpen(false)} className="group flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-white/85 transition-all duration-200 hover:bg-white/10 hover:text-white">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white/70 transition-colors group-hover:bg-white/15 group-hover:text-[#FFE082]"><NavIcon type="reports" /></span>
              <span className="min-w-0 flex-1 text-[11px] font-bold">Reports</span>
              <span aria-hidden="true" className="ml-auto translate-x-[-3px] text-white/0 transition-all duration-200 group-hover:translate-x-0 group-hover:text-white">→</span>
            </Link>
          </div>

          {(isAdministratorAccount || isSupervisorAccount || isCallCentreAgentAccount) && permissionChecked && (
            <>
              <div className="mb-3 mt-7 flex items-center justify-between px-3">
                <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[#FFE082]">
                  {isAdministratorAccount ? "USER MANAGEMENT" : "MANAGEMENT"}
                </span>
                <span className="text-[9px] font-semibold text-white/50">02</span>
              </div>
              <div className="space-y-1">
                {(isAdministratorAccount
                  ? [
                      { href: "/users", label: "Users & Roles", icon: "users" },
                      { href: "/staff", label: "Staff", icon: "users" },
                      { href: "/settings", label: "Settings", icon: "settings" },
                    ]
                  : [
                      { href: "/staff", label: "Staff", icon: "users" },
                    ]
                ).map((item) => {
                  const active = typeof window !== "undefined" && window.location.pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setSidebarOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={`group relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition-all duration-200 ${
                        active
                          ? "bg-white/10 text-white shadow-sm ring-1 ring-inset ring-white/10"
                          : "text-white/85 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                        active ? "bg-white/10 text-[#FFE082]" : "bg-white/10 text-white/70 group-hover:bg-white/15 group-hover:text-[#FFE082]"
                      }`}>
                        <NavIcon type={item.icon} />
                      </span>
                      <span className="min-w-0 flex-1 text-[11px] font-bold">{item.label}</span>
                      <span className={`ml-auto transition-all ${
                        active ? "translate-x-0 text-white" : "translate-x-[-3px] text-white/0 group-hover:translate-x-0 group-hover:text-white"
                      }`}>→</span>
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </nav>
        <div className="border-t border-white/15 bg-[#14532d] p-3">
          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/10 p-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F2C94C] text-[11px] font-extrabold text-green-950">
              {`${signedInAccount.name.charAt(0)}${signedInAccount.surname.charAt(0)}`}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-white">
                {`${signedInAccount.name} ${signedInAccount.surname}`}
              </p>
              <p className="mt-0.5 truncate text-[10px] text-green-100/70">
                {signedInAccount.email || "Authenticated account"}
              </p>
            </div>
            <span className="h-2 w-2 shrink-0 rounded-full bg-green-500" title="Signed in" />
          </div>
        </div>
      </aside>

      <main className="min-h-screen pb-12 lg:pl-[264px]">



        <header className="sticky top-0 z-30 flex min-h-[70px] items-center justify-between gap-3 border-b border-slate-200/80 bg-white/95 px-4 shadow-sm backdrop-blur sm:px-6 xl:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => setSidebarOpen(true)} aria-label="Open navigation" className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-green-50 lg:hidden">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <div className="min-w-0">
              <div aria-hidden="true" className="mb-1 flex items-center gap-1.5">
                <span className="h-[3px] w-12 rounded-full bg-yellow-400" />
                <span className="h-[3px] w-5 rounded-full bg-green-800/70" />
              </div>
              <h1 className="mt-1 truncate text-xl font-extrabold tracking-tight text-slate-900">Complaints Management System</h1>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-500 sm:flex">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
              <span>{dateLabel}</span>
            </div>
            <button type="button" aria-label="Notifications" className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:border-green-200 hover:text-green-800">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full border-2 border-white bg-yellow-400" />
            </button>
            <div className="relative">
              <button type="button" aria-haspopup="menu" aria-expanded={accountMenuOpen} onClick={() => setAccountMenuOpen((open) => !open)} className="flex max-w-[230px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-left transition hover:border-green-300 hover:bg-green-50/50 sm:px-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-800 text-[10px] font-bold uppercase text-white">{`${signedInAccount.name.charAt(0)}${signedInAccount.surname.charAt(0)}`}</span>
                <span className="hidden min-w-0 sm:block"><span className="block truncate text-[11px] font-bold text-slate-800">{`${signedInAccount.name} ${signedInAccount.surname}`}</span><span className="block max-w-[140px] truncate text-[10px] text-slate-500">{signedInAccount.email || "Signed-in account"}</span></span>
                <svg className="shrink-0 text-slate-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
              </button>
              {accountMenuOpen && <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Currently signed in</p>
                <p className="mt-1 truncate text-sm font-bold text-slate-900">{`${signedInAccount.name} ${signedInAccount.surname}`}</p>
                <p className="mt-0.5 break-all text-xs text-slate-500">{signedInAccount.email || "Email not available"}</p>
                <div className="my-3 border-t border-slate-100" />
                <button type="button" role="menuitem" disabled={signingOut} onClick={handleSignOut} className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/></svg>
                  {signingOut ? "Signing out..." : "Sign out"}
                </button>
              </div>}
            </div>
          </div>
        </header>



        <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 xl:px-8">



          {/* PAGE INTRODUCTION */}
          <section className="relative mb-7 overflow-hidden rounded-[26px] bg-gradient-to-br from-[#124b2b] via-[#176438] to-[#0f3922] px-6 py-7 text-white shadow-[0_18px_45px_rgba(20,83,45,0.13)] sm:px-8 sm:py-8">
            <div className="pointer-events-none absolute -right-10 -top-20 h-64 w-64 rounded-full border-[34px] border-white/[0.05]" />
            <div className="pointer-events-none absolute -bottom-24 right-[24%] h-52 w-52 rounded-full border-[24px] border-yellow-300/[0.08]" />
            <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div className="max-w-2xl">
                <div aria-hidden="true" className="mb-4 flex items-center gap-1.5">
                  <span className="h-[3px] w-12 rounded-full bg-yellow-400" />
                  <span className="h-[3px] w-5 rounded-full bg-white/70" />
                </div>
                <h2 className="text-2xl font-light leading-tight tracking-tight sm:text-3xl">
                  Record the issue.
                  <span className="block font-extrabold text-yellow-300">
                    Get it to the right team.
                  </span>
                </h2>
                <p className="mt-3 max-w-xl text-sm leading-6 text-green-50/85">
                  Guide the call centre through a clear capture process: identify the reporter, describe the service issue, and select the responsible team.
                </p>
              </div>
              <div
                aria-label={`Total complaints: ${totalComplaints.toLocaleString("en-ZA")}`}
                className="relative flex min-h-[83px] min-w-[257px] items-center gap-3 overflow-hidden rounded-2xl border border-white/25 bg-white/[0.10] px-5 py-3 shadow-sm"
              >
                <div className="pointer-events-none absolute -right-8 -top-12 h-32 w-32 rounded-full border-[14px] border-white/[0.045]" />
                <div className="relative flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-xl bg-[#FFE082] text-green-900 shadow-sm">
                  <svg
                    width="21"
                    height="21"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M9 5h9a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9" />
                    <path d="m4 5 2 2 4-4" />
                    <path d="M9 11h7M9 15h5" />
                  </svg>
                </div>
                <div className="relative min-w-0">
                  <p className="text-[12px] font-extrabold uppercase leading-none tracking-[0.08em] text-green-50/80">
                    Total complaints
                  </p>
                  <p className="mt-2 text-[30px] font-black leading-none tabular-nums text-white">
                    {totalComplaints.toLocaleString("en-ZA")}
                  </p>
                </div>
              </div>
            </div>
          </section>


          {/* SUBMISSION ERROR */}

          {submitError && (

            <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">

              <p className="font-bold">Complaint could not be saved</p>

              <p className="mt-1 break-words">{submitError}</p>

              <p className="mt-2 text-xs">Check that your Supabase complaints table has the required columns and that Row Level Security permits inserts for signed-in users.</p>

            </div>

          )}



          {/* SUCCESS */}



          {submitted && (

            <div className="mb-5 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-green-700 text-white flex items-center justify-center shrink-0">
                  <svg

                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"

                  >

                    <path d="m5 12 4 4L19 6" />

                  </svg>
                </div>
                <div>

                  <p className="text-[12px] font-bold text-green-800">

                    Complaint captured successfully

                  </p>



                  <p className="text-[11px] text-green-700 mt-0.5">
                    The customer's complaint has been captured successfully and is ready for departmental processing.
                  </p>
                  {notificationMessage && <p className="mt-2 text-[11px] font-medium text-green-800">{notificationMessage}</p>}



                </div>



              </div>



            </div>

          )}



          <form onSubmit={handleSubmit}>



            <div id="reporter-step" className="scroll-mt-28 bg-white border border-slate-200/80 rounded-2xl mb-6 shadow-sm shadow-slate-200/40 overflow-hidden">



              <div className="p-5 sm:p-6 lg:p-7">



                <SectionTitle

                  number="01"

                  title="Who Is Reporting This Issue?"

                  description="Capture the complainant's details and contact information so the municipality can follow up."

                />



                {/* IDENTIFIED COMPLAINANT */}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">



                    <Field label="Account Number">



                      <input

                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={10}
                        value={form.accountNumber}

                        onChange={(event) =>

                          updateField(

                            "accountNumber",

                            event.target.value.replace(/\D/g, "").slice(0, 10)

                          )

                        }

                        placeholder="Enter account number if applicable"

                        className={inputClass}

                      />

                    </Field>

                    <Field label="Reference Number" required>
                      <input
                        type="text"
                        value={currentReference || (referenceLoadError ? "Reference unavailable" : "Allocating reference...")}
                        readOnly
                        aria-readonly="true"
                        className={`${inputClass} bg-slate-50 font-extrabold tracking-wide text-green-900 cursor-not-allowed`}
                        placeholder="Allocating reference..."
                      />
                      {referenceLoadError && <p role="alert" className="mt-1 text-[10px] leading-4 text-red-600">{referenceLoadError}</p>}
                    </Field>



                    <Field

                      label="Full Name"

                      required

                    >



                      <input

                        type="text"

                        value={form.fullName}

                        onChange={(event) =>

                          updateField(

                            "fullName",

                            event.target.value

                          )

                        }

                        placeholder="Enter full name"

                        required

                        className={inputClass}

                      />



                    </Field>



                    <Field
                      label="Contact Number"
                      required={form.preferredContact === "SMS"}
                    >



                      <input

                        type="tel"

                        inputMode="numeric"

                        pattern="[0-9]{10}"

                        maxLength={10}

                        value={form.contactNumber}

                        onChange={(event) =>

                          updateField(

                            "contactNumber",

                            event.target.value.replace(/\D/g, "").slice(0, 10)

                          )

                        }

                        placeholder="e.g. 0820000000"

                        required={form.preferredContact === "SMS"}

                        title="Enter exactly 10 digits."

                        className={inputClass}

                      />



                    </Field>



                    <Field label="Email Address" required={form.preferredContact === "Email"}>



                      <input

                        type="email"

                        value={form.email}

                        onChange={(event) =>

                          updateField(

                            "email",

                            event.target.value

                          )

                        }

                        placeholder="customer@email.com"

                        className={inputClass}

                      />



                    </Field>



                    <Field label="Preferred Communication">



                      <select

                        value={form.preferredContact}

                        onChange={(event) =>

                          updateField(

                            "preferredContact",

                            event.target.value

                          )

                        }

                        className={selectClass}

                      >



                        {contactMethods.map((method) => (

                            <option

                              key={method}

                              value={method}

                            >

                              {method}

                            </option>

                          ))}



                      </select>



                    </Field>



                    <Field label="Area / Suburb">
                      <div className="relative">
                        <input
                          type="text"
                          value={form.area}
                          onFocus={() => setLocationField("area")}
                          onChange={(event) => {
                            updateField("area", event.target.value);
                            setLocationField("area");
                            setLocationMessage("");
                          }}
                          placeholder="Search an Emalahleni area or suburb"
                          autoComplete="off"
                          className={inputClass}
                        />
                        {locationField === "area" && form.area.trim().length >= 3 && (
                          <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
                            {locationSearching && <p className="px-3 py-2 text-xs text-slate-500">Searching Emalahleni areas…</p>}
                            {!locationSearching && locationSearchMessage && <p className="px-3 py-2 text-xs text-slate-500">{locationSearchMessage}</p>}
                            {locationSuggestions.map((suggestion) => (
                              <button
                                key={suggestion.place_id}
                                type="button"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => applyLocationSuggestion(suggestion)}
                                className="block w-full rounded-lg px-3 py-2 text-left text-xs text-slate-700 hover:bg-green-50"
                              >
                                <span className="block font-semibold">{suggestion.address?.suburb || suggestion.address?.neighbourhood || suggestion.address?.town || suggestion.address?.city || suggestion.display_name.split(",")[0]}</span>
                                <span className="mt-0.5 block text-[11px] text-slate-500">{suggestion.display_name}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </Field>

                    <Field label="Ward">



                      <select

                        value={form.ward}

                        onChange={(event) =>

                          updateField(

                            "ward",

                            event.target.value

                          )

                        }

                        className={selectClass}

                      >



                        <option value="">

                          Select ward

                        </option>



                        {wards.map((ward) => (

                          <option

                            key={ward}

                            value={ward}

                          >

                            {ward}

                          </option>

                        ))}



                      </select>



                    </Field>



                    <Field
                      label="Residential / Postal Address"
                      className="md:col-span-2"
                    >
                      <div className="relative">
                        <input
                          type="text"
                          value={form.address}
                          onFocus={() => setLocationField("address")}
                          onChange={(event) => {
                            updateField("address", event.target.value);
                            setLocationField("address");
                            setLocationMessage("");
                          }}
                          placeholder="Search an Emalahleni street or postal address"
                          autoComplete="off"
                          className={inputClass}
                        />
                        {locationField === "address" && form.address.trim().length >= 3 && (
                          <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
                            {locationSearching && <p className="px-3 py-2 text-xs text-slate-500">Searching Emalahleni addresses…</p>}
                            {!locationSearching && locationSearchMessage && <p className="px-3 py-2 text-xs text-slate-500">{locationSearchMessage}</p>}
                            {locationSuggestions.map((suggestion) => (
                              <button
                                key={suggestion.place_id}
                                type="button"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => applyLocationSuggestion(suggestion)}
                                className="block w-full rounded-lg px-3 py-2 text-left text-xs text-slate-700 hover:bg-green-50"
                              >
                                <span className="block font-semibold">{suggestion.address_line || suggestion.display_name.split(",")[0]}</span>
                                <span className="mt-0.5 block text-[11px] text-slate-500">{suggestion.display_name}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <p className="mt-1.5 text-[11px] text-slate-500">Street suggestions are limited to addresses inside Emalahleni Local Municipality. Selecting an address will not change your Area / Suburb selection.</p>
                    </Field>



                  </div>
                  {locationMessage && (
                    <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-xs font-medium text-green-800" role="status">
                      {locationMessage}
                    </p>
                  )}









              </div>



            </div>



            {/* ================================================= */}
            {/* 02 COMPLAINT DETAILS — CENTRAL CALL CENTRE QUEUE */}
            {/* ================================================= */}

            <div id="issue-step" className="scroll-mt-28 bg-white border border-slate-200/80 rounded-2xl mb-6 shadow-sm shadow-slate-200/40 overflow-hidden">
              <div className="p-5 sm:p-6 lg:p-7">
                <SectionTitle
                  number="02"
                  title="Complaint Details"
                  description="Record the issue and select the department, section and subject responsible for handling it."
                />

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Field label="Date and Time Reported" required>
                    <input
                      type="date"
                      value={form.dateReported}
                      onChange={(event) => updateField("dateReported", event.target.value)}
                      required
                      className={inputClass}
                    />
                  </Field>

                  <Field label="How Was the Complaint Received?" required>
                    <select
                      value={form.receivedChannel}
                      onChange={(event) => updateField("receivedChannel", event.target.value)}
                      required
                      className={selectClass}
                    >
                      {channels.map((channel) => (
                        <option key={channel} value={channel}>{channel}</option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Department" required>
                    <select
                      value={form.department}
                      onChange={(event) => {
                        updateField("department", event.target.value);
                        updateField("section", "");
                        updateField("subject", "");
                      }}
                      required
                      disabled={routingCatalogueLoading || routingDepartments.length === 0}
                      className={selectClass}
                    >
                      <option value="">{routingCatalogueLoading ? "Loading departments..." : "Select department"}</option>
                      {departments
                        .map((departmentName) => routingDepartments.find((item) => item.name === departmentName))
                        .filter((department): department is { id: string; name: string } => Boolean(department))
                        .map((department) => (
                          <option key={department.id} value={department.name}>{department.name}</option>
                        ))}
                    </select>
                  </Field>

                  <Field label="Section" required>
                    <select
                      value={form.section}
                      onChange={(event) => {
                        updateField("section", event.target.value);
                        updateField("subject", "");
                      }}
                      required
                      disabled={!form.department || routingCatalogueLoading}
                      className={selectClass}
                    >
                      <option value="">Select section</option>
                      {availableRoutingSections.map((section) => (
                        <option key={section.id} value={section.name}>{section.name}</option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Complaint Subject" required className="md:col-span-2">
                    <select
                      value={form.subject}
                      onChange={(event) => updateField("subject", event.target.value)}
                      required
                      disabled={!form.section || routingCatalogueLoading}
                      className={selectClass}
                    >
                      <option value="">Select complaint subject</option>
                      {availableRoutingSubjects.map((subject) => (
                        <option key={subject.id} value={subject.name}>{subject.name}</option>
                      ))}
                    </select>
                  </Field>

                  {routingCatalogueError && (
                    <div role="alert" className="md:col-span-2 lg:col-span-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                      Could not load department, section and subject options: {routingCatalogueError}
                    </div>
                  )}
                  {!routingCatalogueLoading && form.department && availableRoutingSections.length === 0 && !routingCatalogueError && (
                    <div role="alert" className="md:col-span-2 lg:col-span-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      No approved sections are currently available for {form.department}. The wider database section list is intentionally hidden.
                    </div>
                  )}

                  <Field label="Describe the Complaint" required className="md:col-span-2 lg:col-span-4">
                    <textarea
                      value={form.description}
                      onChange={(event) => updateField("description", event.target.value)}
                      placeholder="Provide a clear description of the complaint, including what happened and any relevant details..."
                      required
                      rows={6}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-[12px] text-gray-700 outline-none resize-none focus:border-green-700 focus:ring-2 focus:ring-green-700/10 placeholder:text-gray-300"
                    />
                  </Field>
                </div>

              </div>
            </div>

            {/* ACTIONS */}

            {/* ================================================= */}



            <div className="sticky bottom-3 z-10 bg-white/95 backdrop-blur-xl border border-slate-200 rounded-2xl p-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-[0_12px_35px_rgba(15,23,42,0.10)]">



              <div>



                <p className="text-[11px] font-semibold text-gray-700">

                  Complaint Capture

                </p>



                <p className="text-[11px] text-gray-400 mt-0.5">

                  Fields marked with{" "}

                  <span className="text-red-500">*</span>{" "}

                  are required.

                </p>



              </div>



              <div className="flex items-center gap-2 w-full sm:w-auto">



                <Link

                  href="/dashboard"

                  className="flex-1 sm:flex-none h-11 px-5 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-semibold flex items-center justify-center hover:bg-gray-50 transition"

                >

                  Cancel

                </Link>



                <button

                  type="button"

                  onClick={clearForm}

                  className="flex-1 sm:flex-none h-11 px-5 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-semibold hover:bg-gray-50 transition"

                >

                  Clear Form

                </button>



                <button

                  type="submit"

                  disabled={submitting || !currentReference}

                  className="flex-1 sm:flex-none h-11 px-6 rounded-xl bg-gradient-to-r from-green-800 to-green-700 text-white text-xs font-bold hover:from-green-900 hover:to-green-800 transition shadow-md shadow-green-900/15 disabled:cursor-not-allowed disabled:opacity-60"

                >

                  {submitting ? "Saving Complaint..." : !currentReference ? "Allocating Reference..." : "Submit Complaint"}

                </button>



              </div>



            </div>



          </form>



        </div>



      </main>



      {/* MUNICIPAL BRANDING */}



      <div className="fixed bottom-0 left-0 right-0 h-[3px] bg-green-800 z-50">

        <div className="h-full w-[28%] bg-yellow-400" />

      </div>



    </div>

  );

}

