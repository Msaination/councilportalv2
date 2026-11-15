"use client";



import { useEffect, useMemo, useState, type ReactNode } from "react";



import Image from "next/image";



import Link from "next/link";

import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";



function ArrowRightIcon() {



  return (



    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">



      <path d="M5 12h14M13 6l6 6-6 6" />



    </svg>



  );



}



type Priority = "Low" | "Medium" | "High" | "Critical";



type Status = "New" | "Assigned" | "In Progress" | "Escalated" | "Resolved";



type Complaint = {



  databaseId: string;



  id: string;



  subject: string;



  department: string;



  section: string;



  priority: Priority;



  status: Status;



  dateReported: string;



  ward: string;



  complainant: string;



  description: string;



  assignedTo: string;
  accountNumber: string;
  contactNumber: string;
  email: string;
  preferredContact: string;
  address: string;
  area: string;
  receivedChannel: string;
  isAnonymous: boolean;
  createdAt: string;
  attachments: Array<{ fileName: string; url: string; sizeBytes: number; contentType: string }>;

};



type Department = {



  id: string;



  name: string;



  description: string;



  sections: string[];



  color: string;



  lightColor: string;



  borderColor: string;



};



const departmentStyles = [

  { color: "#2563eb", lightColor: "#eff6ff", borderColor: "#bfdbfe" },

  { color: "#7c3aed", lightColor: "#f5f3ff", borderColor: "#ddd6fe" },

  { color: "#0891b2", lightColor: "#ecfeff", borderColor: "#a5f3fc" },

  { color: "#d97706", lightColor: "#fffbeb", borderColor: "#fde68a" },

  { color: "#059669", lightColor: "#ecfdf5", borderColor: "#a7f3d0" },

  { color: "#65a30d", lightColor: "#f7fee7", borderColor: "#d9f99d" },

  { color: "#be123c", lightColor: "#fff1f2", borderColor: "#fecdd3" },

  { color: "#9333ea", lightColor: "#faf5ff", borderColor: "#e9d5ff" },

  { color: "#ca8a04", lightColor: "#fefce8", borderColor: "#fef08a" },

];



/* =========================================================



   LIVE COMPLAINT DATA



========================================================= */



// Complaint records are loaded from Supabase at runtime.

const normalizeMatch = (value: unknown) =>
  String(value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-ZA");

// Canonical database names plus legacy labels retained for historical records.
const departmentAliases: Record<string, string[]> = {
  "Environmental & Waste Management": [
    "Environmental and Waste",
    "Environmental and Waste Management",
    "Environmental Management & Waste",
  ],
};

const sectionAliases: Record<string, string[]> = {
  // Approved Technical Services labels with legacy database names retained
  // so existing complaint records continue to appear in the correct queues.
  Electrical: ["Electricity", "Electrical Services", "Electricity Services"],
  "Water Supply": [
    "Water Infrastructure",
    "Water Services",
    "Water and Sanitation",
    "Water",
    "Water Supply Services",
  ],
  "Sanitation and Sewerage": ["Sewer Infrastructure", "Sanitation Services"],
  "Roads and Stormwater": [
    "Roads and Road Maintenance",
    "Roads Maintenance",
    "Road Maintenance",
    "Stormwater and Drainage",
    "Stormwater Drainage",
  ],
  "Human Resources": ["Human Resources (HR)", "HR"],
  "Waste Management": [
    "Waste Removal Complaints",
    "Refuse Collection",
    "Solid Waste Collection",
    "Cleansing and Street Sweeping",
  ],
  "Environmental Management & Compliance": [
    "Environmental Health",
    "Illegal Dumping",
    "Landfill Site Management",
    "Pest and Nuisance Control",
    "Recycling and Waste Minimisation",
  ],
  "Parks, Cemeteries & Open Space Management": [
    "Cemeteries",
    "Parks and Public Open Spaces",
  ],
};


/**
 * Fallback routing for older complaint rows that have a department saved but
 * no section ID/name. This keeps those complaints visible in the correct
 * section queue even when the sections lookup is unavailable to the viewer.
 * It is deliberately only used when the complaint has no usable saved section.
 */
const inferConfiguredSection = (complaint: Record<string, unknown>) => {
  const issueText = normalizeMatch([
    complaint.subject,
    complaint.description,
    complaint.issue,
    complaint.category,
    complaint.complaint_type,
    complaint.subcategory,
  ].filter(Boolean).join(" "));

  const rules: Array<{ section: string; keywords: string[] }> = [
    {
      section: "Water Supply",
      keywords: [
        "no water", "water supply", "water outage", "water interruption",
        "water shortage", "water pressure", "low pressure", "burst pipe",
        "water leak", "water leakage", "water connection", "water service",
      ],
    },
    {
      section: "Sanitation and Sewerage",
      keywords: [
        "sewer", "sewage", "sewerage", "wastewater", "toilet blockage",
        "blocked toilet", "septic", "manhole overflow",
      ],
    },
    {
      section: "Electrical",
      keywords: [
        "electricity", "power outage", "no power", "electrical", "streetlight",
        "street light", "electric cable",
      ],
    },
    {
      section: "Roads and Stormwater",
      keywords: [
        "pothole", "road damage", "road maintenance", "stormwater",
        "road drainage", "culvert", "flooded road",
      ],
    },
  ];

  const match = rules.find((rule) =>
    rule.keywords.some((keyword) => issueText.includes(normalizeMatch(keyword)))
  );

  return match?.section ?? "";
};

// Current approved Emalahleni Local Municipality complaint-routing structure.
// Keep this list aligned with the sections configured in the Supabase catalogue.
const municipalStructure: Array<{ name: string; aliases?: string[]; sections: string[] }> = [
  {
    name: "Technical Services",
    sections: [
      "Electrical",
      "Water Supply",
      "Sanitation and Sewerage",
      "Roads and Stormwater",
    ],
  },
  {
    name: "Environmental & Waste Management",
    aliases: ["Environmental and Waste", "Environmental and Waste Management", "Environmental Management & Waste"],
    sections: [
      "Waste Management",
      "Environmental Management & Compliance",
      "Parks, Cemeteries & Open Space Management",
      "Other",
    ],
  },
  {
    name: "Community Services",
    sections: [
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
  },
  {
    name: "Corporate Services",
    sections: [
      "Youth Development and Training",
      "Human Resources",
    ],
  },
  {
    name: "Finance",
    sections: ["Revenue Protection"],
  },
];

const matchesAlias = (actual: unknown, expected: unknown, aliases: Record<string, string[]>) => {
  const actualName = normalizeMatch(actual);
  const expectedName = normalizeMatch(expected);
  if (actualName === expectedName) return true;
  const canonical = Object.keys(aliases).find((name) =>
    normalizeMatch(name) === expectedName || aliases[name].some((alias) => normalizeMatch(alias) === expectedName)
  );
  return Boolean(canonical && (
    normalizeMatch(canonical) === actualName || aliases[canonical].some((alias) => normalizeMatch(alias) === actualName)
  ));
};





/* =========================================================



   PAGE



========================================================= */



export default function DepartmentsPage() {

  const [departments, setDepartments] = useState<Department[]>([]);

  const [complaints, setComplaints] = useState<Complaint[]>([]);

  const [loadingComplaints, setLoadingComplaints] = useState(true);

  const [complaintsError, setComplaintsError] = useState("");
  const [isCallCentreAgent, setIsCallCentreAgent] = useState(false);
  const [isAdministrator, setIsAdministrator] = useState(false);
  const [expandedDepartments, setExpandedDepartments] = useState<Set<string>>(new Set());

  const supabase = createClient();



  useEffect(() => {

    let active = true;

    async function loadCurrentRole() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !active) return;

      const metadataRole = String(
        user.user_metadata?.access_level ?? user.user_metadata?.role ?? user.app_metadata?.role ?? ""
      ).trim().toLowerCase().replace(/[\s_-]+/g, " ");

      const { data: profile } = await supabase
        .from("profiles")
        .select("access_level, role")
        .eq("id", user.id)
        .maybeSingle();

      const profileRole = String(profile?.access_level ?? profile?.role ?? "")
        .trim().toLowerCase().replace(/[\s_-]+/g, " ");
      const role = profileRole || metadataRole;
      if (active) {
        setIsAdministrator(role === "administrator" || role === "admin" || role === "system administrator");
        setIsCallCentreAgent(
          role === "call centre agent" || role === "call center agent" ||
          role === "call centre agent supervisor" || role === "call center agent supervisor"
        );
      }
    }

    async function loadComplaints() {

      setLoadingComplaints(true);

      setComplaintsError("");



      const [
        { data, error },
        { data: userRows },
        { data: departmentRows },
        { data: sectionRows },
      ] = await Promise.all([
        supabase
          .from("complaints")
          .select("*")
          .order("created_at", { ascending: false }),
        // Assignment stores the official's user ID in complaints.assigned_to.
        supabase.from("users").select("*"),
        supabase.from("departments").select("*"),
        supabase.from("sections").select("*"),
      ]);

      if (!active) return;

      if (error) {

        setComplaintsError(error.message);

        setComplaints([]);

        setLoadingComplaints(false);

        return;

      }



      const users = (userRows ?? []) as any[];
      const departmentLookup = (departmentRows ?? []) as any[];
      const sectionLookup = (sectionRows ?? []) as any[];

      const mapped: Complaint[] = (data ?? []).map((row: any) => {
        const assignedId = String(row.assigned_to ?? "");
        const assignedUser = users.find((user: any) =>
          String(user.id ?? user.user_id ?? user.uuid ?? "") === assignedId
        );
        const assignedName = String(
          row.assigned_to_name ??
          (assignedUser
            ? assignedUser.full_name ?? assignedUser.display_name ??
              [assignedUser.first_name ?? assignedUser.name ?? "", assignedUser.surname ?? assignedUser.last_name ?? ""]
                .filter(Boolean).join(" ") ?? assignedUser.username ?? assignedUser.email
            : "") ??
          ""
        );
        const rawStatus = String(row.status ?? "New");
        const resolvedStatus = assignedId && ["", "New", "Open"].includes(rawStatus)
          ? "Assigned"
          : rawStatus;

        // Complaint rows may store department/section foreign keys rather than
        // their display names. Resolve both IDs before grouping the queues.
        const rawDepartment = String(
          row.department_name ?? row.department ?? row.directorate_name ??
          row.directorate ?? row.department_id ?? row.directorate_id ?? ""
        );
        const rawSection = String(
          row.section_name ?? row.section ?? row.section_id ?? ""
        );
        const sectionRecord = sectionLookup.find((item: any) => {
          const ids = [item.id, item.section_id, item.uuid].filter(Boolean).map(String);
          return ids.includes(rawSection);
        }) ?? sectionLookup.find((item: any) =>
          normalizeMatch(item.name ?? item.section_name ?? item.title) === normalizeMatch(rawSection)
        );
        const resolvedSection = String(
          sectionRecord?.name ?? sectionRecord?.section_name ?? sectionRecord?.title ?? rawSection
        );
        const sectionDepartmentId = String(
          sectionRecord?.department_id ?? sectionRecord?.directorate_id ?? ""
        );
        const sectionDepartmentName = String(
          sectionRecord?.department_name ?? sectionRecord?.department ??
          sectionRecord?.directorate ?? ""
        );
        const departmentRecord = departmentLookup.find((item: any) => {
          const ids = [item.id, item.department_id, item.uuid].filter(Boolean).map(String);
          return ids.includes(rawDepartment) || ids.includes(sectionDepartmentId);
        }) ?? departmentLookup.find((item: any) =>
          [item.name, item.department_name, item.title].some((name: any) =>
            normalizeMatch(name) === normalizeMatch(rawDepartment || sectionDepartmentName)
          )
        );
        let resolvedDepartment = String(
          departmentRecord?.name ?? departmentRecord?.department_name ??
          departmentRecord?.title ?? sectionDepartmentName ?? rawDepartment
        );

        // If the complaint has no resolvable saved section, first try the
        // live Supabase section catalogue, then use the approved routing rules.
        // Example: "No water supply" must appear under Technical Services >
        // Water Supply even when the original complaint row has no section ID.
        if (!resolvedSection || (resolvedSection === rawSection && !sectionRecord)) {
          const inferredConfiguredSection = inferConfiguredSection(row);
          const inferredSection = sectionLookup.find((item: any) =>
            normalizeMatch(item.name ?? item.section_name ?? item.title) ===
            normalizeMatch(inferredConfiguredSection)
          );

          const inferredName = String(
            inferredSection?.name ??
            inferredSection?.section_name ??
            inferredSection?.title ??
            inferredConfiguredSection
          );

          if (inferredName) {
            const inferredDepartmentId = String(
              inferredSection?.department_id ?? inferredSection?.directorate_id ?? ""
            );
            const inferredDepartment = departmentLookup.find((item: any) =>
              [item.id, item.department_id, item.uuid]
                .filter(Boolean)
                .map(String)
                .includes(inferredDepartmentId)
            );

            row.__displaySection = inferredName;
            row.__displayDepartment =
              inferredDepartment?.name ??
              inferredDepartment?.department_name ??
              inferredDepartment?.title ??
              resolvedDepartment ??
              "Technical Services";
          }
        }

        const finalSection = String(row.__displaySection ?? resolvedSection);
        resolvedDepartment = String(row.__displayDepartment ?? resolvedDepartment);

        return {
          databaseId: String(row.id ?? ""),
          id: String(row.reference_number ?? row.reference_no ?? row.id ?? ""),
          subject: String(row.subject ?? "Untitled complaint"),
          department: resolvedDepartment,
          section: finalSection,
          priority: (["Low", "Medium", "High", "Critical"].includes(row.priority)
            ? row.priority
            : "Medium") as Priority,
          status: (["New", "Assigned", "In Progress", "Escalated", "Resolved"].includes(resolvedStatus)
            ? resolvedStatus
            : "New") as Status,

        dateReported: row.date_reported

          ? new Date(row.date_reported).toLocaleDateString("en-ZA", {

              day: "2-digit", month: "short", year: "numeric",

            })

          : row.created_at

            ? new Date(row.created_at).toLocaleDateString("en-ZA", {

                day: "2-digit", month: "short", year: "numeric",

              })

            : "",

        ward: String(row.ward ?? ""),

        complainant: row.is_anonymous

          ? "Anonymous"

          : String(row.full_name ?? row.customer_name ?? row.complainant_name ?? ""),

        description: String(row.description ?? ""),

        assignedTo: assignedName || assignedId,
        accountNumber: String(row.account_number ?? ""),
        contactNumber: row.is_anonymous ? "" : String(row.contact_number ?? row.mobile_number ?? ""),
        email: row.is_anonymous ? "" : String(row.email ?? ""),
        preferredContact: row.is_anonymous ? "None" : String(row.preferred_contact ?? ""),
        address: row.is_anonymous ? "" : String(row.address ?? ""),
        area: String(row.area ?? ""),
        receivedChannel: String(row.received_channel ?? row.reporting_channel ?? ""),
        isAnonymous: Boolean(row.is_anonymous),
        createdAt: row.created_at ? new Date(row.created_at).toLocaleString("en-ZA") : "",
        attachments: [],
        };
      });

      setComplaints(mapped);

      setLoadingComplaints(false);

    }



    async function loadDepartments() {
      const { data: departmentRows, error: departmentError } =
        await supabase.from("departments").select("*");

      if (!active) return;

      if (departmentError) {
        setComplaintsError((current) =>
          current || departmentError.message || "Could not load department configuration."
        );
        setDepartments([]);
        return;
      }

      const rows = (departmentRows ?? []) as any[];
      const mappedDepartments: Department[] = municipalStructure.map((configured, index) => {
        const acceptedNames = [configured.name, ...(configured.aliases ?? [])].map(normalizeMatch);
        const row = rows.find((item: any) =>
          acceptedNames.includes(normalizeMatch(item.name ?? item.department_name ?? item.title))
        );
        const rowId = row ? String(row.id ?? row.department_id ?? row.name ?? index) : `configured-${index}`;

        return {
          id: rowId,
          name: configured.name,
          description: String(row?.description ?? row?.details ?? ""),
          sections: configured.sections,
          ...departmentStyles[index % departmentStyles.length],
        };
      });

      setDepartments(mappedDepartments);
      // Start with every department minimised; users can expand any department when needed.
      setExpandedDepartments(new Set());
    }



    loadCurrentRole();
    loadComplaints();

    loadDepartments();

    return () => { active = false; };

  }, []);





  const [selectedDepartment, setSelectedDepartment] =



    useState<Department | null>(null);



  const [selectedSection, setSelectedSection] =



    useState<string | null>(null);

  const [viewingComplaint, setViewingComplaint] = useState<Complaint | null>(null);
  const [loadingAttachments, setLoadingAttachments] = useState(false);

  const openComplaintDetails = async (complaint: Complaint) => {
    setViewingComplaint(complaint);
    setLoadingAttachments(true);

    // The full complaint row is already loaded from Supabase. Fetch attachments
    // separately so a missing/optional attachments table does not block details.
    try {
      let attachmentRows: any[] = [];
      const byComplaintId = complaint.databaseId
        ? await supabase
            .from("complaint_attachments")
            .select("*")
            .eq("complaint_id", complaint.databaseId)
        : { data: [], error: null };

      if (!byComplaintId.error && byComplaintId.data?.length) {
        attachmentRows = byComplaintId.data;
      } else {
        const byReference = await supabase
          .from("complaint_attachments")
          .select("*")
          .eq("complaint_reference", complaint.id);
        if (!byReference.error && byReference.data) attachmentRows = byReference.data;
      }

      const attachments = attachmentRows.map((row: any) => ({
        fileName: String(row.file_name ?? row.filename ?? row.name ?? "Attached file"),
        url: String(row.public_url ?? row.file_url ?? row.url ?? row.signed_url ?? ""),
        sizeBytes: Number(row.size_bytes ?? row.file_size ?? row.size ?? 0),
        contentType: String(row.content_type ?? row.mime_type ?? row.type ?? ""),
      }));

      setViewingComplaint((current) =>
        current?.databaseId === complaint.databaseId
          ? { ...current, attachments }
          : current
      );
    } catch {
      // Complaint details remain available even when attachments are not configured.
      setViewingComplaint((current) =>
        current?.databaseId === complaint.databaseId
          ? { ...current, attachments: [] }
          : current
      );
    } finally {
      setLoadingAttachments(false);
    }
  };



  const [search, setSearch] = useState("");



  // The three hero actions guide users through the real page workflow.



  const scrollToSection = (id: string) => {



    window.setTimeout(() => {



      document.getElementById(id)?.scrollIntoView({



        behavior: "smooth",



        block: "start",



      });



    }, 100);



  };



  const handleWorkflowStep = (step: "directorate" | "section" | "assign") => {



    const firstDepartment = departments[0];



    if (!firstDepartment) {

      setComplaintsError("No departments are configured in Supabase yet.");

      return;

    }



    if (step === "directorate") {



      scrollToSection("directorates-list");



      return;



    }



    if (step === "section") {



      setSelectedDepartment(firstDepartment);



      setSelectedSection(null);



      setSearch("");



      scrollToSection("sections-panel");



      return;



    }



    setSelectedDepartment(firstDepartment);



    setSelectedSection(firstDepartment.sections[0] ?? null);



    setSearch("");



    scrollToSection("complaint-queue");



  };



  const totalComplaints = complaints.length;



  const newComplaints = complaints.filter(



    (c) => c.status === "New"



  ).length;



  const assignedComplaints = complaints.filter(



    (c) => c.status === "Assigned"



  ).length;



  const inProgressComplaints = complaints.filter(



    (c) => c.status === "In Progress"



  ).length;



  const resolvedComplaints = complaints.filter(



    (c) => c.status === "Resolved"



  ).length;



  const getDepartmentComplaints = (department: string) =>
    complaints.filter((complaint) =>
      matchesAlias(complaint.department, department, departmentAliases)
    );

  const getSectionComplaints = (department: string, section: string) =>
    complaints.filter((complaint) =>
      matchesAlias(complaint.department, department, departmentAliases) &&
      matchesAlias(complaint.section, section, sectionAliases)
    );

  const sectionComplaints = useMemo(() => {



    if (!selectedDepartment) {
      return [];
    }

    // When a directorate is selected, show every complaint routed to it.
    // Selecting a section narrows the same queue to that section only.
    const items = selectedSection
      ? getSectionComplaints(selectedDepartment.name, selectedSection)
      : getDepartmentComplaints(selectedDepartment.name);



    const query = search.toLowerCase().trim();



    if (!query) return items;



    return items.filter((complaint) =>



      [



        complaint.id,



        complaint.subject,



        complaint.ward,



        complaint.complainant,



        complaint.status,



      ]



        .join(" ")



        .toLowerCase()



        .includes(query)



    );



  }, [selectedDepartment, selectedSection, search, complaints]);



  return (



    <div className="min-h-screen bg-[#f7f9f7] text-slate-800">



      <Sidebar isAdministrator={isAdministrator} />



      <main className="min-h-screen pb-12 lg:ml-[264px]">

        <header className="sticky top-0 z-30 flex min-h-[70px] items-center justify-between gap-3 border-b border-slate-200/80 bg-white/95 px-4 shadow-sm backdrop-blur sm:px-6 xl:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="min-w-0">
              <div aria-hidden="true" className="mb-1 flex items-center gap-1.5">
                <span className="h-[3px] w-12 rounded-full bg-yellow-400" />
                <span className="h-[3px] w-5 rounded-full bg-green-800/70" />
              </div>
              <h1 className="mt-1 truncate text-xl font-extrabold tracking-tight text-slate-900">Complaints Management System</h1>
            </div>
          </div>
        </header>

<div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-9 lg:py-8">

          {(loadingComplaints || complaintsError) && (

            <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${

              complaintsError ? "border-red-200 bg-red-50 text-red-700" : "border-green-200 bg-green-50 text-green-800"

            }`}>

              {complaintsError

                ? `Live data could not be loaded: ${complaintsError}`

                : "Loading live complaints from Supabase…"}

            </div>

          )}





          {/* =================================================



              OVERVIEW



          ================================================= */}



          {!selectedDepartment && (



            <>



              <section className="mb-6 rounded-2xl border border-green-100 bg-white px-5 py-5 shadow-sm sm:px-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-green-700">MUNICIPAL DEPARTMENTS</p>
                    <h2 className="mt-1 text-xl font-extrabold text-slate-900">Directorates & Sections</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Browse all directorates and their sections. Select a section to view its complaint queue.
                    </p>
                  </div>
                  <span className="rounded-full bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-800">
                    {departments.length} Directorates
                  </span>
                </div>
              </section>

              <div id="directorates-list" className="space-y-3">
                {departments.map((department) => {
                  const departmentComplaints = getDepartmentComplaints(department.name);
                  const isExpanded = expandedDepartments.has(department.id);
                  return (
                    <section key={department.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                      <div className="flex items-center gap-3 bg-green-50/80 px-4 py-3 sm:px-5">
                        <button
                          type="button"
                          aria-expanded={isExpanded}
                          aria-controls={`department-sections-${department.id}`}
                          onClick={() => setExpandedDepartments((current) => {
                            const next = new Set(current);
                            if (next.has(department.id)) next.delete(department.id);
                            else next.add(department.id);
                            return next;
                          })}
                          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-green-700"
                        >
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-800 text-white"><DepartmentIcon /></span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-bold text-slate-900">{department.name}</span>
                            <span className="mt-0.5 block text-xs text-slate-500">{department.sections.length} sections</span>
                          </span>
                          <span className="mr-2 hidden text-xs font-medium text-green-800 sm:inline">{isExpanded ? "Minimise" : "Expand"}</span>
                          <svg className={`h-5 w-5 shrink-0 text-green-800 transition-transform ${isExpanded ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
                        </button>
                        <div className="shrink-0 text-right">
                          <span className="block text-lg font-extrabold text-green-800">{departmentComplaints.length}</span>
                          <span className="block text-[10px] text-slate-500">Complaints</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => { setSelectedDepartment(department); setSelectedSection(null); setSearch(""); }}
                          className="hidden rounded-lg border border-green-200 bg-white px-3 py-2 text-xs font-semibold text-green-800 transition hover:bg-green-100 sm:inline-flex"
                        >View complaints</button>
                      </div>

                      {isExpanded && (
                        <div id={`department-sections-${department.id}`} className="border-t border-slate-100 p-4 sm:p-5">
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                            {department.sections.map((section) => {
                              const sectionCount = getSectionComplaints(department.name, section).length;
                              return (
                                <button key={`${department.id}-${section}`} type="button"
                                  onClick={() => { setSelectedDepartment(department); setSelectedSection(section); setSearch(""); }}
                                  className="group flex min-h-[54px] items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-left transition hover:border-green-300 hover:bg-green-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700">
                                  <span className="flex min-w-0 items-center gap-2.5">
                                    <span className="h-2 w-2 shrink-0 rounded-full bg-yellow-400" />
                                    <span className="text-xs font-semibold leading-5 text-slate-700 group-hover:text-green-900">{section}</span>
                                  </span>
                                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600 group-hover:bg-green-100 group-hover:text-green-800">{sectionCount}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>

              {!departments.length && !complaintsError && (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
                  <h3 className="text-sm font-bold text-slate-800">No directorates found</h3>
                  <p className="mt-1 text-xs text-slate-500">Check that the departments and sections are configured in Supabase.</p>
                </div>
              )}

            </>



          )}



          {/* =================================================



              DEPARTMENT



          ================================================= */}



          {selectedDepartment && !selectedSection && (



            <>



              <button



                onClick={() => setSelectedDepartment(null)}



                className="flex items-center text-[10px] font-semibold text-[#006b3f] mb-4 hover:underline"



              >



                <ArrowLeftIcon />



                Back to Departments



              </button>



              <div



                className="bg-white rounded-xl p-5 mb-5 border"



                style={{



                  borderColor: selectedDepartment.borderColor,



                }}



              >



                <div className="flex items-start justify-between">



                  <div className="flex items-start">



                    <div



                      className="h-11 w-11 rounded-lg flex items-center justify-center"



                      style={{



                        backgroundColor:



                          selectedDepartment.lightColor,



                        color: selectedDepartment.color,



                      }}



                    >



                      <DepartmentIcon />



                    </div>



                    <div className="ml-3">



                      <h1 className="text-[17px] font-bold text-slate-800">



                        {selectedDepartment.name}



                      </h1>



                    </div>



                  </div>



                  <div className="text-right">



                    <p className="text-[9px] text-slate-400">



                      Total Complaints



                    </p>



                    <p



                      className="text-[24px] font-bold"



                      style={{



                        color: selectedDepartment.color,



                      }}



                    >



                      {



                        getDepartmentComplaints(



                          selectedDepartment.name



                        ).length



                      }



                    </p>



                  </div>



                </div>



              </div>



              <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">



                <SmallStat



                  label="New"



                  value={



                    getDepartmentComplaints(



                      selectedDepartment.name



                    ).filter(



                      (c) => c.status === "New"



                    ).length



                  }



                  className="text-blue-600"



                />



                <SmallStat



                  label="Assigned"



                  value={



                    getDepartmentComplaints(



                      selectedDepartment.name



                    ).filter(



                      (c) => c.status === "Assigned"



                    ).length



                  }



                  className="text-purple-600"



                />



                <SmallStat



                  label="In Progress"



                  value={



                    getDepartmentComplaints(



                      selectedDepartment.name



                    ).filter(



                      (c) => c.status === "In Progress"



                    ).length



                  }



                  className="text-amber-600"



                />



                <SmallStat



                  label="Resolved"



                  value={



                    getDepartmentComplaints(



                      selectedDepartment.name



                    ).filter(



                      (c) => c.status === "Resolved"



                    ).length



                  }



                  className="text-green-600"



                />



              </div>



              <div id="sections-panel" className="scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">



                <div className="px-5 py-4 border-b border-slate-200">



                  <h2 className="text-[13px] font-bold text-slate-800">



                    Sections



                  </h2>



                  <p className="text-[10px] text-slate-500 mt-1">



                    Select a section to view its complaint queue.



                  </p>



                </div>



                <div className="divide-y divide-slate-100">



                  {selectedDepartment.sections.map(



                    (section) => {



                      const sectionItems =



                        getSectionComplaints(



                          selectedDepartment.name,



                          section



                        );



                      const sectionNew =



                        sectionItems.filter(



                          (c) => c.status === "New"



                        ).length;



                      return (



                        <div



                          key={section}



                          className="px-5 py-4 flex items-center justify-between hover:bg-slate-50"



                        >



                          <div className="flex items-center">



                            <div



                              className="h-8 w-8 rounded-lg flex items-center justify-center"



                              style={{



                                backgroundColor:



                                  selectedDepartment.lightColor,



                                color:



                                  selectedDepartment.color,



                              }}



                            >



                              <SectionIcon />



                            </div>



                            <div className="ml-3">



                              <h3 className="text-[11px] font-bold text-slate-700">



                                {section}



                              </h3>



                              <p className="text-[9px] text-slate-400 mt-0.5">



                                {sectionItems.length} complaint



                                {sectionItems.length !== 1



                                  ? "s"



                                  : ""}



                              </p>



                            </div>



                          </div>



                          <div className="flex items-center gap-7">



                            <div className="text-right">



                              <p className="text-[9px] text-slate-400">



                                New



                              </p>



                              <p className="text-[13px] font-bold text-blue-600">



                                {sectionNew}



                              </p>



                            </div>



                            <div className="text-right">



                              <p className="text-[9px] text-slate-400">



                                Total



                              </p>



                              <p className="text-[13px] font-bold text-slate-700">



                                {sectionItems.length}



                              </p>



                            </div>



                            <button



                              onClick={() => {



                                setSelectedSection(



                                  section



                                );



                                setSearch("");



                              }}



                              className="flex items-center gap-1 px-3 py-2 rounded-md bg-green-800 text-white text-[9px] font-semibold transition hover:bg-green-900"



                            >



                              View Complaints



                              <ArrowRightIcon />



                            </button>



                          </div>



                        </div>



                      );



                    }



                  )}



                </div>



              </div>



            </>



          )}



          {/* =================================================



              SECTION QUEUE



          ================================================= */}



          {selectedDepartment && (



            <>



              {selectedSection && (
                <button
                  type="button"
                  onClick={() => setSelectedSection(null)}
                  className="mb-4 flex items-center text-[10px] font-semibold text-[#006b3f] hover:underline"
                >
                  <ArrowLeftIcon />
                  Back to Sections
                </button>
              )}



              <div className="flex items-center justify-between mb-5">



                <div>



                  <p className="text-[9px] text-slate-400 uppercase tracking-wide">



                    {selectedDepartment.name}



                  </p>



                  <h1 className="text-[17px] font-bold text-slate-800 mt-1">



                    {selectedSection || `${selectedDepartment.name} complaints`}



                  </h1>



                  <p className="text-[10px] text-slate-500 mt-1">



                    Complaint queue for this section.



                  </p>



                </div>



                <div className="text-right">



                  <p className="text-[9px] text-slate-400">



                    Section Complaints



                  </p>



                  <p



                    className="text-[22px] font-bold"



                    style={{



                      color: selectedDepartment.color,



                    }}



                  >



                    {



                      getSectionComplaints(



                        selectedDepartment.name,



                        selectedSection ?? ""



                      ).length



                    }



                  </p>



                </div>



              </div>



              <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">



                <SmallStat



                  label="New"



                  value={sectionComplaints.filter(



                    (c) => c.status === "New"



                  ).length}



                  className="text-blue-600"



                />



                <SmallStat



                  label="Assigned"



                  value={sectionComplaints.filter(



                    (c) => c.status === "Assigned"



                  ).length}



                  className="text-purple-600"



                />



                <SmallStat



                  label="In Progress"



                  value={sectionComplaints.filter(



                    (c) => c.status === "In Progress"



                  ).length}



                  className="text-amber-600"



                />



                <SmallStat



                  label="Resolved"



                  value={sectionComplaints.filter(



                    (c) => c.status === "Resolved"



                  ).length}



                  className="text-green-600"



                />



              </div>



              <div className="mb-4 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm shadow-slate-200/40">



                <div className="relative">



                  <SearchIcon />



                  <input



                    value={search}



                    onChange={(e) =>



                      setSearch(e.target.value)



                    }



                    placeholder="Search complaint ID, subject, ward, complainant or status..."



                    className="w-full h-9 pl-9 pr-3 rounded-md border border-slate-200 text-[10px] text-slate-700 outline-none focus:border-[#006b3f]"



                  />



                </div>



              </div>



              <div id="complaint-queue" className="scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">



                <div className="px-5 py-4 border-b border-slate-200">



                  <h2 className="text-[13px] font-bold text-slate-800">



                    Complaint Queue



                  </h2>



                  <p className="text-[9px] text-slate-400 mt-1">



                    {selectedSection
                      ? `Complaints received by ${selectedSection}.`
                      : `All complaints routed to ${selectedDepartment.name}. Select View Details to inspect a complaint before assigning it.`}



                  </p>



                </div>



                {sectionComplaints.length > 0 ? (



                  <div className="overflow-x-auto">



                    <table className="w-full">



                      <thead>



                        <tr className="bg-slate-50 border-b border-slate-200">



                          <th className="text-left px-5 py-3 text-[9px] font-bold uppercase tracking-wide text-slate-400">



                            Complaint



                          </th>



                          <th className="text-left px-3 py-3 text-[9px] font-bold uppercase tracking-wide text-slate-400">



                            Date



                          </th>



                          <th className="text-left px-3 py-3 text-[9px] font-bold uppercase tracking-wide text-slate-400">



                            Ward



                          </th>



                          <th className="text-left px-3 py-3 text-[9px] font-bold uppercase tracking-wide text-slate-400">



                            Priority



                          </th>



                          <th className="text-left px-3 py-3 text-[9px] font-bold uppercase tracking-wide text-slate-400">



                            Status



                          </th>



                          <th className="text-left px-3 py-3 text-[9px] font-bold uppercase tracking-wide text-slate-400">



                            Assigned To



                          </th>



                          <th className="text-right px-5 py-3 text-[9px] font-bold uppercase tracking-wide text-slate-400">



                            Action



                          </th>



                        </tr>



                      </thead>



                      <tbody className="divide-y divide-slate-100">



                        {sectionComplaints.map(



                          (complaint) => (



                            <tr



                              key={complaint.id}



                              className="hover:bg-slate-50"



                            >



                              <td className="px-5 py-3">



                                <p className="text-[10px] font-bold text-[#006b3f]">



                                  {complaint.id}



                                </p>



                                <p className="text-[10px] font-semibold text-slate-700 mt-0.5">



                                  {complaint.subject}



                                </p>



                                <p className="text-[9px] text-slate-400 mt-0.5 max-w-[230px] truncate">



                                  {complaint.description}



                                </p>



                              </td>



                              <td className="px-3 py-3 text-[9px] text-slate-500">



                                {complaint.dateReported}



                              </td>



                              <td className="px-3 py-3 text-[9px] text-slate-600">



                                {complaint.ward}



                              </td>



                              <td className="px-3 py-3">



                                <span



                                  className={`text-[9px] font-semibold ${priorityClass(



                                    complaint.priority



                                  )}`}



                                >



                                  {complaint.priority}



                                </span>



                              </td>



                              <td className="px-3 py-3">



                                <span



                                  className={`text-[9px] font-semibold ${statusClass(



                                    complaint.status



                                  )}`}



                                >



                                  {complaint.status}



                                </span>



                              </td>



                              <td className="px-3 py-3">



                                {complaint.assignedTo ? (



                                  <span className="text-[9px] text-slate-600">



                                    {complaint.assignedTo}



                                  </span>



                                ) : (



                                  <span className="text-[9px] text-slate-400">



                                    Not assigned



                                  </span>



                                )}



                              </td>



                              <td className="px-5 py-3">
                                <div className="flex justify-end gap-2 whitespace-nowrap">
                                  <button
                                    type="button"
                                    onClick={() => void openComplaintDetails(complaint)}
                                    className="inline-flex items-center gap-1 rounded-md bg-green-800 px-2.5 py-1.5 text-[9px] font-semibold text-white transition hover:bg-green-900"
                                  >
                                    <ComplaintIcon />
                                    View Details
                                  </button>
                                  {!isCallCentreAgent && (
                                    <Link
                                      href={`/departments/assign?complaintId=${encodeURIComponent(complaint.databaseId || complaint.id)}`}
                                      className="inline-flex items-center gap-1 rounded-md bg-green-800 px-2.5 py-1.5 text-[9px] font-semibold text-white transition hover:bg-green-900"
                                    >
                                      <AssignIcon />
                                      {complaint.assignedTo ? "Reassign" : "Assign"}
                                    </Link>
                                  )}
                                </div>
                              </td>



                            </tr>



                          )



                        )}



                      </tbody>



                    </table>



                  </div>



                ) : (



                  <div className="py-14 text-center">



                    <div className="mx-auto h-11 w-11 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center">



                      <ComplaintIcon />



                    </div>



                    <h3 className="mt-3 text-[12px] font-semibold text-slate-700">



                      No complaints found



                    </h3>



                    <p className="mt-1 text-[9px] text-slate-400">



                      {loadingComplaints ? "Loading complaints…" : "No complaints from Supabase match this section or search."}



                    </p>



                  </div>



                )}



              </div>



            </>



          )}

          {viewingComplaint && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-3 sm:p-5" role="dialog" aria-modal="true" aria-labelledby="complaint-details-title">
              <div className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
                <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-5 py-4 sm:px-7">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-[#006b3f]">Full captured complaint record</p>
                    <h2 id="complaint-details-title" className="mt-1 text-xl font-bold text-slate-900">{viewingComplaint.id || "Complaint"}</h2>
                    <p className="mt-1 text-sm text-slate-500">{viewingComplaint.subject}</p>
                  </div>
                  <button type="button" onClick={() => setViewingComplaint(null)} aria-label="Close complaint details" className="rounded-lg px-3 py-2 text-lg text-slate-500 hover:bg-slate-100">×</button>
                </div>
                <div className="space-y-6 p-5 sm:p-7">
                  <section>
                    <h3 className="mb-3 text-sm font-bold text-slate-900">Complaint information</h3>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {[
                        ["Reference number", viewingComplaint.id],
                        ["Subject / issue", viewingComplaint.subject],
                        ["Department", viewingComplaint.department],
                        ["Section", viewingComplaint.section],
                        ["Priority", viewingComplaint.priority],
                        ["Status", viewingComplaint.status],
                        ["Reporting channel", viewingComplaint.receivedChannel],
                        ["Date reported", viewingComplaint.dateReported],
                        ["Record created", viewingComplaint.createdAt],
                        ["Ward", viewingComplaint.ward],
                        ["Area", viewingComplaint.area],
                        ["Account number", viewingComplaint.accountNumber],
                        ["Assigned official", viewingComplaint.assignedTo || "Not assigned"],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
                          <p className="mt-1 break-words text-sm font-semibold text-slate-800">{value || "Not provided"}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                  <section>
                    <h3 className="mb-3 text-sm font-bold text-slate-900">Complainant and contact information</h3>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {[
                        ["Reporting anonymously", viewingComplaint.isAnonymous ? "Yes" : "No"],
                        ["Full name", viewingComplaint.isAnonymous ? "Anonymous" : viewingComplaint.complainant],
                        ["Contact number", viewingComplaint.isAnonymous ? "Not collected (anonymous)" : viewingComplaint.contactNumber],
                        ["Email address", viewingComplaint.isAnonymous ? "Not collected (anonymous)" : viewingComplaint.email],
                        ["Preferred contact method", viewingComplaint.preferredContact],
                        ["Address", viewingComplaint.isAnonymous ? "Not collected (anonymous)" : viewingComplaint.address],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-xl border border-slate-100 p-3">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
                          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-800">{value || "Not provided"}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                  <section className="rounded-xl border border-slate-200 p-4">
                    <h3 className="text-sm font-bold text-slate-900">Complaint description / what the complaint entails</h3>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{viewingComplaint.description || "No complaint description was provided."}</p>
                  </section>
                  <section>
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h3 className="text-sm font-bold text-slate-900">Supporting documents and attachments</h3>
                      {loadingAttachments && <span className="text-xs text-slate-500">Loading attachments…</span>}
                    </div>
                    {viewingComplaint.attachments.length ? (
                      <div className="space-y-2">
                        {viewingComplaint.attachments.map((attachment, index) => (
                          <div key={`${attachment.fileName}-${index}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 p-3">
                            <div className="min-w-0">
                              <p className="break-words text-sm font-semibold text-slate-800">{attachment.fileName}</p>
                              <p className="text-xs text-slate-500">{attachment.sizeBytes ? `${(attachment.sizeBytes / 1024).toFixed(1)} KB` : "File size unavailable"}{attachment.contentType ? ` · ${attachment.contentType}` : ""}</p>
                            </div>
                            {attachment.url ? <a href={attachment.url} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-[#006b3f] hover:bg-green-50">View / download</a> : <span className="text-xs text-slate-500">File link unavailable</span>}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">{loadingAttachments ? "Checking for uploaded files…" : "No attachments were uploaded with this complaint."}</p>
                    )}
                  </section>
                </div>
                <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-white px-5 py-4 sm:px-7">
                  <button type="button" onClick={() => setViewingComplaint(null)} className="rounded-lg bg-green-50 px-4 py-2 text-sm font-semibold text-green-800 transition hover:bg-green-100">Close</button>
                  {!isCallCentreAgent && (
                    <Link href={`/departments/assign?complaintId=${encodeURIComponent(viewingComplaint.databaseId)}`} className="inline-flex items-center gap-2 rounded-lg bg-green-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-900">
                      <AssignIcon />
                      {viewingComplaint.assignedTo ? "Reassign complaint" : "Assign complaint"}
                    </Link>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>

      </main>



    </div>



  );



}



/* =========================================================



   SIDEBAR



========================================================= */



function Sidebar({ isAdministrator }: { isAdministrator: boolean }) {
  return (
    <aside className="fixed left-0 top-0 z-30 hidden h-screen w-[264px] flex-col border-r border-green-950 bg-[#14532d] shadow-[8px_0_32px_rgba(15,23,42,0.12)] lg:flex">
      <div className="relative overflow-hidden border-b border-green-100 bg-gradient-to-br from-white via-white to-green-50/90 px-4 py-4">
        <div className="pointer-events-none absolute -right-7 -top-8 h-24 w-24 rounded-full border-[12px] border-green-100/60" />
        <div className="pointer-events-none absolute right-4 top-0 h-1 w-12 rounded-b-full bg-yellow-400" />
        <div className="relative flex items-center gap-3">
          <div className="relative shrink-0">
            <div className="absolute -inset-1 rounded-[20px] bg-gradient-to-br from-yellow-300 via-green-600 to-green-900 opacity-90" />
            <div className="relative flex h-[62px] w-[62px] items-center justify-center rounded-[17px] border-2 border-white bg-white p-1.5 shadow-lg shadow-green-950/10">
              <Image src="/Emalahleni Logo.png" alt="Emalahleni Local Municipality logo" width={56} height={56} className="h-full w-full object-contain" priority />
            </div>
            <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-[3px] border-white bg-yellow-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-extrabold uppercase tracking-[0.2em] text-green-700">Emalahleni</p>
            <p className="mt-0.5 text-[14px] font-black leading-[1.05] tracking-[-0.035em] text-slate-900">Local Municipality</p>
            <div className="mt-2 flex items-center gap-1.5">
              <span className="h-[3px] w-7 rounded-full bg-green-800" />
              <span className="h-[3px] w-3 rounded-full bg-yellow-400" />
              <span className="truncate text-[8px] font-semibold uppercase tracking-[0.11em] text-slate-500">Serving our community</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-[#14532d] px-3 py-5 text-white">
        <div className="mb-3 flex items-center justify-between px-3">
          <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[#FFE082]">Main menu</span>
          <span className="text-[9px] font-semibold text-white/50">01</span>
        </div>
        <nav className="space-y-1">
          <NavItem href="/dashboard" label="Dashboard" icon={<DashboardIcon />} />
          <NavItem href="/complaints" label="Complaints" icon={<ComplaintIcon />} />
          <NavItem href="/departments" label="Departments" icon={<DepartmentIcon />} active />
          <NavItem href="/reports" label="Reports" icon={<ReportIcon />} />
        </nav>

        <div className="mt-7">
          <div className="mb-3 flex items-center justify-between px-3">
            <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[#FFE082]">User Management</span>
            <span className="text-[9px] font-semibold text-white/50">02</span>
          </div>
          <nav className="space-y-1">
            {isAdministrator && (
              <NavItem href="/users" label="Users & Roles" icon={<UsersIcon />} />
            )}
            <NavItem href="/staff" label="Staff" icon={<UsersIcon />} />
            {isAdministrator && (
              <NavItem href="/settings" label="Settings" icon={<SettingsIcon />} />
            )}
          </nav>
        </div>
      </div>
    </aside>
  );
}

/* =========================================================



   COMPONENTS



========================================================= */



function NavItem({



  href,



  label,



  icon,



  active = false,



}: {



  href: string;



  label: string;



  icon: ReactNode;



  active?: boolean;



}) {



  return (



    <Link



      href={href}



      className={`group relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[11px] transition-all duration-200 ${

        active

          ? "bg-white/10 font-bold text-white shadow-sm ring-1 ring-inset ring-white/10"

          : "font-bold text-white/85 hover:bg-white/10 hover:text-white"

      }`}



    >



      {active && (
        <span
          aria-hidden="true"
          className="absolute bottom-2 left-0 top-2 w-[3px] rounded-r-full bg-white"
        />
      )}



      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 transition-colors ${active ? "text-[#FFE082]" : "text-white/70 group-hover:bg-white/15 group-hover:text-[#FFE082]"}`}>

        {icon}

      </span>

      <span className="min-w-0 flex-1">{label}</span>
      <span aria-hidden="true" className={`ml-auto transition-all duration-200 ${active ? "text-white group-hover:translate-x-1" : "translate-x-[-3px] text-white/0 group-hover:translate-x-0 group-hover:text-white"}`}>→</span>



    </Link>



  );



}



function SummaryCard({



  title,



  value,



  icon,



  iconClass,



}: {



  title: string;



  value: number;



  icon: ReactNode;



  iconClass: string;



}) {



  return (



    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/40">



      <div className="flex items-center justify-between">



        <div>



          <p className="text-[9px] text-slate-400">



            {title}



          </p>



          <p className="text-[22px] font-bold text-slate-800 mt-1">



            {value}



          </p>



        </div>



        <div



          className={`h-9 w-9 rounded-lg flex items-center justify-center ${iconClass}`}



        >



          {icon}



        </div>



      </div>



    </div>



  );



}



function SmallStat({



  label,



  value,



  className,



}: {



  label: string;



  value: number;



  className: string;



}) {



  return (



    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">



      <p className="text-[9px] text-slate-400">



        {label}



      </p>



      <p className={`text-[19px] font-bold mt-1 ${className}`}>



        {value}



      </p>



    </div>



  );



}



function priorityClass(priority: Priority) {



  switch (priority) {



    case "Critical":



      return "text-red-600";



    case "High":



      return "text-orange-600";



    case "Medium":



      return "text-amber-600";



    case "Low":



      return "text-green-600";



    default:



      return "text-slate-600";



  }



}



function statusClass(status: Status) {



  switch (status) {



    case "New":



      return "text-blue-600";



    case "Assigned":



      return "text-purple-600";



    case "In Progress":



      return "text-amber-600";



    case "Escalated":



      return "text-red-600";



    case "Resolved":



      return "text-green-600";



    default:



      return "text-slate-600";



  }



}



/* =========================================================



   ICONS



========================================================= */



function DashboardIcon() {



  return (



    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">



      <rect x="3" y="3" width="7" height="7" rx="1" />



      <rect x="14" y="3" width="7" height="7" rx="1" />



      <rect x="3" y="14" width="7" height="7" rx="1" />



      <rect x="14" y="14" width="7" height="7" rx="1" />



    </svg>



  );



}



function ComplaintIcon() {



  return (



    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">



      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 9.4 9.4 0 0 1-4-.9L3 21l1.9-4.5A8.4 8.4 0 0 1 3 11.5 8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5Z" />



      <path d="M8 10h8M8 14h5" />



    </svg>



  );



}



function ServiceIcon() {



  return (



    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">



      <path d="M4 5h16v14H4z" />



      <path d="M8 9h8M8 13h5" />



    </svg>



  );



}



function DepartmentIcon() {



  return (



    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">



      <rect x="3" y="4" width="7" height="16" rx="1" />



      <rect x="14" y="4" width="7" height="16" rx="1" />



      <path d="M6.5 8h.01M6.5 12h.01M6.5 16h.01M17.5 8h.01M17.5 12h.01M17.5 16h.01" />



    </svg>



  );



}



function ReportIcon() {



  return (



    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">



      <path d="M4 19V5" />



      <path d="M4 5h15l-3 4 3 4H4" />



    </svg>



  );



}



function UsersIcon() {



  return (



    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">



      <circle cx="9" cy="8" r="3" />



      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />



      <path d="M16 5.5a3 3 0 0 1 0 5.8M18 14c1.8.9 3 2.8 3 5" />



    </svg>



  );



}



function SettingsIcon() {



  return (



    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">



      <circle cx="12" cy="12" r="3" />



      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 1.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-2.6V20a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1-1.8-1.8.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H6v-2.6h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 1.8-1.8.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V6h2.6v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.8 1.8-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v2.6h-.2a1.7 1.7 0 0 0-1.6 1Z" />



    </svg>



  );



}



function SectionIcon() {



  return (



    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">



      <path d="M4 5h16v14H4z" />



      <path d="M8 9h8M8 13h8M8 17h5" />



    </svg>



  );



}



function SearchIcon() {



  return (



    <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">



      <circle cx="11" cy="11" r="7" />



      <path d="m20 20-4-4" />



    </svg>



  );



}






function ArrowLeftIcon() {



  return (



    <svg className="mr-1" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">



      <path d="M19 12H5M11 18l-6-6 6-6" />



    </svg>



  );



}



function NewIcon() {



  return (



    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">



      <path d="M12 5v14M5 12h14" />



    </svg>



  );



}



function AssignIcon() {



  return (



    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">



      <circle cx="9" cy="8" r="3" />



      <path d="M3 20c0-3.3 2.7-6 6-6" />



      <path d="M16 14v6M13 17h6" />



    </svg>



  );



}



function ProgressIcon() {



  return (



    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">



      <circle cx="12" cy="12" r="9" />



      <path d="M12 7v5l3 2" />



    </svg>



  );



}



function CheckIcon() {



  return (



    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">



      <circle cx="12" cy="12" r="9" />



      <path d="m8 12 2.5 2.5L16 9" />



    </svg>



  );



}